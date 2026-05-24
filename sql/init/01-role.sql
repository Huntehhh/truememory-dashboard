-- Init 01 — Read-only role for the dashboard server (defense in depth)
-- ============================================================================
-- The mirror/refresh processes connect as the writer role `claude_usage`
-- (the POSTGRES_USER created by the container). The dashboard server connects
-- as `claude_usage_ro` (SELECT-only) so a query-layer regression can never
-- mutate data.
--
-- NOTE on naming: db/role are named `claude_usage*` for historical reasons.
-- They are plain identifiers; the env vars (CLAUDE_USAGE_PG_*) match them.
-- Renaming is a tracked follow-up, not required to run.
--
-- The bootstrap password 'changeme-readonly' MUST be rotated on first init:
--   docker exec truememory-dashboard-pg psql -U claude_usage -d claude_usage \
--     -c "ALTER ROLE claude_usage_ro WITH PASSWORD '<CLAUDE_USAGE_PG_RO_PASSWORD>';"
-- The matching value lives in your .env as CLAUDE_USAGE_PG_RO_PASSWORD.
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_usage_ro') THEN
        CREATE ROLE claude_usage_ro WITH LOGIN PASSWORD 'changeme-readonly';
        GRANT CONNECT ON DATABASE claude_usage TO claude_usage_ro;
        GRANT USAGE ON SCHEMA public TO claude_usage_ro;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_usage_ro;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO claude_usage_ro;
    END IF;
END
$$;
