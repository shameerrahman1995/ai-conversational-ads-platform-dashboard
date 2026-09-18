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
    // Tiny thin creative — comfortably under Google's 150KB uploaded-HTML5 limit.
    expect(b.zipBytes).toBeLessThan(150_000);
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

  it('declares a Google clickTag global (defaulted to the final URL) before app.js', async () => {
    const b = await buildCreativeBundle({ manifest: manifest(), copy });
    const html = b.files['index.html'];
    // clickTag declared with the finalUrl as its default value.
    expect(html).toContain('var clickTag = "https://acme.example.com/landing";');
    // The clickTag <script> must appear before the app.js <script> so app.js can read it.
    expect(html.indexOf('var clickTag')).toBeLessThan(html.indexOf('src="app.js"'));
    // data-final-url is kept as the fallback.
    expect(html).toContain('data-final-url="https://acme.example.com/landing"');
  });

  it('routes the click-through through window.clickTag (data-final-url is only a fallback)', async () => {
    const js = (await buildCreativeBundle({ manifest: manifest(), copy })).files['app.js'];
    // The exit navigates via window.clickTag, falling back to data-final-url.
    expect(js).toContain('window.clickTag');
    expect(js).toMatch(/window\.open\(url, '_blank'\)/);
    expect(js).toContain("getAttribute('data-final-url')");
    // The destination is NOT hardcoded as the only path in window.open.
    expect(/window\.open\(\s*["']https?:\/\//i.test(js)).toBe(false);
  });

  it('sends the shared-contract request bodies (text / fields+consent / creativeId+mode)', async () => {
    const js = (await buildCreativeBundle({ manifest: manifest(), copy })).files['app.js'];
    // POST /messages -> { text }
    expect(js).toContain('JSON.stringify({ text: text })');
    expect(js).not.toContain('{ message: text }');
    // POST /lead -> { fields: { phone }, consent: true }
    expect(js).toContain('JSON.stringify({ fields: { phone: phone }, consent: true })');
    expect(js).not.toContain('{ phone: phone, consent: true }');
    // POST /ad-sessions -> { creativeId, mode } (unchanged)
    expect(js).toContain('JSON.stringify({ creativeId: manifest.creativeId, mode: manifest.mode })');
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
