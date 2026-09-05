import { Injectable } from '@nestjs/common';
import type { ImageGenOptions, ImageGenResult, ImageGeneratorPort } from './image-gen.port';

/**
 * DEV STUB image generator: renders a deterministic, on-brand SVG "poster" from
 * the prompt (gradient ground + the prompt as a headline + a brand mark) and
 * returns it as a data: URI so it renders anywhere with no storage or provider.
 * A real text-to-image adapter (DALL·E / SD) replaces this behind the port.
 */
@Injectable()
export class StubImageGenerator implements ImageGeneratorPort {
  async generate(prompt: string, opts: ImageGenOptions): Promise<ImageGenResult> {
    const w = opts.width || 1080;
    const h = opts.height || 1080;
    // Palette values are interpolated into SVG attributes — clamp to strict hex
    // so nothing untrusted can break out of an attribute (defense in depth).
    const raw = opts.palette ?? { bg: '#0f1729', accent: '#4f46e5', text: '#ffffff' };
    const p = {
      bg: safeColor(raw.bg, '#0f1729'),
      accent: safeColor(raw.accent, '#4f46e5'),
      text: safeColor(raw.text, '#ffffff'),
    };
    const headline = wrap(esc(prompt || 'Your ad'), 22).slice(0, 3);
    const fontSize = Math.round(Math.min(w, h) * 0.08);
    const lineHeight = Math.round(fontSize * 1.15);
    const startY = Math.round(h * 0.62);
    const lines = headline
      .map(
        (line, i) =>
          `<text x="${Math.round(w * 0.07)}" y="${startY + i * lineHeight}" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="${p.text}">${line}</text>`,
      )
      .join('');
    const sub = opts.subhead
      ? `<text x="${Math.round(w * 0.07)}" y="${startY + headline.length * lineHeight + Math.round(fontSize * 0.9)}" font-family="Inter, Arial, sans-serif" font-size="${Math.round(fontSize * 0.42)}" fill="${p.text}" opacity="0.82">${esc(opts.subhead).slice(0, 60)}</text>`
      : '';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${p.bg}"/>
<stop offset="1" stop-color="${p.accent}"/>
</linearGradient>
<radialGradient id="glow" cx="0.8" cy="0.2" r="0.6">
<stop offset="0" stop-color="${p.text}" stop-opacity="0.16"/>
<stop offset="1" stop-color="${p.text}" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<rect width="${w}" height="${h}" fill="url(#glow)"/>
<circle cx="${Math.round(w * 0.86)}" cy="${Math.round(h * 0.16)}" r="${Math.round(w * 0.05)}" fill="${p.text}" opacity="0.9"/>
<rect x="${Math.round(w * 0.07)}" y="${Math.round(h * 0.07)}" width="${Math.round(w * 0.34)}" height="${Math.round(h * 0.02)}" rx="${Math.round(h * 0.01)}" fill="${p.text}" opacity="0.55"/>
${lines}
${sub}
</svg>`;

    const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return { url, provider: 'stub-svg' };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Only allow #-hex colors into SVG attributes; anything else → fallback. */
function safeColor(c: unknown, fallback: string): string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;
}

/** Greedy word-wrap into lines of at most `max` chars. */
function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > max) {
      if (cur) lines.push(cur);
      cur = word;
    } else {
      cur = (cur + ' ' + word).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ['Your ad'];
}
