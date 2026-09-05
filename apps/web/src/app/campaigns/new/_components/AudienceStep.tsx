'use client';

import { useState, type KeyboardEvent } from 'react';
import { Icon } from '@/components/Icon';
import { GENDERS, LANGUAGES, type StepProps } from './types';

/* ------------------------------------------------------------------ */
/* Chip input — type a value, press Enter (or comma) to add a chip.    */
/* Backs a string[] in wizard state; each chip removable via ×.        */
/* ------------------------------------------------------------------ */
function ChipInput({
  values,
  onChange,
  placeholder,
  ariaLabel,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const v = raw.trim().replace(/,+$/, '').trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      onChange([...values, v]);
    }
    setDraft('');
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && values.length) {
      remove(values[values.length - 1]);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.4rem',
        minHeight: 36,
        padding: '0.3rem 0.4rem',
        border: '1px solid var(--color-line-2)',
        borderRadius: 'var(--radius-control)',
        background: 'var(--color-surface)',
      }}
    >
      {values.map((v) => (
        <span key={v} className="chip chip-brand" style={{ gap: '0.3rem' }}>
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => remove(v)}
            style={{
              display: 'inline-grid',
              placeItems: 'center',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 0,
            }}
          >
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <input
        aria-label={ariaLabel}
        value={draft}
        placeholder={values.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        style={{
          flex: 1,
          minWidth: 150,
          height: 28,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--color-ink)',
          fontFamily: 'var(--font-sans)',
          fontSize: 13.5,
          padding: '0 0.3rem',
        }}
      />
    </div>
  );
}

export function AudienceStep({ state, patch }: StepProps) {
  // Local drafts let the age fields be typed freely; ordering + bounds are
  // enforced on commit (blur / Enter) so min never exceeds max.
  const [minDraft, setMinDraft] = useState(String(state.ageMin));
  const [maxDraft, setMaxDraft] = useState(String(state.ageMax));

  const clampAge = (n: number) => Math.min(Math.max(n, 18), 65);

  const commitMin = () => {
    const n = parseInt(minDraft, 10);
    const next = Math.min(Number.isNaN(n) ? state.ageMin : clampAge(n), state.ageMax);
    patch({ ageMin: next });
    setMinDraft(String(next));
  };
  const commitMax = () => {
    const n = parseInt(maxDraft, 10);
    const next = Math.max(Number.isNaN(n) ? state.ageMax : clampAge(n), state.ageMin);
    patch({ ageMax: next });
    setMaxDraft(String(next));
  };

  const toggleGender = (key: string) => {
    if (key === 'all') {
      patch({ genders: ['all'] });
      return;
    }
    const specifics = state.genders.filter((g) => g !== 'all');
    const next = specifics.includes(key)
      ? specifics.filter((g) => g !== key)
      : [...specifics, key];
    patch({ genders: next.length ? next : ['all'] });
  };

  const toggleLanguage = (lang: string) => {
    const next = state.languages.includes(lang)
      ? state.languages.filter((l) => l !== lang)
      : [...state.languages, lang];
    patch({ languages: next.length ? next : ['English'] });
  };

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: 18 }}>Who should see these ads?</h2>
        <p className="page-sub" style={{ marginTop: '0.25rem' }}>
          Define who the AI agent should reach. Tighter targeting means higher-intent
          conversations and a lower cost per qualified lead.
        </p>
      </div>

      {/* Locations */}
      <div className="field">
        <span className="field-label">Locations</span>
        <ChipInput
          values={state.locations}
          onChange={(locations) => patch({ locations })}
          placeholder="Add a city, region, or ZIP — e.g. Austin, TX or 78701"
          ariaLabel="Add a location"
        />
        {state.locations.length === 0 ? (
          <span className="muted" style={{ fontSize: 12.5 }}>
            <Icon name="globe" size={12} /> Anywhere — ads will run in every location you can serve.
          </span>
        ) : null}
      </div>

      <div className="grid grid-2" style={{ gap: '1rem' }}>
        {/* Age range */}
        <div className="field">
          <span className="field-label">Age range</span>
          <div className="row" style={{ gap: '0.6rem' }}>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={18}
              max={65}
              value={minDraft}
              aria-label="Minimum age"
              onChange={(e) => setMinDraft(e.target.value)}
              onBlur={commitMin}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitMin();
                }
              }}
              style={{ maxWidth: 100 }}
            />
            <span className="muted" aria-hidden="true">
              to
            </span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={18}
              max={65}
              value={maxDraft}
              aria-label="Maximum age"
              onChange={(e) => setMaxDraft(e.target.value)}
              onBlur={commitMax}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitMax();
                }
              }}
              style={{ maxWidth: 100 }}
            />
            <span className="muted" style={{ fontSize: 12.5 }}>
              {state.ageMax >= 65 ? '65 = 65+' : 'Homeowners, 18–65+'}
            </span>
          </div>
        </div>

        {/* Gender */}
        <div className="field">
          <span className="field-label">Gender</span>
          <div
            role="group"
            aria-label="Gender"
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              gap: 3,
              padding: 3,
              border: '1px solid var(--color-line-2)',
              borderRadius: 'var(--radius-control)',
              background: 'var(--color-inset)',
            }}
          >
            {GENDERS.map((g) => {
              const on = state.genders.includes(g.key);
              return (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleGender(g.key)}
                  style={{
                    padding: '0.35rem 0.95rem',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    fontWeight: 500,
                    background: on ? 'var(--color-brand)' : 'transparent',
                    color: on ? '#fff' : 'var(--color-ink-2)',
                    boxShadow: on ? 'var(--shadow-xs)' : 'none',
                  }}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Languages */}
      <div className="field">
        <span className="field-label">Languages</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {LANGUAGES.map((lang) => {
            const on = state.languages.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLanguage(lang)}
                className={`chip ${on ? 'chip-brand' : 'chip-neutral'}`}
                style={{ cursor: 'pointer' }}
              >
                {on ? <Icon name="check" size={12} /> : null}
                {lang}
              </button>
            );
          })}
        </div>
        <span className="muted" style={{ fontSize: 12.5 }}>
          The AI agent replies in the languages you select.
        </span>
      </div>

      {/* Interests / keywords */}
      <div className="field">
        <span className="field-label">Interests &amp; keywords</span>
        <ChipInput
          values={state.interests}
          onChange={(interests) => patch({ interests })}
          placeholder="e.g. roof repair, storm damage, HVAC replacement, home improvement"
          ariaLabel="Add an interest or keyword"
        />
        <span className="muted" style={{ fontSize: 12.5 }}>
          Signals the platforms use to find homeowners actively researching these services.
        </span>
      </div>
    </div>
  );
}
