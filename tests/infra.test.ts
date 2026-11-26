import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { AnthropicProvider } from '../packages/connectors/llm/anthropic';
import { HandoffProvider } from '../packages/connectors/llm/handoff';
import { TaskRunner, StagePendingError } from '../packages/connectors/llm/runner';
import { LlmBudgetExceededError, LlmOutputInvalidError, LlmRefusalError, type LlmTask } from '../packages/connectors/llm/types';
import { openDb } from '../packages/persistence/db';
import { Repository } from '../packages/persistence/repository';
import { prepareEdition } from '../packages/orchestrator/prepareEdition';
import { makeWorld } from './helpers';
import { fixturePages, scripts } from './fixtures';

const task: LlmTask<{ q: string }, { answer: string }> = { name: 'test.task', version: 'v1', system: 'sys', output: z.object({ answer: z.string() }), render: (i) => i.q };

function fakeClient(responses: any[]) {
  const calls: any[] = [];
  return {
    calls,
    client: { beta: { messages: { parse: async (params: any) => (calls.push(params), responses.shift()) } } } as any,
  };
}

describe('Claude API adapter (mocked client)', () => {
  it('sends a structured-output request with refusal fallbacks and validates the result', async () => {
    const f = fakeClient([{ stop_reason: 'end_turn', parsed_output: { answer: 'ok' }, content: [], model: 'claude-opus-5-5', usage: {} }]);
    const p = new AnthropicProvider({ client: f.client });
    const r = await p.run(task, { q: 'hi' }, { inputSha256: 'h' });
    expect(r.output.answer).toBe('ok');
    expect(f.calls[0]).toMatchObject({ model: 'claude-opus-5-5', betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', system: 'sys' });
    expect(f.calls[0].output_config.format).toBeDefined();
  });

  it('retries once with validation feedback, then fails closed', async () => {
    const bad = { stop_reason: 'end_turn', parsed_output: { wrong: 1 }, content: [{ type: 'text', text: '{}' }], model: 'm', usage: {} };
    const f = fakeClient([bad, bad]);
    await expect(new AnthropicProvider({ client: f.client }).run(task, { q: 'x' }, { inputSha256: 'h' })).rejects.toBeInstanceOf(LlmOutputInvalidError);
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1].messages.at(-1).content).toMatch(/failed validation/);
  });

  it('surfaces a refusal instead of reading content', async () => {
    const f = fakeClient([{ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [], model: 'm' }]);
    await expect(new AnthropicProvider({ client: f.client }).run(task, { q: 'x' }, { inputSha256: 'h' })).rejects.toBeInstanceOf(LlmRefusalError);
  });
});

describe('session-handoff adapter and task runner', () => {
  it('writes a request, holds, then accepts a schema-valid response recorded with its producer', async () => {
    const dir = mkdtempSync(join(tmpdir(), '012-handoff-'));
    const repo = new Repository(openDb(':memory:'));
    const runner = new TaskRunner(new HandoffProvider(dir), repo);
    await expect(runner.runAll(task, [{ q: 'a' }])).rejects.toBeInstanceOf(StagePendingError);
    const [req] = readdirSync(join(dir, 'no-run'));
    const request = JSON.parse(readFileSync(join(dir, 'no-run', req), 'utf8'));
    expect(request.outputJsonSchema.properties.answer).toBeDefined();
    writeFileSync(join(dir, 'no-run', req.replace('.request.', '.response.')), JSON.stringify({ producedBy: 'test analyst', output: { answer: 'from analyst' } }));
    const [r] = await runner.runAll(task, [{ q: 'a' }]);
    expect(r.output.answer).toBe('from analyst');
    expect(r.meta.model).toBe('test analyst');
    // identical input is served from the recorded call (idempotent resume)
    const again = await runner.run(task, { q: 'a' });
    expect(again.meta.cached).toBe(true);
  });

  it('rejects a response that does not match the schema', async () => {
    const dir = mkdtempSync(join(tmpdir(), '012-handoff-'));
    const repo = new Repository(openDb(':memory:'));
    const runner = new TaskRunner(new HandoffProvider(dir), repo);
    await expect(runner.runAll(task, [{ q: 'b' }])).rejects.toBeInstanceOf(StagePendingError);
    const [req] = readdirSync(join(dir, 'no-run'));
    writeFileSync(join(dir, 'no-run', req.replace('.request.', '.response.')), JSON.stringify({ producedBy: 'x', output: { nope: true } }));
    await expect(runner.runAll(task, [{ q: 'b' }])).rejects.toBeInstanceOf(LlmOutputInvalidError);
  });

  it('enforces the per-run model-call cap (cost discipline)', async () => {
    const w = makeWorld({ pages: fixturePages(), scripts: scripts() });
    const capped = new TaskRunner((w.runner as any).provider, w.repo, { maxCallsPerRun: 3 });
    const r = await prepareEdition({ ...w.ctx, runner: capped }, w.publishing, { localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z' }).catch((e) => e);
    expect(r).toBeInstanceOf(LlmBudgetExceededError);
  });
});

describe('fail-closed orchestration', () => {
  it('a quiet day holds the edition instead of fabricating volume', async () => {
    const w = makeWorld({ pages: fixturePages(), scripts: scripts() });
    const r = await prepareEdition(w.ctx, w.publishing, { localIssueDate: '2026-11-30', asOf: '2026-11-29T22:00:00.000Z', lookbackHours: 72 });
    expect(r.status).toBe('quiet');
    if (r.status === 'quiet') expect(r.issue.state).toBe('HELD_FOR_EVIDENCE');
  });

  it('LLM/source API unavailable: retries within the cap, otherwise fails the run and alerts — no improvised content', async () => {
    const w = makeWorld({ pages: fixturePages(), scripts: scripts({ 'consequence.synthesize': () => { throw new Error('503 overloaded'); } }) });
    await expect(prepareEdition(w.ctx, w.publishing, { localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z' })).rejects.toThrow(/503/);
    const run = w.repo.latestRun('01-ai-economy', '2026-11-26')!;
    expect(run.status).toBe('failed');
    expect(w.repo.listAudit(run.id).some((a) => a.event === 'alert')).toBe(true);
    expect(w.repo.getIssueByDate('01-ai-economy', '2026-11-26')!.content).toBeNull();
    expect(w.repo.getIssueByDate('01-ai-economy', '2026-11-26')!.state).toBe('HELD_FOR_EVIDENCE');
  });

  it('all source adapters failing holds the edition', async () => {
    const w = makeWorld({ pages: {}, scripts: scripts() });
    const r = await prepareEdition(w.ctx, w.publishing, { localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z' });
    expect(r.status).toBe('held');
  });
});

describe('module dependency rules (Architecture §11)', () => {
  const root = join(__dirname, '..', 'packages');
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []));
  const imports = (f: string) => [...readFileSync(f, 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]).filter((s) => s.startsWith('.')).map((s) => relative(root, join(f, '..', s)));
  const rule = (dir: string, forbidden: string[]) => {
    const d = join(root, dir);
    if (!existsSync(d)) return [];
    return files(d).flatMap((f) => imports(f).filter((i) => forbidden.some((x) => i.startsWith(x))).map((i) => `${relative(root, f)} → ${i}`));
  };
  it('signal does not import position or publishing', () => expect(rule('intelligence/signal', ['intelligence/position', 'publishing', 'review'])).toEqual([]));
  it('consequence does not import position, publishing or rendering', () => expect(rule('intelligence/consequence', ['intelligence/position', 'publishing', 'review'])).toEqual([]));
  it('position does not import publishing', () => expect(rule('intelligence/position', ['publishing', 'review'])).toEqual([]));
  it('continuity does not import publishing', () => expect(rule('intelligence/continuity', ['publishing', 'review'])).toEqual([]));
  it('publishing does not import the intelligence engines', () => expect(rule('publishing', ['intelligence', 'review'])).toEqual([]));
});
