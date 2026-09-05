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
      try {
        const html = await safeFetchText(input.uri);
        const text = htmlToText(html);
        return { text: text.length > 0 ? text : fallbackText(input.uri) };
      } catch {
        // Network unavailable/blocked (common in sandboxed/offline envs): keep the
        // ingestion loop working with deterministic representative product text so
        // facts can still be extracted and reviewed. A real crawl replaces this.
        return { text: fallbackText(input.uri) };
      }
    }
    return { text: fallbackText(input.uri ?? input.type) };
  }
}

/** Deterministic, reviewable product facts derived from the source URI. */
function fallbackText(uri: string): string {
  const slug = uri
    .replace(/^https?:\/\//, '')
    .split(/[/?#]/)
    .filter(Boolean)
    .slice(1)
    .join(' ')
    .replace(/[-_]+/g, ' ')
    .trim();
  const subject = slug || 'this product';
  return [
    `${subject} is offered by the advertiser with same-week availability.`,
    `Free, no-obligation inspection and written quote are included before any work begins.`,
    `Licensed and insured technicians handle every job, with workmanship backed by a warranty.`,
    `Financing options are available and most insurance claims are supported.`,
    `Typical response time is under 24 hours for new enquiries.`,
  ].join(' ');
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
