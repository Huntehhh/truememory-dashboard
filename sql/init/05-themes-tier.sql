-- 08-themes-tier.sql
-- Adds tier-awareness to tm_themes_cache so the themes UMAP scheduler can
-- store layouts for multiple TrueMemory tiers side-by-side (edge / pro / etc.)
-- The dashboard then filters via /api/memory/themes?tier=<name>.
--
-- Backwards compatible: existing rows get tier='pro' (the active tier at
-- migration time). The compute_umap.py scheduler will overwrite them on
-- next tick with fresh tier-tagged data.

BEGIN;

-- Add the column with a default so existing rows are valid.
ALTER TABLE tm_themes_cache
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'pro';

-- Composite primary key (memory_id, tier) so the same memory can appear
-- once per tier without conflicts.
ALTER TABLE tm_themes_cache
  DROP CONSTRAINT IF EXISTS tm_themes_cache_pkey;

ALTER TABLE tm_themes_cache
  ADD CONSTRAINT tm_themes_cache_pkey PRIMARY KEY (memory_id, tier);

-- Index on tier for the chip-bar query (GROUP BY tier).
CREATE INDEX IF NOT EXISTS idx_tm_themes_cache_tier ON tm_themes_cache(tier);

COMMIT;
