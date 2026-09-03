import { Injectable } from '@nestjs/common';
import type { ParseInput, SourceParserPort } from './parser.port';
import { safeFetchText } from './safe-fetch';

/**
 * URL parsing uses an SSRF-guarded fetch (see safe-fetch) + naive HTML->text
 * strip (good enough for MVP fact candidates). PDF/OCR and product-feed parsing
 * are stubbed behind this port and swap in later without changing callers.
 */
@Injectable()
export class SourceParser implements SourceParserPort {
  async parse(input: ParseInput): Promise<{ text: string }> {
    if (input.type === 'url' && input.uri) {
      const html = await safeFetchText(input.uri);
      return { text: htmlToText(html) };
    }
    return { text: `[unparsed ${input.type} source; OCR/feed parsing pending]` };
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
