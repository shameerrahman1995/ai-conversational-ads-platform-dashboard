import { describe, it, expect, vi } from 'vitest';
import { withOrgGuc, APP_ORG_GUC } from '../src/common/tenant/with-org-context';

describe('withOrgGuc', () => {
  it('sets the tenant GUC (parameterized) inside a transaction and runs fn with the tx', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{}]);
    const tx = { $queryRaw: queryRaw };
    const prisma = { $transaction: vi.fn((f: (t: unknown) => unknown) => f(tx)) } as never;

    const out = await withOrgGuc(
      prisma,
      async (t) => {
        expect(t).toBe(tx);
        return 42;
      },
      'org_1',
    );

    expect(out).toBe(42);
    const call = queryRaw.mock.calls[0];
    expect(String(call[0]).includes('set_config')).toBe(true); // template SQL
    expect(call.slice(1)).toContain(APP_ORG_GUC); // GUC name bound as a parameter
    expect(call.slice(1)).toContain('org_1'); // orgId bound as a parameter (no interpolation)
  });

  it('throws when no orgId is provided and none is in context', async () => {
    const prisma = { $transaction: vi.fn() } as never;
    await expect(withOrgGuc(prisma, async () => 1)).rejects.toThrow(/orgId/);
  });
});
