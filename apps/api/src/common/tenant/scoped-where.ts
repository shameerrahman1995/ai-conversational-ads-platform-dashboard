/**
 * Always constrain a query to a single tenant. The caller's orgId overrides any
 * `orgId` present in `where` so a client can never widen scope. The injected key
 * is `orgId` to match the Prisma schema's tenant column on every model.
 */
export function scopedWhere<T extends object>(orgId: string, where?: T): T & { orgId: string } {
  return { ...(where ?? ({} as T)), orgId };
}
