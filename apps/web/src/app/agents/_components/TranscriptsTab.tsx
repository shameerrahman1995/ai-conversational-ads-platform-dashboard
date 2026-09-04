'use client';

import type { Tone } from '@/components/ui';
import { Card, Chip } from '@/components/ui';

interface Row {
  summary: string;
  channel: string;
  score: number;
  level: 'high' | 'medium' | 'low';
  outcome: string;
  outcomeTone: Tone;
  duration: string;
  when: string;
}

const ROWS: Row[] = [
  {
    summary: 'Storm damage, upstairs leak — booked inspection',
    channel: 'Meta · Spring Roofing Promo',
    score: 88,
    level: 'high',
    outcome: 'Booked',
    outcomeTone: 'success',
    duration: '6m 12s',
    when: '2h ago',
  },
  {
    summary: 'Comparing quotes for a full re-roof',
    channel: 'Google · Spring Roofing Promo',
    score: 81,
    level: 'high',
    outcome: 'Qualified',
    outcomeTone: 'success',
    duration: '9m 03s',
    when: '5h ago',
  },
  {
    summary: 'HVAC tune-up before the first cold snap',
    channel: 'Meta · HVAC Tune-Up',
    score: 63,
    level: 'medium',
    outcome: 'In progress',
    outcomeTone: 'info',
    duration: '4m 41s',
    when: 'Yesterday',
  },
  {
    summary: 'Gutter guard pricing for a two-story home',
    channel: 'Google · Spring Roofing Promo',
    score: 55,
    level: 'medium',
    outcome: 'Nurture',
    outcomeTone: 'neutral',
    duration: '3m 20s',
    when: 'Yesterday',
  },
  {
    summary: 'Asked about financing — routed to a human',
    channel: 'Meta · Spring Roofing Promo',
    score: 38,
    level: 'low',
    outcome: 'Needs review',
    outcomeTone: 'warning',
    duration: '2m 05s',
    when: '2d ago',
  },
  {
    summary: 'General warranty question, no project',
    channel: 'Google · HVAC Tune-Up',
    score: 29,
    level: 'low',
    outcome: 'Closed',
    outcomeTone: 'neutral',
    duration: '1m 12s',
    when: '3d ago',
  },
];

const LEVEL_TONE: Record<Row['level'], Tone> = {
  high: 'success',
  medium: 'warning',
  low: 'neutral',
};

export function TranscriptsTab() {
  return (
    <Card>
      <div className="panel-head">
        <div className="row" style={{ gap: '0.6rem' }}>
          <span className="panel-title">Recent conversations</span>
          <span className="panel-note">last 7 days</span>
        </div>
        <Chip tone="neutral" icon="filter">
          All channels
        </Chip>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Conversation</th>
              <th>Result</th>
              <th className="cell-num">Score</th>
              <th className="cell-num">Duration</th>
              <th className="cell-num">When</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="cell-strong">{r.summary}</div>
                  <div className="cell-muted" style={{ fontSize: 12 }}>
                    {r.channel}
                  </div>
                </td>
                <td>
                  <Chip tone={r.outcomeTone} dot>
                    {r.outcome}
                  </Chip>
                </td>
                <td className="cell-num">
                  <span className="row" style={{ justifyContent: 'flex-end', gap: '0.4rem' }}>
                    <span className="cell-strong tnum">{r.score}</span>
                    <Chip tone={LEVEL_TONE[r.level]} dot>
                      {r.level}
                    </Chip>
                  </span>
                </td>
                <td className="cell-num cell-muted">{r.duration}</td>
                <td className="cell-num cell-muted">{r.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
