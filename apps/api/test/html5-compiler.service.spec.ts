import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import type { CreativeManifest } from '@acp/shared-types';
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

function manifest(overrides: Partial<CreativeManifest> = {}): CreativeManifest {
  return {
    creativeId: 'cr_1',
    tenantId: 'tn_1',
    productId: 'Acme Widget',
    agentId: 'ag_1',
    size: { width: 300, height: 250 },
    mode: 'interactive_ai',
    features: { textChat: true, voice: 'off', gallery: false, leadCapture: true },
    allowedActions: ['show_specs', 'capture_lead', 'open_url'],
    edgeApiBase: 'https://edge.example.com',
    signedCreativeToken: 'public.creative.token',
    ...overrides,
  };
}

const copy = {
  productName: 'Acme Widget',
  hook: 'Meet the Acme Widget',
  subhead: 'Fast and friendly',
  finalUrl: 'https://acme.example.com/landing',
};

describe('Html5CompilerService.compileBundle', () => {
  it('compiles a real ZIP for google_ads -> compiled + returns base64 + files', async () => {
    const d = deps();
    const out = await make(d).compileBundle('org_1', 'v1', {
      template: 'standard_banner',
      network: 'google_ads',
      manifest: manifest(),
      copy,
    });
    expect(out.status).toBe('compiled');
    expect(out.ok).toBe(true);
    expect(out.files.map((f) => f.name)).toEqual(['index.html', 'styles.css', 'app.js', 'manifest.json']);
    expect(out.zipBytes).toBeGreaterThan(0);
    expect(out.zipBytes).toBeLessThan(600_000);
    expect(typeof out.zipBase64).toBe('string');

    // The returned base64 is a real, readable ZIP.
    const zip = await JSZip.loadAsync(Buffer.from(out.zipBase64 as string, 'base64'));
    const idx = await zip.file('index.html')!.async('string');
    expect(idx).toContain('ad.size');
    const persisted = d.prisma.creativeVariant.update.mock.calls[0][0];
    expect(persisted.data.status).toBe('compiled');
    expect(persisted.data.manifest.html5Bundle.zipBase64).toBe(out.zipBase64);
  });

  it('flags an interactive (edge-calling) creative on tiktok -> validation_failed, no base64', async () => {
    const d = deps();
    const out = await make(d).compileBundle('org_1', 'v1', {
      template: 'playable_basic',
      network: 'tiktok',
      manifest: manifest(),
      copy,
    });
    expect(out.status).toBe('validation_failed');
    expect(out.ok).toBe(false);
    expect(out.validation.issues.some((i) => i.code === 'external_request')).toBe(true);
    expect(out.zipBase64).toBeNull();
  });

  it('rejects a template not in the allowlist', async () => {
    const d = deps();
    await expect(
      make(d).compileBundle('org_1', 'v1', {
        template: 'arbitrary',
        network: 'google_ads',
        manifest: manifest(),
        copy,
      }),
    ).rejects.toThrow();
  });

  it('404 when the variant is missing/other-org', async () => {
    const d = deps({ variant: null });
    await expect(
      make(d).compileBundle('org_1', 'x', {
        template: 'standard_banner',
        network: 'google_ads',
        manifest: manifest(),
        copy,
      }),
    ).rejects.toThrow();
  });
});
