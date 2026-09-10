-- Row-Level Security: enable RLS + a tenant-isolation policy on every table that
-- carries an "orgId" column, keyed on the per-request GUC `app.current_org_id`.
--
-- Enforcement is defense-in-depth UNDER the mandatory application-level scopedWhere.
-- It is inert for a SUPERUSER or table-owner connection (Postgres bypasses RLS for
-- them), so applying this migration does NOT change behavior for the current
-- superuser DATABASE_URL. It begins enforcing when the app connects as the
-- least-privilege `acp_app` role (db/prisma/rls/setup-app-role.sql) with the GUC set
-- per unit of work (apps/api/src/common/tenant/with-org-context.ts). FORCE is
-- intentionally NOT set: once the app connects as a non-owner role, RLS already
-- applies, and leaving owner/superuser able to bypass keeps migrations + maintenance
-- working.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'orgId'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ("orgId" = current_setting(''app.current_org_id'', true)) '
      'WITH CHECK ("orgId" = current_setting(''app.current_org_id'', true))',
      t
    );
  END LOOP;
END $$;
