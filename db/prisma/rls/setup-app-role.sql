-- Least-privilege application role that RLS relies on. Run ONCE as a superuser
-- (e.g. `psql "$DATABASE_URL" -f db/prisma/rls/setup-app-role.sql`), set a real
-- password, then point the RUNTIME DATABASE_URL at acp_app. Keep migrations running
-- as the owner/superuser (acp_app is intentionally NOSUPERUSER/NOBYPASSRLS so the
-- tenant_isolation policies actually apply to it).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acp_app') THEN
    CREATE ROLE acp_app LOGIN PASSWORD 'CHANGE_ME' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO acp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO acp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO acp_app;

-- Future tables/sequences created by migrations (owned by the superuser) are granted
-- to acp_app automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO acp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO acp_app;
