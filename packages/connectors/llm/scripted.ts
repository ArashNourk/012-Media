import { LlmOutputInvalidError, type LlmProvider, type LlmTask } from './types';

/**
 * Deterministic provider for tests: each task name maps to a function that
 * returns the model output. Outputs still pass through schema validation.
 */
export class ScriptedProvider implements LlmProvider {
  readonly id = 'scripted-test';
  calls: { task: string; input: unknown }[] = [];
  constructor(private scripts: Record<string, (input: any) => unknown>) {}

  async run<I, O>(task: LlmTask<I, O>, input: I, ctx: { runId?: string; inputSha256: string }) {
    this.calls.push({ task: task.name, input });
    const fn = this.scripts[task.name];
    if (!fn) throw new Error(`no script for task ${task.name}`);
    const parsed = task.output.safeParse(fn(input));
    if (!parsed.success) throw new LlmOutputInvalidError(`${task.name}: ${parsed.error.message}`);
    return { output: parsed.data, meta: { provider: this.id, model: 'scripted', promptVersion: task.version, inputSha256: ctx.inputSha256, attempts: 1 } };
  }
}
