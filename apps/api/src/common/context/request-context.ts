import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request context carried implicitly so services (audit, logging) can read
 *  the acting principal + correlation id without threading params everywhere. */
export interface RequestContext {
  requestId: string;
  userId?: string;
  orgId?: string;
  role?: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return als.getStore();
}

/** Actor id for audit — the authenticated user, or 'system' for background work. */
export function currentActorId(): string {
  return als.getStore()?.userId ?? 'system';
}
