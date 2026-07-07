/**
 * Express router for /api/memory/* — the MEMORY dashboard tab backend.
 *
 * Conventions match createUsageRouter in routes.ts:
 *   - GET only
 *   - Cache-Control: no-store
 *   - { window_days, data } envelope on every response (windowed endpoints)
 *   - { data } envelope on parameterless endpoints
 *   - On error: status 500 + { error: <message> } only (no stack traces)
 *   - Day/limit params clamped to sane ceilings
 */
import express, { type Request, type Response, type Router } from 'express';
import type { Client, Pool } from 'pg';
// M4: PgRunner allows this router to accept either a bare Client or a Pool.
type PgRunner = Pick<Client, 'query'> | Pool;
import {
  getMemoryKpi,
  getMemoryFeed,
  getMemoryFeedCategories,
  getMemoryByCategory,
  getMemoryAging,
  getMemoryThemes,
  getMemoryThemeTiers,
  getMemoryOperations,
  getMemoryEncodingGate,
  getMemoryOpsRich,
  getMemoryGateRich,
  getMemoryOpenLoops,
  getMemoryDecayPanels,
  getMemoryActivity,
  getMemoryInjections,
  getMemoryInspect,
} from './queries/index.js';
import { parseClampInt, noStore, fail } from './route-helpers.js';

export function createMemoryRouter(client: PgRunner): Router {
  const router = express.Router();

  router.get('/kpi', async (_req: Request, res: Response) => {
    try {
      const data = await getMemoryKpi(client);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/feed', async (req: Request, res: Response) => {
    try {
      const limit = parseClampInt(req.query.limit, 200, 1, 1000);
      // Optional ?category= filter. Validate: string, max 32 chars, no special chars.
      const rawCat = req.query.category;
      let category: string | undefined;
      if (typeof rawCat === 'string' && rawCat.length > 0) {
        const trimmed = rawCat.trim().slice(0, 32);
        // Allow only alphanumeric + hyphen + underscore + parens (covers "(uncategorized)")
        if (/^[\w\-()]+$/.test(trimmed)) {
          category = trimmed;
        }
      }
      const data = await getMemoryFeed(client, limit, category);
      noStore(res);
      res.json({ limit, category: category ?? null, data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/feed-categories', async (_req: Request, res: Response) => {
    try {
      const data = await getMemoryFeedCategories(client);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/by-category', async (req: Request, res: Response) => {
    try {
      const days = parseClampInt(req.query.days, 30, 1, 365);
      const data = await getMemoryByCategory(client, days);
      noStore(res);
      res.json({ window_days: days, data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/aging', async (_req: Request, res: Response) => {
    try {
      const data = await getMemoryAging(client);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/themes', async (req: Request, res: Response) => {
    try {
      // ?tier=<name> filters the UMAP scatter to one embedding tier
      // (edge vs pro). Validate same as the category filter: short string,
      // safe charset only. Empty or 'all' falls through to default tier.
      const rawTier = req.query.tier;
      let tier: string | null = null;
      if (typeof rawTier === 'string') {
        const trimmed = rawTier.trim().slice(0, 32);
        if (/^[A-Za-z0-9_\-]*$/.test(trimmed) && trimmed && trimmed !== 'all') {
          tier = trimmed;
        }
      }
      const data = await getMemoryThemes(client, tier);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/theme-tiers', async (_req: Request, res: Response) => {
    try {
      const data = await getMemoryThemeTiers(client);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/operations', async (_req: Request, res: Response) => {
    try {
      const data = await getMemoryOperations(client);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/encoding-gate', async (_req: Request, res: Response) => {
    try {
      const data = await getMemoryEncodingGate(client);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  // --- Rich-shape aliases for the dashboard frontend (added 2026-05-21).
  // The simple /operations + /encoding-gate paths stay for API consumers;
  // these /ops + /gate + /open-loops match what render-memory.js fetches.

  router.get('/ops', async (_req: Request, res: Response) => {
    try {
      const data = await getMemoryOpsRich(client);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/gate', async (_req: Request, res: Response) => {
    try {
      const data = await getMemoryGateRich(client);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/open-loops', async (_req: Request, res: Response) => {
    try {
      const data = await getMemoryOpenLoops(client);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/decay-panels', async (_req: Request, res: Response) => {
    try {
      const data = await getMemoryDecayPanels(client);
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/activity', async (req: Request, res: Response) => {
    try {
      const days = parseClampInt(req.query.days, 84, 1, 365);
      const data = await getMemoryActivity(client, days);
      noStore(res);
      res.json({ window_days: days, data });
    } catch (err) {
      fail(res, err);
    }
  });

  // Injection feed — recent memory-inject / hook events mirrored from
  // ~/.truememory/injections.log into tm_injections by the mirror.
  router.get('/injections', async (req: Request, res: Response) => {
    try {
      const limit = parseClampInt(req.query.limit, 50, 1, 500);
      const data = await getMemoryInjections(client, limit);
      noStore(res);
      res.json({ limit, data });
    } catch (err) {
      fail(res, err);
    }
  });

  // Inspect a single memory — returns memory + connections (entities, causal
  // edges, fact timeline, landmarks, cluster) + top-10 nearest neighbors.
  // ?vector=1 additionally returns the raw L2-normalized embedding.
  router.get('/inspect/:id', async (req: Request, res: Response) => {
    try {
      const idRawUnknown = req.params.id;
      const idRaw = typeof idRawUnknown === 'string' ? idRawUnknown : '';
      const id = Number.parseInt(idRaw, 10);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      const includeVector = req.query.vector === '1';
      const data = await getMemoryInspect(client, id, { includeVector });
      if (!data || !data.memory) {
        res.status(404).json({ error: 'memory not found' });
        return;
      }
      noStore(res);
      res.json({ data });
    } catch (err) {
      fail(res, err);
    }
  });

  return router;
}
