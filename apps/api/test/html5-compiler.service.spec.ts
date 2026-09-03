import { describe, it, expect, vi } from 'vitest';
import { Html5CompilerService } from '../src/modules/creative/html5-compiler.service';

function deps(opts: { variant?: any } = {}) {
  const prisma = {
    creativeVariant: {
      findFirst: vi.fn().mockResolvedValue('variant' in opts ? opts.variant : { id: 'v1', orgId: 'org_1' }),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  return { prisma, audit };
}

function make(d: ReturnType<typeof deps>) {
  return new Html5CompilerService(d.prisma, d.audit);
}

describe('Html5CompilerService', () => {
  it('rejects a template not in the allowlist', async () => {
    const d = deps();
    await expect(
      make(d).compile('org_1', 'v1', { template: 'arbitrary', html: '<div></div>', network: 'meta' }),
    ).rejects.toThrow();
  });

  it('compiles a clean bundle -> compiled + stores CSP/sandbox manifest', async () => {
    const d = deps();
    const out = await make(d).compile('org_1', 'v1', {
      template: 'standard_banner',
      html: '<div>hi</div>',
      network: 'meta',
    });
    expect(out.status).toBe('compiled');
    expect(out.csp).toContain("default-src 'none'");
    expect(d.prisma.creativeVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'v1', orgId: 'org_1' }, data: expect.objectContaining({ status: 'compiled' }) }),
    );
  });

  it('rejects unsafe html -> validation_failed', async () => {
    const d = deps();
    const out = await make(d).compile('org_1', 'v1', {
      template: 'playable_basic',
      html: '<script>eval("x")</script>',
      network: 'tiktok',
    });
    expect(out.status).toBe('validation_failed');
    expect(out.issues.length).toBeGreaterThan(0);
  });

  it('404 when the variant is missing/other-org', async () => {
    const d = deps({ variant: null });
    await expect(
      make(d).compile('org_1', 'x', { template: 'standard_banner', html: '<div></div>', network: 'meta' }),
    ).rejects.toThrow();
  });
});
