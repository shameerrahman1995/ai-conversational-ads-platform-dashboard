'use client';

import { useMemo } from 'react';
import { Card, EmptyState } from '@/components/ui';
import { Notice } from './atoms';
import { OVERLAP_THRESHOLD, computeOverlap, type Segment } from './segments';

/** Heat tint for an overlap cell, scaled by percentage (tokens only). */
function heat(pct: number): string {
  const mix = Math.min(52, pct * 2.4);
  return `color-mix(in srgb, var(--color-brand) ${mix.toFixed(0)}%, transparent)`;
}

export function OverlapTab({ segments }: { segments: Segment[] }) {
  const matrix = useMemo(() => computeOverlap(segments), [segments]);
  const maxOverlap = useMemo(
    () => Math.max(0, ...matrix.flatMap((r, i) => r.filter((_, j) => i !== j))),
    [matrix],
  );

  if (segments.length < 2) {
    return (
      <Card>
        <EmptyState
          icon="filter"
          title="Not enough audiences to compare"
          hint="Overlap is estimated across two or more configured audiences. Create another segment to see how their reach overlaps."
        />
      </Card>
    );
  }

  const safe = maxOverlap < OVERLAP_THRESHOLD;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <Card>
        <div className="panel-head">
          <div className="row" style={{ gap: '0.6rem' }}>
            <span className="panel-title">Audience overlap</span>
            <span className="panel-note">
              Estimated shared reach between segments, as a share of the row audience
            </span>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Segment</th>
                {segments.map((seg, j) => (
                  <th key={seg.id} className="cell-num" title={seg.name} style={{ width: 56 }}>
                    {j + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {segments.map((seg, i) => (
                <tr key={seg.id}>
                  <td className="cell-strong">
                    <span style={{ color: 'var(--color-ink-3)', marginRight: 6 }}>{i + 1}.</span>
                    {seg.name}
                  </td>
                  {segments.map((other, j) => {
                    const pct = matrix[i][j];
                    const self = i === j;
                    return (
                      <td
                        key={other.id}
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

      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Overlap is a client-side estimate from channel affinity and audience type. Precise cross-segment
        measurement lands with connected-platform reporting.
      </p>
    </div>
  );
}
