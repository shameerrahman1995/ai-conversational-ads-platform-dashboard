-- Self-contained RLS verification against the REAL tenant tables. Creates a
-- throwaway non-superuser role inside a transaction, pins one org via the GUC, and
-- proves that (a) only that org's rows are visible and (b) nothing leaks. Everything
-- is rolled back — no persistent change. Run: psql "$DATABASE_URL" -f verify-rls.sql
BEGIN;
CREATE ROLE rls_verify NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO rls_verify;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO rls_verify;

SELECT id FROM "Organization" ORDER BY id LIMIT 1 \gset

\echo '=== Total campaigns across all orgs (superuser view) ==='
SELECT count(*) AS total_all_orgs FROM "Campaign";

SET ROLE rls_verify;
SELECT set_config('app.current_org_id', :'id', true);

\echo '=== Visible to the pinned org under RLS (should be that org only) ==='
SELECT count(*) AS visible_for_pinned_org FROM "Campaign";

\echo '=== Cross-tenant leak (MUST be 0) ==='
SELECT count(*) AS leaked_other_orgs FROM "Campaign" WHERE "orgId" <> :'id';

RESET ROLE;
ROLLBACK;
