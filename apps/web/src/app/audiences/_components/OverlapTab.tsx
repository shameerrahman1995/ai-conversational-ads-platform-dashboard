'use client';

import { Card } from '@/components/ui';
import { Notice } from './atoms';
import { OVERLAP, OVERLAP_THRESHOLD, SEED_SEGMENTS, type Segment } from './segments';

/** Heat tint for an overlap cell, scaled by percentage (tokens only). */
function heat(pct: number): string {
  const mix = Math.min(52, pct * 2.4);
  return `color-mix(in srgb, var(--color-brand) ${mix.toFixed(0)}%, transparent)`;
}

export function OverlapTab({ segments }: { segments: Segment[] }) {
  const rows = SEED_SEGMENTS;
  const maxOverlap = Math.max(
    ...OVERLAP.flatMap((r, i) => r.filter((_, j) => i !== j)),
  );
  const extras = segments.filter((s) => !SEED_SEGMENTS.some((seed) => seed.id === s.id)).length;
  const safe = maxOverlap < OVERLAP_THRESHOLD;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <Card>
        <div className="panel-head">
          <div className="row" style={{ gap: '0.6rem' }}>
            <span className="panel-title">Audience overlap</span>
            <span className="panel-note">Shared reach between synced segments, as a share of the row audience</span>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Segment</th>
                {rows.map((_, j) => (
                  <th key={j} className="cell-num" title={rows[j].name} style={{ width: 56 }}>
                    {j + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((seg, i) => (
                <tr key={seg.id}>
                  <td className="cell-strong">
                    <span style={{ color: 'var(--color-ink-3)', marginRight: 6 }}>{i + 1}.</span>
                    {seg.name}
                  </td>
                  {rows.map((_, j) => {
                    const pct = OVERLAP[i][j];
                    const self = i === j;
                    return (
                      <td
                        key={j}
                        className="cell-num"
                        style={{
                          background: self ? 'transparent' : heat(pct),
                          color: self ? 'var(--color-ink-3)' : 'var(--color-ink)',
                          fontWeight: self ? 400 : 600,
                        }}
                      >
                        {self ? '—' : `${pct}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Notice tone={safe ? 'success' : 'warning'} icon={safe ? 'check' : 'filter'}>
        {safe ? (
          <>
            No material collision under a {OVERLAP_THRESHOLD}% threshold — safe to run concurrently. Peak
            pairwise overlap is {maxOverlap}%, so spend across these segments stays largely additive.
          </>
        ) : (
          <>
            Peak pairwise overlap is {maxOverlap}%, above the {OVERLAP_THRESHOLD}% threshold — review before
            running these segments concurrently to avoid bidding against yourself.
          </>
        )}
      </Notice>

      {extras > 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {extras} newly configured {extras === 1 ? 'audience is' : 'audiences are'} not in this overlap
          sync yet — overlap is computed once a segment is activated by the audiences service.
        </p>
      ) : null}
    </div>
  );
}
