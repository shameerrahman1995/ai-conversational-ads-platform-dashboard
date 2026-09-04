'use client';

import { Icon } from '@/components/Icon';
import { BID_STRATEGIES, type StepProps } from './types';

const CURRENCIES: { code: string; symbol: string }[] = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'AUD', symbol: 'A$' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (from: string, n: number) => {
  const d = new Date(`${from || iso(new Date())}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};

export function BudgetStep({ state, patch }: StepProps) {
  const today = iso(new Date());
  const symbol = CURRENCIES.find((c) => c.code === state.currency)?.symbol ?? '$';
  const fmt = (n: number) => `${symbol}${Math.round(n).toLocaleString()}`;

  const validAmount = Number.isFinite(state.budgetAmount) && state.budgetAmount > 0;
  const ongoing = !state.endDate;

  // Inclusive length of a lifetime flight, when both dates are set.
  const flightDays = (() => {
    if (state.budgetType !== 'lifetime' || !state.startDate || !state.endDate) return null;
    const start = new Date(`${state.startDate}T00:00:00`).getTime();
    const end = new Date(`${state.endDate}T00:00:00`).getTime();
    const days = Math.round((end - start) / 86_400_000) + 1;
    return days > 0 ? days : null;
  })();

  // Rough guidance figures, derived purely from state (no API).
  const estimate = (() => {
    if (!validAmount) return null;
    if (state.budgetType === 'daily') {
      return {
        headline: `≈ ${fmt(state.budgetAmount * 30)} / month`,
        detail: 'Your daily budget × 30 days. Actual daily spend can run a little over or under to catch the best results.',
      };
    }
    if (flightDays) {
      const perDay = state.budgetAmount / flightDays;
      return {
        headline: `≈ ${fmt(perDay * 30)} / month`,
        detail: `${fmt(state.budgetAmount)} spread across a ${flightDays}-day flight — about ${fmt(perDay)} / day.`,
      };
    }
    return {
      headline: `${fmt(state.budgetAmount)} total`,
      detail: 'Add an end date and we can estimate the monthly pace of this lifetime budget.',
    };
  })();

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: 18 }}>Set your budget &amp; schedule</h2>
        <p className="page-sub" style={{ marginTop: '0.25rem' }}>
          Decide how much to spend and when the campaign runs. Nothing spends until you approve and publish an ad.
        </p>
      </div>

      {/* Budget type — segmented toggle */}
      <div className="field">
        <span className="field-label">Budget type</span>
        <div
          role="group"
          aria-label="Budget type"
          style={{
            display: 'inline-flex',
            gap: 3,
            padding: 3,
            width: 'fit-content',
            background: 'var(--color-inset)',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          {(['daily', 'lifetime'] as const).map((t) => {
            const on = state.budgetType === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => patch({ budgetType: t })}
                style={{
                  padding: '0.4rem 1rem',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  background: on ? 'var(--color-surface)' : 'transparent',
                  color: on ? 'var(--color-ink)' : 'var(--color-ink-2)',
                  boxShadow: on ? 'var(--shadow-xs)' : 'none',
                }}
              >
                {t === 'daily' ? 'Daily' : 'Lifetime'}
              </button>
            );
          })}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {state.budgetType === 'daily'
            ? 'Spend up to this amount on an average day.'
            : 'Spend this total across the entire campaign.'}
        </span>
      </div>

      {/* Amount + currency */}
      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <label className="field">
          <span className="field-label">
            {state.budgetType === 'daily' ? 'Daily budget' : 'Lifetime budget'}
          </span>
          <div style={{ position: 'relative' }}>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '0.7rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-ink-3)',
                fontSize: 13.5,
                pointerEvents: 'none',
              }}
            >
              {symbol}
            </span>
            <input
              className="input tnum"
              type="number"
              min={1}
              step={10}
              inputMode="decimal"
              value={Number.isFinite(state.budgetAmount) ? state.budgetAmount : ''}
              placeholder="50"
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                patch({ budgetAmount: Number.isFinite(n) ? Math.max(0, n) : 0 });
              }}
              style={{ paddingLeft: symbol.length > 1 ? '2.2rem' : '1.6rem' }}
            />
          </div>
          {!validAmount ? (
            <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              Enter an amount greater than 0.
            </span>
          ) : null}
        </label>

        <label className="field">
          <span className="field-label">Currency</span>
          <select
            className="select"
            value={state.currency}
            onChange={(e) => patch({ currency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} ({c.symbol})
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Bid strategy */}
      <label className="field">
        <span className="field-label">Bid strategy</span>
        <select
          className="select"
          value={state.bidStrategy}
          onChange={(e) => patch({ bidStrategy: e.target.value })}
        >
          {BID_STRATEGIES.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>
          How the platform spends your budget to hit the objective.
        </span>
      </label>

      {/* Schedule */}
      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <label className="field">
          <span className="field-label">Start date</span>
          <input
            className="input"
            type="date"
            value={state.startDate}
            min={today}
            onChange={(e) => patch({ startDate: e.target.value })}
          />
        </label>

        <div className="field">
          <span
            className="field-label"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
          >
            <span>End date</span>
            <label className="row" style={{ gap: '0.35rem', fontWeight: 500, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={ongoing}
                onChange={(e) =>
                  patch({ endDate: e.target.checked ? '' : addDays(state.startDate, 30) })
                }
              />
              Ongoing (no end date)
            </label>
          </span>
          <input
            className="input"
            type="date"
            value={state.endDate}
            min={state.startDate || today}
            disabled={ongoing}
            onChange={(e) => patch({ endDate: e.target.value })}
            style={ongoing ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            {ongoing ? 'Runs continuously until you pause it.' : 'Delivery stops at the end of this day.'}
          </span>
        </div>
      </div>

      {/* Estimate helper */}
      {estimate ? (
        <div
          className="card"
          style={{
            padding: '1rem 1.15rem',
            background: 'var(--color-surface-2)',
            display: 'flex',
            gap: '0.85rem',
            alignItems: 'flex-start',
          }}
        >
          <span className="stat-ic" style={{ flex: 'none' }}>
            <Icon name="bolt" size={16} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              className="field-label"
              style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11 }}
            >
              Estimated spend
            </div>
            <div
              className="tnum"
              style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginTop: 2 }}
            >
              {estimate.headline}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {estimate.detail} This is a rough estimate, not a guarantee.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
