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
 *   GET  /                        -> 302 -> /dashboard/memory/00-index.html
 *   GET  /healthz                 -> {ok: true} for the run-loop watchdog
 *   GET  /dashboard/<file>        -> static from <repo>/dashboard/  (legacy dashboard)
 *   GET  /app                     -> Vite/React SPA (index.html no-store)
 *   GET  /app/assets/<hash>       -> immutable, 1y-cache hashed assets
 *   GET  /app/<client-route>      -> SPA fallback -> index.html
 *   GET  /api/memory/<route>      -> JSON, see memory-routes.ts
 *   GET  /api/meta/status         -> aggregate health blob (mirror/matviews/sidecar/server)
 *   *    /api/sim/<path>          -> streaming pass-through to the simulator sidecar
 *   *                             -> 404 JSON
 *
 * Binds 127.0.0.1 only by default. Host-only access — no LAN exposure.
 *
 * NOTE on naming: the Postgres database/role/env are named `claude_usage*` for
 * historical reasons (this dashboard was extracted from a broader usage tracker).
 * They are plain identifiers — renaming is a tracked follow-up, not required to run.
 */
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { createMemoryRouter } from './memory-routes.js';
import { createMetaRouter } from './meta-routes.js';
import { createSidecarProxy } from './sidecar-proxy.js';

const HOST = process.env.TM_DASHBOARD_HOST ?? '127.0.0.1';
const PORT = Number.parseInt(process.env.CLAUDE_USAGE_SERVER_PORT ?? '8503', 10);
const PG_HOST = process.env.CLAUDE_USAGE_PG_HOST ?? '127.0.0.1';
const PG_PORT = Number.parseInt(process.env.CLAUDE_USAGE_PG_PORT ?? '5433', 10);
const PG_DATABASE = process.env.CLAUDE_USAGE_PG_DATABASE ?? 'claude_usage';
const PG_USER = process.env.CLAUDE_USAGE_PG_RO_USER ?? 'claude_usage_ro';
const PG_PASSWORD = process.env.CLAUDE_USAGE_PG_RO_PASSWORD ?? '';

// Simulator sidecar — TM_SIDECAR_URL wins when set; TM_SIDECAR_PORT is the
// port-only override (matches the common case where only the port changes).
const SIDECAR_URL =
  process.env.TM_SIDECAR_URL ??
  `http://127.0.0.1:${process.env.TM_SIDECAR_PORT ?? '8504'}`;

// dist/server/index.js -> dist/server -> dist -> project root -> dashboard/
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/+([A-Za-z]:)/, '$1')), '..', '..');
const DASHBOARD_DIR = path.join(PROJECT_ROOT, 'dashboard');
const WEB_DIST = path.join(PROJECT_ROOT, 'web', 'dist');

function directoryExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Inline 503 body served when /app is requested but web/dist doesn't exist yet
 * (fresh clone before the SPA has been built). Intentionally tiny + zero-dep so
 * the server never depends on a missing build to boot.
 */
const WEB_MISSING_PLACEHOLDER = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>TrueMemory Dashboard — web build missing</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #0b0d10; color: #d7dfe6; padding: 3rem 1.5rem; max-width: 640px; margin: 0 auto; line-height: 1.55; }
  h1 { color: #f2f5f8; margin: 0 0 0.75rem; font-size: 1.4rem; }
  code { background: #1a1e24; padding: 0.15em 0.4em; border-radius: 3px; color: #a3f7bf; font-size: 0.95em; }
  p { margin: 0.6rem 0; }
  .hint { color: #9aa4ad; margin-top: 2.5rem; font-size: 0.9rem; }
  a { color: #5eb3f2; }
</style>
</head>
<body>
  <h1>web build not present — run <code>npm run web:build</code></h1>
  <p>The dashboard SPA can't be served because <code>web/dist</code> hasn't been built yet.</p>
  <p>From the repo root:</p>
  <p><code>cd web &amp;&amp; npm install &amp;&amp; npm run build</code></p>
  <p class="hint">The legacy static dashboard is still available at <a href="/dashboard/memory/00-index.html">/dashboard/memory/00-index.html</a>.</p>
</body>
</html>`;

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
    '/api/meta',
    createMetaRouter(client, { sidecarBaseUrl: SIDECAR_URL, projectRoot: PROJECT_ROOT }),
  );

  // Simulator sidecar pass-through. Hand-rolled stream proxy — SSE at
  // /api/sim/events must flow unbuffered, and we're not paying for a proxy dep.
  app.use('/api/sim', createSidecarProxy(SIDECAR_URL));

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

  // ── /app — the Vite/React SPA ─────────────────────────────────────────────
  // Assets under /app/assets/* are content-hashed and safe to cache forever;
  // everything else (esp. index.html) must be no-store so a fresh deploy is
  // seen on the next request. SPA client routes fall through to a wildcard
  // index.html handler (Express 5 requires NAMED wildcards — bare '*' throws).
  const sendSpaIndex = (_req: Request, res: Response): void => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  };
  const sendMissingWebPlaceholder = (_req: Request, res: Response): void => {
    res
      .status(503)
      .set('Cache-Control', 'no-store')
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(WEB_MISSING_PLACEHOLDER);
  };

  if (directoryExists(WEB_DIST)) {
    console.log(`[server] SPA served from ${WEB_DIST}`);
    // /app (no trailing slash) — hits before express.static, so we bypass the
    // 301 redirect express.static would otherwise emit.
    app.get('/app', sendSpaIndex);
    app.use(
      '/app',
      express.static(WEB_DIST, {
        etag: true,
        lastModified: true,
        cacheControl: false,
        setHeaders: (res, filePath) => {
          // Cross-platform match — Windows sep is '\\', we normalize.
          const normalized = filePath.replace(/\\/g, '/');
          if (normalized.includes('/assets/')) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.set('Cache-Control', 'no-store');
          }
        },
      }),
    );
    // SPA fallback for client-side routes. `*splat` is Express 5's named
    // wildcard syntax — bare '*' throws under path-to-regexp v8.
    app.get('/app/*splat', sendSpaIndex);
  } else {
    console.warn(
      `[server] web/dist not present at ${WEB_DIST} — /app will serve a 503 placeholder. Run \`npm run build\` inside ./web to enable the SPA.`,
    );
    app.get('/app', sendMissingWebPlaceholder);
    app.get('/app/*splat', sendMissingWebPlaceholder);
  }

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
