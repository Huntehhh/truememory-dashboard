-- Migration 05 - UMAP themes cache for the MEMORY dashboard "05-themes" view
-- Apply via:
--   docker exec -i truememory-dashboard-pg psql -U claude_usage -d claude_usage \
--     < ./sql/init/05-themes-cache.sql
--
-- Why a cache: UMAP + HDBSCAN over the full embedding corpus is too slow to run
-- on every dashboard poll (~30s for ~10K vectors on this box). The Python
-- scheduler (src/themes/compute_umap.py) reads ~/.truememory/memories.db
-- READ-ONLY, extracts float32 vectors out of the sqlite-vec storage tables,
-- fits UMAP-2D + HDBSCAN, and writes one row per memory into this cache. The
-- Express endpoint /api/memory/themes simply SELECTs from the cache joined
-- against tm_memories - no UMAP at request time.
--
-- The Python scheduler does a FULL recompute every hour (DELETE + INSERT). UMAP
-- coordinates are not stable across runs by design (different random seeds give
-- different layouts), but with random_state=42 the layout is deterministic per
-- corpus, so the dashboard stays visually stable until the corpus actually
-- grows.
--
-- Idempotent: IF NOT EXISTS everywhere. Safe to re-run on a fresh container.

-- ============================================================================
-- tm_themes_cache - one row per memory that has an embedding
-- ============================================================================
CREATE TABLE IF NOT EXISTS tm_themes_cache (
    memory_id      BIGINT PRIMARY KEY REFERENCES tm_memories(id) ON DELETE CASCADE,
    x              DOUBLE PRECISION NOT NULL,
    y              DOUBLE PRECISION NOT NULL,
    cluster_label  INTEGER NOT NULL,          -- HDBSCAN label; -1 = noise
    cluster_name   TEXT NULL,                 -- derived from majority category in the cluster
    computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_themes_cache_cluster
    ON tm_themes_cache (cluster_label);
CREATE INDEX IF NOT EXISTS idx_tm_themes_cache_computed
    ON tm_themes_cache (computed_at);

-- ============================================================================
-- Grants - keep claude_usage_ro readable post-migration
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_usage_ro') THEN
        GRANT SELECT ON tm_themes_cache TO claude_usage_ro;
    END IF;
END
$$;
