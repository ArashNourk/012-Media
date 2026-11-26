import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { HandoffPendingError, LlmOutputInvalidError, type LlmProvider, type LlmTask } from './types';

/**
 * Session-handoff provider.
 *
 * Used when no Claude API key is configured for the engine. Each bounded task
 * is written as a request file (system prompt, rendered input, JSON schema).
 * An analyst — a human editor, or Claude working in an operator session —
 * writes the matching response file. The response passes through exactly the
 * same schema validation and deterministic gates as an API response, and is
 * recorded with `producedBy` so the audit trail never misrepresents who
 * produced it.
 */
export class HandoffProvider implements LlmProvider {
  readonly id = 'session-handoff';
  constructor(private dir: string) {}

  async run<I, O>(task: LlmTask<I, O>, input: I, ctx: { runId?: string; inputSha256: string }) {
    const folder = join(this.dir, ctx.runId ?? 'no-run');
    mkdirSync(folder, { recursive: true });
    const stem = `${task.name}__${ctx.inputSha256.slice(0, 12)}`;
    const requestPath = join(folder, `${stem}.request.json`);
    const responsePath = join(folder, `${stem}.response.json`);
    if (!existsSync(responsePath)) {
      writeFileSync(
        requestPath,
        JSON.stringify(
          {
            task: task.name,
            promptVersion: task.version,
            inputSha256: ctx.inputSha256,
            system: task.system,
            prompt: task.render(input),
            outputJsonSchema: z.toJSONSchema(task.output as unknown as z.ZodType),
            responseFormat: { producedBy: 'string — who produced this output', output: 'object matching outputJsonSchema' },
          },
          null,
          2,
        ),
      );
      throw new HandoffPendingError(task.name, requestPath, responsePath);
    }
    const raw = JSON.parse(readFileSync(responsePath, 'utf8')) as { producedBy?: string; output?: unknown };
    if (!raw.producedBy) throw new LlmOutputInvalidError(`${responsePath}: missing producedBy`);
    const parsed = task.output.safeParse(raw.output);
    if (!parsed.success) throw new LlmOutputInvalidError(`${responsePath}: ${parsed.error.message}`);
    return {
      output: parsed.data,
      meta: { provider: this.id, model: raw.producedBy, promptVersion: task.version, inputSha256: ctx.inputSha256, attempts: 1, producedBy: raw.producedBy },
    };
  }
}
