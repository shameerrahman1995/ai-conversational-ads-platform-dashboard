import { describe, it, expect } from 'vitest';
import {
  analyzeHtml5,
  buildPreviewCsp,
  isAllowedTemplate,
} from '../src/modules/creative/html5/static-analysis';

describe('analyzeHtml5', () => {
  it('passes a clean inline bundle', () => {
    const r = analyzeHtml5('<div><style>.a{}</style><script>var x=1;</script></div>', {
      network: 'google_ads',
    });
    expect(r.ok).toBe(true);
  });

  it('flags external network calls for tiktok (playable)', () => {
    const r = analyzeHtml5('<script>fetch("https://evil.example")</script>', { network: 'tiktok' });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'external_request')).toBe(true);
  });

  it('flags device APIs', () => {
    const r = analyzeHtml5('<script>navigator.mediaDevices.getUserMedia({})</script>', {
      network: 'meta',
    });
    expect(r.issues.some((i) => i.code === 'device_api')).toBe(true);
  });

  it('flags unsafe JS (eval)', () => {
    const r = analyzeHtml5('<script>eval("x")</script>', { network: 'meta' });
    expect(r.issues.some((i) => i.code === 'unsafe_js')).toBe(true);
  });

  it('flags oversize for the Google 150KB uploaded-HTML5 limit', () => {
    // 200KB is under the old 600KB gate but over Google's real 150KB limit.
    const r = analyzeHtml5('a'.repeat(200_000), { network: 'google_ads' });
    expect(r.issues.some((i) => i.code === 'oversize')).toBe(true);
  });
});

describe('analyzeHtml5 — uploaded-HTML5 structural gate (opt-in)', () => {
  const has = (r: ReturnType<typeof analyzeHtml5>, code: string) => r.issues.some((i) => i.code === code);
  const goodBundle =
    '<meta name="ad.size" content="width=300,height=250">' +
    '<div id="acp-ad"></div>' +
    '<script>var clickTag = "https://x.example/landing";</script>' +
    '<script>window.open(window.clickTag, "_blank");</script>';

  it('passes a bundle that declares clickTag and ad.size', () => {
    const r = analyzeHtml5(goodBundle, { network: 'google_ads', requireClickTag: true, requireAdSize: true });
    expect(r.ok).toBe(true);
  });

  it('flags a missing clickTag when required', () => {
    const r = analyzeHtml5('<meta name="ad.size" content="width=300,height=250"><div></div>', {
      network: 'google_ads',
      requireClickTag: true,
    });
    expect(has(r, 'missing_clicktag')).toBe(true);
  });

  it('flags a missing ad.size meta when required', () => {
    const r = analyzeHtml5('<script>var clickTag = "https://x.example";</script>', {
      network: 'google_ads',
      requireAdSize: true,
    });
    expect(has(r, 'missing_ad_size')).toBe(true);
  });

  it('does not require clickTag / ad.size unless opted in (inline compile path)', () => {
    const r = analyzeHtml5('<div><script>var x=1;</script></div>', { network: 'google_ads' });
    expect(has(r, 'missing_clicktag')).toBe(false);
    expect(has(r, 'missing_ad_size')).toBe(false);
  });
});

describe('template allowlist + CSP', () => {
  it('allows only known templates', () => {
    expect(isAllowedTemplate('playable_basic')).toBe(true);
    expect(isAllowedTemplate('arbitrary_user_template')).toBe(false);
  });
  it('CSP locks down external resources and denies network/embed/nav vectors', () => {
    const csp = buildPreviewCsp();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'none'");
  });
});

describe('analyzeHtml5 — AST hardening (bypasses the old regex missed)', () => {
  const has = (r: ReturnType<typeof analyzeHtml5>, code: string) => r.issues.some((i) => i.code === code);

  it('flags google_ads external images (old scan ignored google_ads)', () => {
    const r = analyzeHtml5('<img src="https://cdn.evil.com/x.png">', { network: 'google_ads' });
    expect(has(r, 'external_request')).toBe(true);
  });

  it('allows Google-hosted resources for google_ads (allowlist)', () => {
    const r = analyzeHtml5('<link href="https://fonts.googleapis.com/css?family=Inter">', {
      network: 'google_ads',
    });
    expect(r.ok).toBe(true);
  });

  it('flags protocol-relative external script src', () => {
    const r = analyzeHtml5('<script src="//evil.com/x.js"></script>', { network: 'tiktok' });
    expect(has(r, 'external_request')).toBe(true);
  });

  it('flags external URL inside CSS url()', () => {
    const r = analyzeHtml5('<div style="background:url(https://evil.com/a.png)"></div>', {
      network: 'google_ads',
    });
    expect(has(r, 'external_request')).toBe(true);
  });

  it('flags fetch inside an inline event handler', () => {
    const r = analyzeHtml5('<button onclick="fetch(\'https://x.example\')">go</button>', {
      network: 'tiktok',
    });
    expect(has(r, 'external_request')).toBe(true);
  });

  it('flags dynamic import() and Worker as network', () => {
    expect(has(analyzeHtml5('<script>import("https://x")</script>', { network: 'tiktok' }), 'external_request')).toBe(true);
    expect(has(analyzeHtml5('<script>new Worker("w.js")</script>', { network: 'tiktok' }), 'external_request')).toBe(true);
  });

  it('flags javascript: URLs and innerHTML as unsafe', () => {
    expect(has(analyzeHtml5('<a href="javascript:alert(1)">x</a>', { network: 'meta' }), 'unsafe_js')).toBe(true);
    expect(has(analyzeHtml5('<script>el.innerHTML=u</script>', { network: 'meta' }), 'unsafe_js')).toBe(true);
  });

  it('flags secrets embedded in the bundle', () => {
    const r = analyzeHtml5('<script>var k="sk-ABCDEFGHIJKLMNOPQRSTUV1234";</script>', { network: 'google_ads' });
    expect(has(r, 'secret')).toBe(true);
  });

  it('allows external calls on host-cooperative direct-publisher', () => {
    const r = analyzeHtml5('<script>fetch("https://api.example/x")</script>', { network: 'direct_publisher' });
    expect(r.ok).toBe(true);
  });
});
