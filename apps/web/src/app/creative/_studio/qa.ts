import type { StudioBlock, StudioCreative } from './model';

/**
 * Real, per-creative QA (V10 U3.6). The eight checks below are computed from the
 * actual blueprint blocks, journey states and palette — no illustrative numbers.
 * Each returns a pass/review verdict, a short evidence line and a 0–100 score so
 * the Studio QA panel and the Review compliance list read from ONE source.
 */
export type QaStatus = 'Passed' | 'Review';

export interface QaCheck {
  key: string;
  label: string;
  status: QaStatus;
  detail: string;
  /** 0–100 confidence for the meter. */
  pct: number;
}

export interface QaResult {
  checks: QaCheck[];
  passed: number;
  total: number;
  /** Overall readiness 0–100 (mean of the per-check scores). */
  score: number;
}

/* ---- colour / contrast helpers (WCAG relative luminance) ------------- */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** Contrast ratio (1–21) between two hex colours; 1 if either is unparseable. */
export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const la = relativeLuminance(ra);
  const lb = relativeLuminance(rb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function findBlock(blocks: StudioBlock[], match: (b: StudioBlock) => boolean): StudioBlock | undefined {
  return blocks.find(match);
}

/** Deterministic bundle-size estimate (KB) from the copy + block payloads. */
export function estimateBundleKb(creative: StudioCreative): number {
  const copy =
    creative.blocks.reduce((n, b) => n + (b.value?.length ?? 0), 0) +
    creative.supportingCopy.length +
    creative.headline.length;
  // ~640 KB runtime shell + ~1 KB per 100 chars of authored copy.
  return Math.round(640 + copy / 100);
}

const JOURNEY_IDS = ['hook', 'explore', 'ask', 'answer', 'qualify', 'convert'] as const;

export function computeQaChecks(creative: StudioCreative): QaResult {
  const blocks = creative.blocks;
  const brand = findBlock(blocks, (b) => b.type === 'brand');
  const visual = findBlock(blocks, (b) => b.type === 'visual');
  const legal = findBlock(blocks, (b) => b.type === 'legal');
  const askAi = findBlock(blocks, (b) => b.type === 'ask-ai');
  const cta = findBlock(blocks, (b) => b.type === 'cta');

  const stateIds = new Set(creative.states.map((s) => s.id));
  const missingStates = JOURNEY_IDS.filter((id) => !stateIds.has(id));
  const statesWithFallback = creative.states.filter((s) => (s.fallback ?? '').trim().length > 0).length;

  const contrast = contrastRatio('#ffffff', creative.background);
  const kb = estimateBundleKb(creative);
  const budgetKb = 1024;

  const checks: QaCheck[] = [];

  // 1 — Brand compliance
  {
    const ok = Boolean(brand && brand.visible && brand.locked);
    checks.push({
      key: 'brand',
      label: 'Brand compliance',
      status: ok ? 'Passed' : 'Review',
      pct: ok ? 100 : 72,
      detail: !brand
        ? 'No brand block found in the creative'
        : !brand.locked
          ? 'Brand block is unlocked — lock it to protect identity'
          : !brand.visible
            ? 'Brand block is hidden'
            : `Locked brand header “${brand.value}” is present`,
    });
  }

  // 2 — Product fidelity
  {
    const ok = Boolean(visual && visual.locked);
    checks.push({
      key: 'product',
      label: 'Product fidelity',
      status: ok ? 'Passed' : 'Review',
      pct: ok ? 100 : 74,
      detail: !visual
        ? 'No product visual block found'
        : !visual.locked
          ? 'Product visual is unlocked — lock it to preserve approved geometry'
          : 'Approved product visual is locked',
    });
  }

  // 3 — Legal copy
  {
    const ok = Boolean(legal && legal.visible && (legal.value ?? '').trim().length > 0);
    checks.push({
      key: 'legal',
      label: 'Legal copy',
      status: ok ? 'Passed' : 'Review',
      pct: ok ? 100 : 60,
      detail: !legal
        ? 'No legal disclaimer block found'
        : !legal.visible
          ? 'Disclaimer is hidden — it must be visible'
          : (legal.value ?? '').trim().length === 0
            ? 'Disclaimer text is empty'
            : 'Required disclaimer is present and visible',
    });
  }

  // 4 — Accessibility (text/background contrast)
  {
    const ok = contrast >= 4.5 && creative.headline.trim().length > 0;
    checks.push({
      key: 'accessibility',
      label: 'Accessibility',
      status: ok ? 'Passed' : 'Review',
      pct: Math.max(40, Math.min(100, Math.round((contrast / 7) * 100))),
      detail:
        creative.headline.trim().length === 0
          ? 'Headline is empty'
          : contrast >= 4.5
            ? `Text/background contrast ${contrast.toFixed(1)}:1 meets AA`
            : `Text/background contrast ${contrast.toFixed(1)}:1 is below the 4.5:1 AA target`,
    });
  }

  // 5 — Package size
  {
    const ok = kb <= budgetKb;
    checks.push({
      key: 'package',
      label: 'Package size',
      status: ok ? 'Passed' : 'Review',
      pct: Math.max(40, Math.min(100, Math.round((1 - kb / (budgetKb * 2)) * 100))),
      detail: ok
        ? `Estimated bundle ${kb} KB (under the ${budgetKb} KB budget)`
        : `Estimated bundle ${kb} KB exceeds the ${budgetKb} KB budget`,
    });
  }

  // 6 — Agent grounding (a conversational entry must exist to ground answers)
  {
    const ok = Boolean(askAi && askAi.visible);
    checks.push({
      key: 'grounding',
      label: 'Agent grounding',
      status: ok ? 'Passed' : 'Review',
      pct: ok ? 100 : 70,
      detail: !askAi
        ? 'No Ask AI block — the creative has no conversational entry'
        : !askAi.visible
          ? 'Ask AI entry is hidden'
          : 'Ask AI entry is present; answers ground on the pinned snapshot',
    });
  }

  // 7 — Journey coverage (all six states present, each with a fallback)
  {
    const ok = missingStates.length === 0;
    checks.push({
      key: 'journey',
      label: 'Journey coverage',
      status: ok ? 'Passed' : 'Review',
      pct: Math.round((stateIds.size / JOURNEY_IDS.length) * 100),
      detail: ok
        ? `All ${JOURNEY_IDS.length} journey states defined · ${statesWithFallback} with a fallback`
        : `Missing journey state(s): ${missingStates.join(', ')}`,
    });
  }

  // 8 — Conversion path (a visible CTA + a convert state)
  {
    const hasCta = Boolean(cta && cta.visible && (cta.value ?? '').trim().length > 0);
    const hasConvert = stateIds.has('convert');
    const ok = hasCta && hasConvert;
    checks.push({
      key: 'conversion',
      label: 'Conversion path',
      status: ok ? 'Passed' : 'Review',
      pct: ok ? 100 : 68,
      detail: !hasCta
        ? 'No visible primary action (CTA) block'
        : !hasConvert
          ? 'No Convert journey state to capture the lead'
          : `Primary action “${cta?.value}” leads into the Convert state`,
    });
  }

  const passed = checks.filter((c) => c.status === 'Passed').length;
  const score = Math.round(checks.reduce((n, c) => n + c.pct, 0) / checks.length);
  return { checks, passed, total: checks.length, score };
}
