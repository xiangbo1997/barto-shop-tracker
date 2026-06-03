import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './lib/env.ts';
import { productsRoute } from './routes/products.ts';
import { ingestRoute } from './routes/ingest.ts';
import { refreshRoute } from './routes/refresh.ts';
import { jobsRoute } from './routes/jobs.ts';
import { sessionsRoute } from './routes/sessions.ts';
import { groupsRoute } from './routes/groups.ts';
import { monitorRoute } from './routes/monitor.ts';
import { startWorker } from './queue/worker.ts';
import { startScheduler } from './queue/scheduler.ts';
import { shutdownBoss } from './queue/jobs.ts';
import { shutdownBrowserPool } from './crawler/browser-pool.ts';

const app = new Hono();
app.use('*', cors());

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    time: new Date().toISOString(),
    llm: env.FEATURE_LLM_ENABLED && Boolean(env.LLM_API_KEY),
    config: {
      defaultTier: env.SCRAPER_DEFAULT_TIER,
      concurrency: env.SCRAPER_CONCURRENCY,
      browserPoolSize: env.SCRAPER_BROWSER_POOL_SIZE,
    },
  })
);

app.route('/products', productsRoute);
app.route('/ingest', ingestRoute);
app.route('/refresh', refreshRoute);
app.route('/jobs', jobsRoute);
app.route('/sessions', sessionsRoute);
app.route('/groups', groupsRoute);
app.route('/monitor', monitorRoute);

await startWorker();
await startScheduler();

const handleShutdown = async () => {
  console.log('[api] shutting down…');
  await shutdownBoss();
  await shutdownBrowserPool();
  process.exit(0);
};
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

console.log(`[api] listening on http://localhost:${env.API_PORT}`);

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};
