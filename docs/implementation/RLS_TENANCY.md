# Tenant Isolation — orgId + Row-Level Security

## Delivered in this increment (`v9/phase1-foundation`)
Every tenant child table now carries `orgId` (FK → Organization, indexed), closing the gap
where `Message`, `LeadFieldValue`, `ConsentRecord`, `CampaignVersion`, `AgentVersion` relied only
on a parent join for isolation, and making `DeliveryAttempt.orgId` required. All writers set
`orgId` from the request's tenant scope; reads continue through `scopedWhere(orgId, …)`.

- Migration `20260910230931_org_scope_child_tables` (add nullable → backfill from parent → NOT NULL → FK + index). Applied to `acp`; verified **0 NULL orgIds**; `prisma migrate status` clean.
- App-level scoping is the **primary, mandatory** control and is enforced in code + unit tests.

## Row-Level Security — validated, staged for enablement (NOT yet enforced in-app)
RLS is defense-in-depth **under** the app-level scoping. It was validated end-to-end against the
live Postgres (in a rolled-back transaction, nothing persisted):

**Finding (why RLS is not simply "on"):** the dev/app DB role `shameer` is a **SUPERUSER**
(`rolsuper=t`, `rolbypassrls=t`). **Superusers bypass RLS even with `FORCE ROW LEVEL SECURITY`.**
So enabling RLS while the app connects as a superuser is inert. Enforcement therefore requires a
**dedicated non-superuser application role**.

**Proof (under a `NOSUPERUSER` role — passed):**
- `SET app.current_org_id='orgA'` → SELECT returns only orgA rows; `'orgB'` → only orgB rows.
- Cross-tenant INSERT (orgB context writing an orgA row) → rejected: *"new row violates
  row-level security policy"*.

### Validated policy pattern
```sql
ALTER TABLE "<T>" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "<T>_tenant" ON "<T>"
  USING       ("orgId" = current_setting('app.current_org_id', true))
  WITH CHECK  ("orgId" = current_setting('app.current_org_id', true));
-- (No FORCE needed once the app connects as a non-owner, non-superuser role.)
```

### Enablement checklist (next increment — needs an infra decision)
1. **Create a dedicated app role**: `CREATE ROLE acp_app LOGIN NOSUPERUSER NOBYPASSRLS;` grant
   CRUD on tenant tables + sequences; repoint `DATABASE_URL` at it (superuser stays for migrations).
2. **Set the GUC per unit of work**: a Prisma client extension / `withTenant(orgId, fn)` wrapper
   that runs each request's queries inside a transaction with `SET LOCAL app.current_org_id`,
   sourcing `orgId` from the AsyncLocalStorage request context (already present from Wave 1).
3. **Cover every non-request DB path** (workers, seed, scheduled jobs) so they set the GUC or run
   as a role permitted for maintenance — otherwise default-deny will (correctly) block them.
4. **Add the migration** enabling RLS + policies on the tenant tables.
5. **Integration test** against an ephemeral Postgres: org A cannot read/write org B (read + WITH CHECK).

**Why it is staged, not force-enabled now:** enabling RLS without (1)–(3) either does nothing
(superuser bypass) or breaks every query (unset GUC → default-deny). Introducing a new DB role and
repointing `DATABASE_URL` is an infra decision, so it is proposed rather than applied unilaterally.
