import { PrismaClient, Prisma } from '@acp/db';
import { getContext } from '../context/request-context';

/** Postgres GUC the RLS `tenant_isolation` policies read (see db migration + rls/). */
export const APP_ORG_GUC = 'app.current_org_id';

/**
 * Run `fn` inside a transaction with the RLS tenant GUC (`app.current_org_id`) set,
 * so Row-Level Security scopes every query in the unit of work to `orgId`.
 *
 * Enforcement is active only when the runtime connects as the least-privilege,
 * NOBYPASSRLS `acp_app` role (db/prisma/rls/setup-app-role.sql). Under a superuser or
 * table-owner connection this just sets a harmless transaction-local variable, so it
 * is safe to adopt incrementally before the DATABASE_URL flip. `orgId` defaults to
 * the current request context's org. The value is bound as a parameter (never string
 * interpolation) so it cannot be used for SQL injection.
 */
export async function withOrgGuc<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  orgId?: string,
): Promise<T> {
  const org = orgId ?? getContext()?.orgId;
  if (!org) throw new Error('withOrgGuc requires an orgId (none provided and none in request context)');
  return prisma.$transaction(async (tx) => {
    // Parameterized + transaction-local (third arg true): scoped to this transaction.
    await tx.$queryRaw`SELECT set_config(${APP_ORG_GUC}, ${org}, true)`;
    return fn(tx);
  });
}
