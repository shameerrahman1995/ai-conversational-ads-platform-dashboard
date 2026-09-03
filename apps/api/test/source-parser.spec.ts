import { describe, it, expect, vi } from 'vitest';

// SourceParser now fetches through the SSRF-guarded safe-fetch helper; mock it so
// the parser test exercises only the HTML->text extraction (safe-fetch has its
// own dedicated tests in safe-fetch.spec.ts).
vi.mock('../src/modules/ingestion/parsing/safe-fetch', () => ({
  safeFetchText: vi
    .fn()
    .mockResolvedValue(
      '<html><head><style>.x{}</style><script>bad()</script></head><body><h1>Hi</h1><p>Buy now</p></body></html>',
    ),
}));

import { SourceParser } from '../src/modules/ingestion/parsing/source-parser';

describe('SourceParser', () => {
  it('extracts visible text from a URL, stripping tags/script/style', async () => {
    const out = await new SourceParser().parse({ type: 'url', uri: 'https://x.test' });
    expect(out.text).toContain('Hi');
    expect(out.text).toContain('Buy now');
    expect(out.text).not.toContain('bad()');
    expect(out.text).not.toContain('<');
  });

  it('returns a stub note for pdf (OCR not yet implemented)', async () => {
    const out = await new SourceParser().parse({ type: 'pdf', uri: 'k' });
    expect(out.text.length).toBeGreaterThan(0);
  });
});
