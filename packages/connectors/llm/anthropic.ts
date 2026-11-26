import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { LlmOutputInvalidError, LlmRefusalError, type LlmProvider, type LlmTask } from './types';

export const DEFAULT_MODEL = 'claude-opus-5-5';

/**
 * Claude API provider. Structured outputs are constrained server-side to the
 * task's Zod schema and validated again locally. Server-side refusal
 * fallbacks are enabled ("default" routing). Retries on transient API errors
 * are handled by the SDK (maxRetries); schema-invalid outputs are retried a
 * bounded number of times with the validation error fed back.
 */
export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic';
  private client: Anthropic;

  constructor(
    private opts: { model?: string; maxRetries?: number; validationRetries?: number; client?: Anthropic } = {},
  ) {
    this.client = opts.client ?? new Anthropic({ maxRetries: opts.maxRetries ?? 3 });
  }

  get model(): string {
    return this.opts.model ?? process.env.ENGINE_MODEL ?? DEFAULT_MODEL;
  }

  async run<I, O>(task: LlmTask<I, O>, input: I, ctx: { runId?: string; inputSha256: string }) {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: task.render(input) }];
    const maxAttempts = 1 + (this.opts.validationRetries ?? 1);
    let lastError = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: task.maxTokens ?? 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: task.system,
        messages,
        output_config: { effort: task.effort ?? 'high', format: betaZodOutputFormat(task.output as unknown as z.ZodType) },
      });
      if (response.stop_reason === 'refusal') {
        throw new LlmRefusalError(`${task.name}: model declined (${response.stop_details?.category ?? 'unspecified'})`);
      }
      if (response.stop_reason === 'max_tokens') {
        lastError = 'output truncated at max_tokens';
      } else {
        const parsed = task.output.safeParse(response.parsed_output);
        if (parsed.success) {
          return {
            output: parsed.data,
            meta: {
              provider: this.id,
              model: response.model,
              promptVersion: task.version,
              inputSha256: ctx.inputSha256,
              attempts: attempt,
              usage: response.usage,
            },
          };
        }
        lastError = parsed.error.message;
      }
      messages.push(
        { role: 'assistant', content: response.content.filter((b) => b.type === 'text') },
        { role: 'user', content: `The previous output failed validation: ${lastError}. Return a corrected object that satisfies the schema.` },
      );
    }
    throw new LlmOutputInvalidError(`${task.name}: no valid output after ${maxAttempts} attempts: ${lastError}`);
  }
}
