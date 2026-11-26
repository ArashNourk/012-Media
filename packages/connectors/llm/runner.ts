import { canonicalJson, sha256 } from '../../contracts';
import type { Repository } from '../../persistence/repository';
import { HandoffPendingError, LlmBudgetExceededError, type LlmProvider, type LlmTask, type TaskMeta } from './types';

/**
 * Executes bounded tasks for the engines: hashes the structured input,
 * reuses a previously recorded output for an identical (task, version, input)
 * — which makes reruns idempotent and resumable — enforces the per-run call
 * budget (cost cap) and records every call for reproducibility.
 */
export class TaskRunner {
  constructor(
    private provider: LlmProvider,
    private repo: Repository,
    private opts: { maxCallsPerRun: number } = { maxCallsPerRun: Number(process.env.MAX_LLM_CALLS_PER_RUN ?? 80) },
  ) {}

  get providerId(): string {
    return this.provider.id;
  }

  async run<I, O>(task: LlmTask<I, O>, input: I, runId?: string): Promise<{ output: O; meta: TaskMeta }> {
    const inputSha256 = sha256(canonicalJson({ task: task.name, version: task.version, system: task.system, prompt: task.render(input) }));
    const cached = this.repo.db
      .prepare('SELECT output, provider, model, attempts FROM llm_calls WHERE task = ? AND prompt_version = ? AND input_sha256 = ? ORDER BY rowid DESC LIMIT 1')
      .get(task.name, task.version, inputSha256) as { output: string; provider: string; model: string; attempts: number } | undefined;
    if (cached) {
      const parsed = task.output.safeParse(JSON.parse(cached.output));
      if (parsed.success)
        return {
          output: parsed.data,
          meta: { provider: cached.provider, model: cached.model, promptVersion: task.version, inputSha256, attempts: cached.attempts, cached: true },
        };
    }
    if (runId) {
      const run = this.repo.getRun(runId);
      if (run.llmCalls >= this.opts.maxCallsPerRun) throw new LlmBudgetExceededError(`run ${runId} reached its cap of ${this.opts.maxCallsPerRun} model calls`);
    }
    const startedAt = new Date().toISOString();
    let result: { output: O; meta: TaskMeta };
    try {
      result = await this.provider.run(task, input, { runId, inputSha256 });
    } catch (e) {
      if (!(e instanceof HandoffPendingError)) this.repo.audit('engine', 'llm.error', runId, { task: task.name, error: String(e) });
      throw e;
    }
    if (runId) this.repo.incrementLlmCalls(runId);
    this.repo.recordLlmCall({
      runId,
      task: task.name,
      promptVersion: task.version,
      provider: result.meta.provider,
      model: result.meta.model,
      inputSha256,
      output: result.output,
      attempts: result.meta.attempts,
      usage: result.meta.usage,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    return result;
  }

  /**
   * Run several independent tasks. With the handoff provider every pending
   * request is written before the stage holds, so an analyst can answer a
   * whole stage at once.
   */
  async runAll<I, O>(task: LlmTask<I, O>, inputs: I[], runId?: string): Promise<{ output: O; meta: TaskMeta }[]> {
    const settled = await Promise.allSettled(inputs.map((i) => this.run(task, i, runId)));
    const pending = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected' && s.reason instanceof HandoffPendingError);
    if (pending.length) throw new StagePendingError(pending.map((p) => p.reason as HandoffPendingError));
    const failed = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    if (failed) throw failed.reason;
    return settled.map((s) => (s as PromiseFulfilledResult<{ output: O; meta: TaskMeta }>).value);
  }
}

export class StagePendingError extends Error {
  constructor(public pending: HandoffPendingError[]) {
    super(`${pending.length} analysis task(s) awaiting responses:\n${pending.map((p) => `  ${p.responsePath}`).join('\n')}`);
  }
}

/** Wrap single-task pending errors in the stage error so the orchestrator can hold uniformly. */
export async function runOne<I, O>(runner: TaskRunner, task: LlmTask<I, O>, input: I, runId?: string) {
  try {
    return await runner.run(task, input, runId);
  } catch (e) {
    if (e instanceof HandoffPendingError) throw new StagePendingError([e]);
    throw e;
  }
}
