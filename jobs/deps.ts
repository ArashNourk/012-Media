import { resolve } from 'node:path';
import { HttpFetcher } from '../packages/connectors/http/retrieve';
import { AnthropicProvider } from '../packages/connectors/llm/anthropic';
import { HandoffProvider } from '../packages/connectors/llm/handoff';
import { TaskRunner } from '../packages/connectors/llm/runner';
import type { LlmProvider } from '../packages/connectors/llm/types';
import { OutboxMailer, ResendMailer, type Mailer } from '../packages/connectors/mail/mailer';
import { DEFAULT_SOURCES } from '../packages/connectors/sources/registry';
import { LocalObjectStore } from '../packages/connectors/storage/objectStore';
import type { EngineContext } from '../packages/intelligence/context';
import { openDb } from '../packages/persistence/db';
import { Repository } from '../packages/persistence/repository';
import { PublishingEngine, type PublishingConfig } from '../packages/publishing/engine';

export interface Deps {
  ctx: EngineContext;
  publishing: PublishingEngine;
  mailer: Mailer;
  dataDir: string;
  store: LocalObjectStore;
}

/**
 * Wire concrete adapters from environment configuration.
 *   ENGINE_PROVIDER = anthropic | handoff   (default: anthropic when ANTHROPIC_API_KEY is set, else handoff)
 *   MAILER          = outbox | resend       (default: outbox — the sandbox)
 *   DATA_DIR        = ./var                 (SQLite DB, research store, rendered editions, outbox)
 */
export function createDeps(env: NodeJS.ProcessEnv = process.env): Deps {
  const dataDir = resolve(env.DATA_DIR ?? 'var');
  const db = openDb(resolve(dataDir, 'db', '012.sqlite'));
  const repo = new Repository(db);
  const store = new LocalObjectStore(resolve(dataDir, 'store'));
  const providerName = env.ENGINE_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'handoff');
  const provider: LlmProvider = providerName === 'anthropic' ? new AnthropicProvider() : new HandoffProvider(resolve(dataDir, 'handoff'));
  const runner = new TaskRunner(provider, repo, { maxCallsPerRun: Number(env.MAX_LLM_CALLS_PER_RUN ?? 80) });
  const ctx: EngineContext = { repo, runner, store, fetcher: new HttpFetcher(), sources: DEFAULT_SOURCES, clock: () => new Date() };
  const mailer: Mailer = (env.MAILER ?? 'outbox') === 'resend' ? new ResendMailer() : new OutboxMailer(resolve(dataDir, 'outbox'));
  const cfg: PublishingConfig = {
    siteUrl: env.SITE_URL ?? 'https://zeroonetwo.media',
    editionBaseUrl: env.EDITION_BASE_URL ?? 'https://zeroonetwo.media/e',
    publisherIdentity: env.PUBLISHER_IDENTITY ?? '',
    fromAddress: env.MAIL_FROM ?? '',
    replyTo: env.MAIL_REPLY_TO,
    unsubscribeSecret: env.UNSUBSCRIBE_SECRET ?? '',
    unlistedUrlSecret: env.UNLISTED_URL_SECRET ?? 'dev-only-unlisted-secret',
    testRecipientsOnly: env.TEST_RECIPIENTS_ONLY !== 'false',
  };
  return { ctx, publishing: new PublishingEngine(repo, store, mailer, cfg), mailer, dataDir, store };
}
