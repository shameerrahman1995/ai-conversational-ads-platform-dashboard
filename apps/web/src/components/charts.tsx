'use client';

import { useId } from 'react';

/* ==================================================================== */
/* Theme-aware inline-SVG chart primitives.                             */
/* Every colour is a CSS custom property (defined in globals.css) so    */
/* charts flip automatically with the active theme — no JS re-render.   */
/* Import from '@/components/charts'.                                    */
/* ==================================================================== */

/** The five semantic tones a chart mark can take. Defaults to 'brand'. */
export type ChartTone = 'brand' | 'success' | 'danger' | 'warning' | 'info';

/**
 * Tones that resolve to a real `--color-<tone>` custom property. Kept a
 * superset of {@link ChartTone} because per-series/segment tones arrive as
 * loose strings; 'violet' is an accepted extra since it is a documented token.
 */
const KNOWN_TONES = new Set<string>(['brand', 'success', 'danger', 'warning', 'info', 'violet']);

/** Palette used to auto-assign tones to series/segments that omit one. */
const PALETTE: readonly ChartTone[] = ['brand', 'info', 'success', 'warning', 'danger'];

/**
 * Map a tone to its CSS variable. Unknown/undefined tones fall back to
 * `fallback` (default 'brand'). This is the single point where tone → colour
 * happens, which is why charts are theme-aware: they only ever emit
 * `var(--color-<tone>)`, and the theme owns the actual hex.
 */
function toneVar(tone: string | undefined, fallback: ChartTone = 'brand'): string {
  const t = tone && KNOWN_TONES.has(tone) ? tone : fallback;
  return `var(--color-${t})`;
}

/** Resolve a series/segment colour, cycling the palette when tone is absent. */
function seriesColor(tone: string | undefined, index: number): string {
  if (tone) return toneVar(tone);
  return toneVar(PALETTE[index % PALETTE.length]);
}

/** Compact axis/legend number (Indian units: 42.7K, 1.5L, 4.2Cr). */
const compactNum = (v: number): string =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

/** Grouped integer (e.g. 1,53,856) for bar value labels. */
const groupedNum = (v: number): string =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v);

/* ---- Sparkline ----------------------------------------------------- */

export interface SparklineProps {
  /** Series values, plotted left→right. */
  data: number[];
  /** Line/fill tone. Defaults to 'brand'. */
  tone?: ChartTone;
  /** Intrinsic viewBox width. Rendered responsively (svg is 100% wide). */
  width?: number;
  /** Intrinsic viewBox height (px). */
  height?: number;
  strokeWidth?: number;
  /** Render the soft gradient area fill under the line. Defaults to true. */
  area?: boolean;
}

/**
 * A tiny trend line for KPI/metric cards. Normalises `data` into the box,
 * draws a rounded polyline and (optionally) a gradient area fill with an id
 * unique to this instance. Stroke stays crisp at any width via
 * `vectorEffect="non-scaling-stroke"`.
 */
export function Sparkline({
  data,
  tone = 'brand',
  width = 140,
  height = 32,
  strokeWidth = 2,
  area = true,
}: SparklineProps) {
  const rawId = useId();
  const gradId = `spark-${rawId.replace(/:/g, '')}`;
  const color = toneVar(tone);

  const pad = strokeWidth + 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const n = data.length;

  const min = n > 0 ? Math.min(...data) : 0;
  const max = n > 0 ? Math.max(...data) : 1;
  const span = max - min || 1;

  const xAt = (i: number): number => (n <= 1 ? pad + innerW / 2 : pad + (i / (n - 1)) * innerW);
  const yAt = (v: number): number => pad + innerH - ((v - min) / span) * innerH;

  const baseline = height - pad;
  const points = data.map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');
  const areaPath =
    n > 1
      ? `M ${xAt(0).toFixed(2)} ${baseline.toFixed(2)} ` +
        data.map((v, i) => `L ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`).join(' ') +
        ` L ${xAt(n - 1).toFixed(2)} ${baseline.toFixed(2)} Z`
      : '';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.26} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {area && areaPath ? <path d={areaPath} fill={`url(#${gradId})`} stroke="none" /> : null}
      {n > 1 ? (
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {n === 1 ? <circle cx={xAt(0)} cy={yAt(data[0])} r={strokeWidth} fill={color} /> : null}
    </svg>
  );
}

/* ---- AreaChart ----------------------------------------------------- */

export interface ChartSeries {
  name: string;
  data: number[];
  tone?: string;
}

export interface AreaChartProps {
  series: ChartSeries[];
  /** X-axis category labels; first/mid/last are shown when there are many. */
  labels?: string[];
  /** Intrinsic viewBox height (px); defines the responsive aspect ratio. */
  height?: number;
  /** Number of horizontal grid lines / y-axis ticks. Defaults to 4. */
  yTicks?: number;
  showLegend?: boolean;
}

/**
 * Multi-series area/line chart: faint horizontal grid, right-aligned y-axis
 * value labels (real values the data reaches), x-axis labels, a gradient area
 * under the first series, one polyline per series, emphasised endpoint dots
 * and an optional legend.
 */
export function AreaChart({
  series,
  labels,
  height = 210,
  yTicks = 4,
  showLegend = true,
}: AreaChartProps) {
  const rawId = useId();
  const gradId = `area-${rawId.replace(/:/g, '')}`;

  const W = 640;
  const H = height;
  const m = { top: 14, right: 16, bottom: 26, left: 48 };
  const px0 = m.left;
  const px1 = W - m.right;
  const pw = px1 - px0;
  const py0 = m.top;
  const py1 = H - m.bottom;
  const ph = py1 - py0;

  const allVals = series.flatMap((s) => s.data);
  let min = allVals.length ? Math.min(...allVals) : 0;
  let max = allVals.length ? Math.max(...allVals) : 1;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min === max) max = min + 1;
  const span = max - min;

  const nPts = Math.max(1, ...series.map((s) => s.data.length));
  const xAt = (i: number): number => (nPts <= 1 ? px0 + pw / 2 : px0 + (i / (nPts - 1)) * pw);
  const yAt = (v: number): number => py1 - ((v - min) / span) * ph;

  const tickCount = Math.max(2, yTicks);
  const ticks = Array.from({ length: tickCount }, (_, t) => {
    const frac = t / (tickCount - 1);
    return { y: py0 + frac * ph, value: max - frac * span };
  });

  const first = series[0];
  const firstArea =
    first && first.data.length > 1
      ? `M ${xAt(0).toFixed(2)} ${py1.toFixed(2)} ` +
        first.data.map((v, i) => `L ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`).join(' ') +
        ` L ${xAt(first.data.length - 1).toFixed(2)} ${py1.toFixed(2)} Z`
      : '';

  // X labels: show first / mid / last when there are many; otherwise all.
  const xLabelIndices: number[] = [];
  if (labels && labels.length > 0) {
    if (labels.length > 3) {
      xLabelIndices.push(0, Math.floor((labels.length - 1) / 2), labels.length - 1);
    } else {
      for (let i = 0; i < labels.length; i += 1) xLabelIndices.push(i);
    }
  }
  const labelX = (i: number): number => {
    if (!labels || labels.length <= 1) return px0;
    return px0 + (i / (labels.length - 1)) * pw;
  };
  const anchorFor = (i: number, len: number): 'start' | 'middle' | 'end' => {
    if (i === 0) return 'start';
    if (i === len - 1) return 'end';
    return 'middle';
  };

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Area chart: ${series.map((s) => s.name).join(', ') || 'no data'}`}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={seriesColor(first?.tone, 0)} stopOpacity={0.22} />
            <stop offset="100%" stopColor={seriesColor(first?.tone, 0)} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* grid + y-axis labels */}
        {ticks.map((tick, i) => (
          <g key={`t-${i}`}>
            <line
              x1={px0}
              y1={tick.y}
              x2={px1}
              y2={tick.y}
              stroke="var(--color-line)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={px0 - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--color-ink-3)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {compactNum(tick.value)}
            </text>
          </g>
        ))}

        {/* area under first series */}
        {firstArea ? <path d={firstArea} fill={`url(#${gradId})`} stroke="none" /> : null}

        {/* one polyline per series */}
        {series.map((s, si) => {
          if (s.data.length < 2) return null;
          const pts = s.data.map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');
          return (
            <polyline
              key={`line-${s.name}`}
              points={pts}
              fill="none"
              stroke={seriesColor(s.tone, si)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* emphasised endpoint dots */}
        {series.map((s, si) => {
          const li = s.data.length - 1;
          if (li < 0) return null;
          return (
            <circle
              key={`dot-${s.name}`}
              cx={xAt(li)}
              cy={yAt(s.data[li])}
              r={3.5}
              fill={seriesColor(s.tone, si)}
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          );
        })}

        {/* x-axis labels */}
        {labels
          ? xLabelIndices.map((i) => (
              <text
                key={`x-${i}`}
                x={labelX(i)}
                y={H - 8}
                textAnchor={anchorFor(i, labels.length)}
                fontSize={11}
                fill="var(--color-ink-3)"
              >
                {labels[i]}
              </text>
            ))
          : null}
      </svg>

      {showLegend && series.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
          {series.map((s, i) => (
            <span
              key={`lg-${s.name}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: 12,
                color: 'var(--color-ink-2)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: seriesColor(s.tone, i),
                  display: 'inline-block',
                }}
              />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---- BarChart ------------------------------------------------------ */

export interface BarChartItem {
  label: string;
  value: number;
  tone?: string;
  note?: string;
}

export interface BarChartProps {
  items: BarChartItem[];
  /** Total intrinsic height (px). Defaults to a per-row height. */
  height?: number;
}

/**
 * Horizontal bar chart: a track rail (`--color-inset`) per row with a
 * tone-coloured fill, the label at the left and the value at the right.
 */
export function BarChart({ items, height }: BarChartProps) {
  const W = 520;
  const labelColW = 150;
  const valueColW = 64;
  const trackX0 = labelColW + 10;
  const trackX1 = W - valueColW - 6;
  const trackW = trackX1 - trackX0;

  const rowStep = 40;
  const totalH = height ?? Math.max(rowStep, items.length * rowStep);
  const step = items.length > 0 ? totalH / items.length : rowStep;
  const barH = 10;
  const radius = barH / 2;

  const maxVal = Math.max(1, ...items.map((it) => (Number.isFinite(it.value) ? it.value : 0)));

  if (items.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${W} ${totalH}`}
      role="img"
      aria-label={`Bar chart: ${items.map((it) => it.label).join(', ')}`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {items.map((it, i) => {
        const cy = i * step + step / 2;
        const frac = maxVal > 0 ? Math.max(0, it.value) / maxVal : 0;
        const fillW = Math.max(0, trackW * frac);
        const hasNote = Boolean(it.note);
        return (
          <g key={`bar-${it.label}-${i}`}>
            {/* label */}
            <text
              x={0}
              y={hasNote ? cy - 5 : cy}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={12}
              fill="var(--color-ink-2)"
            >
              {it.label}
            </text>
            {hasNote ? (
              <text x={0} y={cy + 9} textAnchor="start" dominantBaseline="middle" fontSize={10.5} fill="var(--color-ink-3)">
                {it.note}
              </text>
            ) : null}

            {/* rail */}
            <rect
              x={trackX0}
              y={cy - barH / 2}
              width={trackW}
              height={barH}
              rx={radius}
              ry={radius}
              fill="var(--color-inset)"
            />
            {/* fill */}
            {fillW > 0 ? (
              <rect
                x={trackX0}
                y={cy - barH / 2}
                width={fillW}
                height={barH}
                rx={radius}
                ry={radius}
                fill={seriesColor(it.tone, i)}
              />
            ) : null}

            {/* value */}
            <text
              x={W}
              y={cy}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={12}
              fontWeight={600}
              fill="var(--color-ink)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {groupedNum(it.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---- DonutChart ---------------------------------------------------- */

export interface DonutSegment {
  label: string;
  value: number;
  tone?: string;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  /** Diameter of the donut (px). Rendered up to 100% of its column. */
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}

/**
 * Donut chart drawn with stroke-dasharray arcs on a stacked set of circles,
 * a track ring (`--color-inset`), an optional centre value/caption and a
 * swatch legend. Segments start at 12 o'clock.
 */
export function DonutChart({ segments, size = 170, centerLabel, centerValue }: DonutChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const thickness = Math.max(10, size * 0.14);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  let acc = 0;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Donut chart: ${segments.map((s) => s.label).join(', ')}`}
        style={{ display: 'block', width: size, maxWidth: '100%', height: 'auto', flex: '0 0 auto' }}
      >
        {/* track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-inset)" strokeWidth={thickness} />

        {/* segments */}
        {segments.map((seg, i) => {
          const val = Math.max(0, seg.value);
          const frac = total > 0 ? val / total : 0;
          const len = frac * circumference;
          if (len <= 0) return null;
          const dash = `${len.toFixed(3)} ${(circumference - len).toFixed(3)}`;
          const offset = -acc;
          acc += len;
          return (
            <circle
              key={`seg-${seg.label}-${i}`}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seriesColor(seg.tone, i)}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}

        {/* centre text */}
        {centerValue ? (
          <text
            x={cx}
            y={centerLabel ? cy - 4 : cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size * 0.17}
            fontWeight={700}
            fill="var(--color-ink)"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {centerValue}
          </text>
        ) : null}
        {centerLabel ? (
          <text
            x={cx}
            y={centerValue ? cy + size * 0.12 : cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size * 0.08}
            fill="var(--color-ink-3)"
          >
            {centerLabel}
          </text>
        ) : null}
      </svg>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          fontSize: 12,
          minWidth: 120,
          flex: '1 1 auto',
        }}
      >
        {segments.map((seg, i) => (
          <li
            key={`leg-${seg.label}-${i}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-ink-2)' }}
          >
            <span
              aria-hidden="true"
              style={{ width: 10, height: 10, borderRadius: 3, background: seriesColor(seg.tone, i), flex: '0 0 auto' }}
            />
            <span style={{ flex: '1 1 auto' }}>{seg.label}</span>
            <span style={{ color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>
              {compactNum(seg.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
