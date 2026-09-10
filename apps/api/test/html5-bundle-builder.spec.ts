import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import type { CreativeManifest } from '@acp/shared-types';
import {
  buildCreativeBundle,
  combinedSource,
  renderManifestJson,
  BUNDLE_FILE_ORDER,
  type BundleCopy,
} from '../src/modules/creative/html5/bundle-builder';

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

const copy: BundleCopy = {
  productName: 'Acme Widget',
  hook: 'Meet the Acme Widget',
  subhead: 'Fast, friendly, affordable',
  finalUrl: 'https://acme.example.com/landing',
};

describe('buildCreativeBundle', () => {
  it('produces the four bundle files in stable order', async () => {
    const b = await buildCreativeBundle({ manifest: manifest(), copy });
    expect(Object.keys(b.files)).toEqual([...BUNDLE_FILE_ORDER]);
    expect(b.files['index.html']).toBeTruthy();
    expect(b.files['app.js']).toBeTruthy();
    expect(b.files['styles.css']).toBeTruthy();
    expect(b.files['manifest.json']).toBeTruthy();
    expect(Buffer.isBuffer(b.zip)).toBe(true);
    expect(b.zipBytes).toBe(b.zip.length);
    // Tiny thin creative — comfortably under Google's 600KB limit.
    expect(b.zipBytes).toBeLessThan(600_000);
  });

  it('emits a valid ZIP whose entries match the source files', async () => {
    const b = await buildCreativeBundle({ manifest: manifest(), copy });
    const round = await JSZip.loadAsync(b.zip);
    for (const name of BUNDLE_FILE_ORDER) {
      const entry = round.file(name);
      expect(entry, `missing ${name}`).toBeTruthy();
      const text = await entry!.async('string');
      expect(text).toBe(b.files[name]);
    }
  });

  it('is deterministic — identical inputs give byte-identical ZIPs', async () => {
    const a = await buildCreativeBundle({ manifest: manifest(), copy });
    const c = await buildCreativeBundle({ manifest: manifest(), copy });
    expect(a.zip.equals(c.zip)).toBe(true);
  });

  it('references only local assets (no external/CDN JS or CSS)', async () => {
    const b = await buildCreativeBundle({ manifest: manifest(), copy });
    // Local links only.
    expect(b.files['index.html']).toContain('href="styles.css"');
    expect(b.files['index.html']).toContain('src="app.js"');
    // No external <script src> / <link href> to http(s) URLs.
    expect(/<script[^>]+src\s*=\s*["']https?:\/\//i.test(b.files['index.html'])).toBe(false);
    expect(/<link[^>]+href\s*=\s*["']https?:\/\//i.test(b.files['index.html'])).toBe(false);
    // The clickthrough URL is a data attribute, not an external src/href.
    expect(/(?:\bsrc|\bhref)\s*=\s*["']https?:\/\//i.test(b.files['index.html'])).toBe(false);
  });

  it('manifest.json contains no secrets beyond the public-scope token', async () => {
    const parsed = JSON.parse(renderManifestJson(manifest()));
    // Exactly the manifest — no leaked server-side fields.
    expect(parsed).toEqual(manifest());
    const json = renderManifestJson(manifest());
    expect(/secret|apiKey|api_key|password|clientSecret|privateKey/i.test(json)).toBe(false);
  });

  it('runtime uses fetch + Creative auth but no eval/document.write/device APIs', async () => {
    const js = (await buildCreativeBundle({ manifest: manifest(), copy })).files['app.js'];
    expect(js).toContain('fetch(');
    expect(js).toContain("'Authorization': 'Creative ' + manifest.signedCreativeToken");
    expect(js).toContain('/v1/ad-sessions');
    expect(js).toContain('/messages');
    expect(js).toContain('/lead');
    // Degrade-gracefully fallback path.
    expect(js).toContain('data-final-url');
    expect(/\beval\s*\(/.test(js)).toBe(false);
    expect(/document\.write\s*\(/.test(js)).toBe(false);
    expect(/getUserMedia|navigator\.mediaDevices|navigator\.geolocation/.test(js)).toBe(false);
  });

  it('combined source passes the same shape the static-analysis gate reads', async () => {
    const b = await buildCreativeBundle({ manifest: manifest(), copy });
    const src = combinedSource(b.files);
    expect(src).toContain('<!doctype html>');
    expect(src).toContain('fetch(');
  });

  it('hides the Ask AI button for static creatives', async () => {
    const b = await buildCreativeBundle({
      manifest: manifest({ mode: 'static', features: { textChat: false, voice: 'off', gallery: false, leadCapture: false } }),
      copy,
    });
    expect(b.files['index.html']).not.toContain('id="acp-ask"');
  });
});
