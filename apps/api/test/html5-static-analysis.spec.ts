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

  it('flags oversize for the Google 600KB limit', () => {
    const r = analyzeHtml5('a'.repeat(700_000), { network: 'google_ads' });
    expect(r.issues.some((i) => i.code === 'oversize')).toBe(true);
  });
});

describe('template allowlist + CSP', () => {
  it('allows only known templates', () => {
    expect(isAllowedTemplate('playable_basic')).toBe(true);
    expect(isAllowedTemplate('arbitrary_user_template')).toBe(false);
  });
  it('CSP locks down external resources', () => {
    expect(buildPreviewCsp()).toContain("default-src 'none'");
  });
});
