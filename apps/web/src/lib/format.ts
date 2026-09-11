/* ==================================================================== */
/* Locale/currency formatting helpers (pure, framework-agnostic).       */
/*                                                                      */
/* The workspace default is INR / en-IN, but every function accepts an  */
/* override so a workspace's configured currency & locale flow through. */
/* ==================================================================== */

/** Indian numbering thresholds. */
const CRORE = 1e7; // 1,00,00,000
const LAKH = 1e5; //     1,00,000

export interface FormatMoneyOptions {
  /** ISO 4217 currency code. Defaults to 'INR'. */
  currency?: string;
  /** BCP-47 locale. Defaults to 'en-IN'. */
  locale?: string;
  /** Max fraction digits. Defaults to 0 (whole units). */
  maximumFractionDigits?: number;
}

/**
 * Format a value as currency.
 *
 * @example formatMoney(153856) // "₹1,53,856"
 */
export function formatMoney(value: number, opts: FormatMoneyOptions = {}): string {
  const { currency = 'INR', locale = 'en-IN', maximumFractionDigits = 0 } = opts;
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // minimumFractionDigits pinned to 0 so a `maximumFractionDigits` of 0 can't
    // trip the min>max RangeError that INR's default of 2 would otherwise cause.
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

/**
 * Format a large monetary value with abbreviated units.
 *
 * For INR uses Indian Crore/Lakh above their thresholds; for other currencies
 * falls back to `Intl` compact currency notation.
 *
 * @example formatMoneyLarge(42000000)       // "₹4.2 Cr"
 * @example formatMoneyLarge(250000)         // "₹2.5 L"
 * @example formatMoneyLarge(2540000, 'USD') // "$2.5M"
 */
export function formatMoneyLarge(value: number, currency = 'INR', locale = 'en-IN'): string {
  if (!Number.isFinite(value)) return formatMoney(value, { currency, locale });

  if (currency === 'INR') {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    const num = (n: number): string =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
    if (abs >= CRORE) return `${sign}₹${num(abs / CRORE)} Cr`;
    if (abs >= LAKH) return `${sign}₹${num(abs / LAKH)} L`;
    return formatMoney(value, { currency, locale });
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Compact number notation via `Intl`.
 *
 * NOTE: suffixes are locale-driven. Under the default 'en-IN' this yields
 * Indian units — 2_540_000 → "25.4L", 4.2e7 → "4.2Cr". Pass a Western locale
 * (e.g. 'en-US') for K/M/B: formatCompact(2540000, 'en-US') // "2.54M".
 *
 * @example formatCompact(42700) // "42.7K"
 */
export function formatCompact(value: number, locale = 'en-IN'): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a number as a percentage string.
 *
 * @example formatPct(18.42) // "18.4%"
 */
export function formatPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}
