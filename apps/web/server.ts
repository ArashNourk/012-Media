import { createDeps } from '../../jobs/deps';
import { startScheduler } from '../../jobs/scheduler';
import { createSiteApp } from './app';
import { createNodeServer } from './node';

/**
 * Single Node process for 012.media: public site + access endpoints, and (when
 * enabled) the in-process scheduler that prepares and sends editions. One
 * process keeps SQLite, the research store and Chromium on the same disk.
 */
const env = process.env;
const deps = createDeps(env);
const handle = createSiteApp({
  repo: deps.ctx.repo,
  store: deps.store,
  access: deps.access,
  cfg: { siteUrl: deps.cfg.siteUrl, contactEmail: deps.cfg.contactEmail, publisherIdentity: deps.cfg.publisherIdentity, formSecret: deps.cfg.formSecret, unsubscribeSecret: deps.cfg.unsubscribeSecret, production: deps.cfg.production },
});

const server = createNodeServer(handle, { trustProxy: env.TRUST_PROXY === 'true' });

const port = Number(env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`[012] 012.media listening on :${port} (site ${deps.cfg.siteUrl}, mailer ${deps.mailer.id}${deps.cfg.production ? ', production' : ''})`);
  if (env.ENABLE_SCHEDULER === 'true') startScheduler(deps, env);
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => server.close(() => process.exit(0)));
