/**
 * Read-only HTTP server for the TrueMemory dashboard.
 *
 * Architecture choice — this is its own process, NOT bundled into the mirror.
 * The mirror opens its pg connection as `claude_usage` (writer); the server
 * opens its connection as `claude_usage_ro` (SELECT-only). Defense in depth:
 * even if a query layer regression introduces SQL injection, the role itself
 * cannot mutate anything.
 *
 * Surface:
 *   GET /                         -> 302 -> /dashboard/memory/00-index.html
 *   GET /dashboard/<file>         -> static from <repo>/dashboard/
 *   GET /api/memory/<route>       -> JSON, see memory-routes.ts
 *   GET /healthz                  -> {ok: true} for the run-loop watchdog
 *   *                              -> 404 JSON
 *
 * Binds 127.0.0.1 only by default. Host-only access — no LAN exposure.
 *
 * NOTE on naming: the Postgres database/role/env are named `claude_usage*` for
 * historical reasons (this dashboard was extracted from a broader usage tracker).
 * They are plain identifiers — renaming is a tracked follow-up, not required to run.
 */
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { Pool } from 'pg';
import { createMemoryRouter } from './memory-routes.js';

const HOST = process.env.TM_DASHBOARD_HOST ?? '127.0.0.1';
const PORT = Number.parseInt(process.env.CLAUDE_USAGE_SERVER_PORT ?? '8503', 10);
const PG_HOST = process.env.CLAUDE_USAGE_PG_HOST ?? '127.0.0.1';
const PG_PORT = Number.parseInt(process.env.CLAUDE_USAGE_PG_PORT ?? '5433', 10);
const PG_DATABASE = process.env.CLAUDE_USAGE_PG_DATABASE ?? 'claude_usage';
const PG_USER = process.env.CLAUDE_USAGE_PG_RO_USER ?? 'claude_usage_ro';
const PG_PASSWORD = process.env.CLAUDE_USAGE_PG_RO_PASSWORD ?? '';

// dist/server/index.js -> dist/server -> dist -> project root -> dashboard/
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/+([A-Za-z]:)/, '$1')), '..', '..');
const DASHBOARD_DIR = path.join(PROJECT_ROOT, 'dashboard');

async function main(): Promise<void> {
  if (!PG_PASSWORD) {
    console.error(
      '[server] CLAUDE_USAGE_PG_RO_PASSWORD env var is required (read-only role for the dashboard)',
    );
    process.exit(1);
  }

  // Pool instead of single Client — built-in lazy reconnect on pg drop,
  // idle connection timeout, and a small connection queue. Pool.query() has the
  // same signature as Client.query(), so all downstream callers are unaffected.
  const client = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    database: PG_DATABASE,
    user: PG_USER,
    password: PG_PASSWORD,
    max: 4,
    idleTimeoutMillis: 30_000,
  });
  // Pool emits 'error' on background client errors (e.g. idle connection
  // dropped by pg). Without a listener the process crashes with an opaque stack.
  // The pool handles reconnection itself; logging + continuing is correct here.
  client.on('error', (err) => {
    console.error('[server] pg pool client error:', err);
  });
  console.log(`[server] connected to postgres ${PG_HOST}:${PG_PORT}/${PG_DATABASE} as ${PG_USER}`);

  const app = express();
  // CORS — allow same-origin AND file:// (origin: null) so you can double-click the HTML.
  app.use(
    cors({
      origin: (origin, callback) => callback(null, true),
      methods: ['GET'],
    }),
  );

  app.get('/', (_req: Request, res: Response) => {
    res.redirect(302, '/dashboard/memory/00-index.html');
  });

  app.get('/healthz', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.use('/api/memory', createMemoryRouter(client));

  app.use(
    '/dashboard',
    express.static(DASHBOARD_DIR, {
      etag: false,
      lastModified: false,
      cacheControl: false,
      setHeaders: (res) => {
        res.set('Cache-Control', 'no-store');
      },
    }),
  );

  // Clean JSON 404 for anything else.
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'not found', path: req.path });
  });

  const server = app.listen(PORT, HOST, () => {
    console.log(`[server] listening on http://${HOST}:${PORT}`);
    console.log(`[server] dashboard served from ${DASHBOARD_DIR}`);
  });

  const shutdown = async (sig: string): Promise<void> => {
    console.log(`[server] received ${sig}, draining...`);
    server.close(() => {
      void client.end().then(() => process.exit(0));
    });
    // Hard exit guard if close hangs.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
