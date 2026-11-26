import type { z } from 'zod';

/**
 * A bounded LLM task: one versioned prompt, structured input, a Zod output
 * schema. Engines never accept free text from a model — only outputs that
 * validate against the task schema, which are then checked by deterministic
 * gates.
 */
export interface LlmTask<I, O> {
  name: string;
  version: string;
  system: string;
  output: z.ZodType<O>;
  render(input: I): string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface TaskMeta {
  provider: string;
  model: string;
  promptVersion: string;
  inputSha256: string;
  attempts: number;
  usage?: unknown;
  producedBy?: string;
  cached?: boolean;
}

export interface LlmProvider {
  readonly id: string;
  run<I, O>(task: LlmTask<I, O>, input: I, ctx: { runId?: string; inputSha256: string }): Promise<{ output: O; meta: TaskMeta }>;
}

/** Raised by the session-handoff provider when a task awaits an analyst response. */
export class HandoffPendingError extends Error {
  constructor(
    public task: string,
    public requestPath: string,
    public responsePath: string,
  ) {
    super(`awaiting analyst response for ${task}: write ${responsePath}`);
  }
}

export class LlmBudgetExceededError extends Error {}
export class LlmOutputInvalidError extends Error {}
export class LlmRefusalError extends Error {}
