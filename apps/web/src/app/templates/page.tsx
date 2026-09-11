'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, EmptyState, Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { TemplateCard } from './_components/TemplateCard';
import { PreviewModal } from './_components/PreviewModal';
import type { Template } from './_components/types';

/* ------------------------------------------------------------------ */
/* Curated catalog. There is no /templates backend — this is a hand-   */
/* built starting-point library, so each blueprint is real and         */
/* specific about what its agent captures and how it converts.         */
/* ------------------------------------------------------------------ */
const TEMPLATES: Template[] = [
  {
    id: 're-buyer-qualifier',
    name: 'Real-estate buyer qualifier',
    industry: 'Real estate',
    tag: 'High intent',
    description:
      'Turn listing clicks into booked viewings. The agent captures budget, financing status and move-in timeline, then routes mortgage-ready buyers straight to your calendar.',
    objective: 'Qualified viewing bookings',
    platforms: ['meta', 'google'],
    states: ['Hook', 'Budget & area', 'Ask AI', 'Financing check', 'Book viewing'],
  },
  {
    id: 'auto-test-drive',
    name: 'Automotive test-drive booking',
    industry: 'Automotive',
    tag: 'Lead gen',
    description:
      'Drive dealership foot traffic. Matches shoppers to in-stock models, answers trim and finance questions, and books a test drive at the nearest location.',
    objective: 'Test-drive appointments',
    platforms: ['meta', 'google', 'tiktok'],
    states: ['Hook', 'Model match', 'Ask AI', 'Trade-in & finance', 'Book test drive'],
  },
  {
    id: 'saas-demo-intent',
    name: 'SaaS demo-intent capture',
    industry: 'SaaS',
    tag: 'B2B',
    description:
      'Qualify pipeline before sales spends a minute. Screens for company size, use case and buying role, filters out tire-kickers, and books a demo with the right AE.',
    objective: 'Demo requests',
    platforms: ['google', 'meta'],
    states: ['Hook', 'Use case', 'Ask AI', 'Qualify (BANT)', 'Book demo'],
  },
  {
    id: 'health-consult-restricted',
    name: 'Healthcare consult (restricted)',
    industry: 'Healthcare',
    tag: 'Recommended',
    description:
      'Compliance-first intake for regulated categories. Avoids health claims, gathers explicit consent, and hands off to a consult booking — no diagnosis, no PHI stored in chat.',
    objective: 'Consult booking (restricted)',
    platforms: ['google', 'publisher'],
    states: ['Hook', 'Eligibility', 'Consent', 'Ask AI', 'Book consult'],
  },
  {
    id: 'd2c-product-explainer',
    name: 'D2C product explainer',
    industry: 'D2C / Ecommerce',
    tag: 'Awareness',
    description:
      'Warm up cold traffic with a guided product walkthrough. Answers "is this right for me?", surfaces the best-fit SKU, and captures an email for a first-order offer.',
    objective: 'Product education & signups',
    platforms: ['tiktok', 'meta', 'publisher'],
    states: ['Hook', 'Explore', 'Ask AI', 'Match product', 'Capture email'],
  },
  {
    id: 'local-service-callback',
    name: 'Local service call-back',
    industry: 'Local services',
    tag: 'Recommended',
    description:
      'For plumbers, HVAC, legal and home services. Captures job type, urgency and postcode, quotes a ballpark, and schedules a call-back inside your service window.',
    objective: 'Call-back requests',
    platforms: ['google', 'meta'],
    states: ['Hook', 'Job & urgency', 'Ask AI', 'Service area', 'Request call-back'],
  },
];

const ALL = 'All industries';

export default function TemplatesPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState<string>(ALL);
  const [preview, setPreview] = useState<Template | null>(null);

  const industries = useMemo(
    () => [ALL, ...Array.from(new Set(TEMPLATES.map((t) => t.industry)))],
    [],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      if (industry !== ALL && t.industry !== industry) return false;
      if (q) {
        const hay = `${t.name} ${t.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [query, industry]);

  const filtersActive = query.trim() !== '' || industry !== ALL;

  /** A template is a starting point for a new draft — stash it, then open the wizard. */
  function useTemplate(t: Template) {
    try {
      localStorage.setItem('acp-template', t.id);
    } catch {
      /* storage may be unavailable (private mode) — proceed anyway */
    }
    router.push('/campaigns/new');
  }

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="Reusable campaign & creative blueprints — start from a proven structure."
      />

      {/* Toolbar: search + industry filter + count note */}
      <div
        className="row"
        style={{ flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.1rem' }}
      >
        <div className="searchbar">
          <div className="searchbar-field">
            <Icon name="search" size={16} />
            <input
              className="searchbar-input"
              type="search"
              placeholder="Search templates…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search templates"
            />
            {query ? (
              <button
                type="button"
                className="searchbar-clear"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </div>
        </div>

        <select
          className="select"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          aria-label="Filter by industry"
          style={{ width: 'auto', minWidth: 180 }}
        >
          {industries.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>

        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
          Showing {visible.length} of {TEMPLATES.length} templates
        </span>
      </div>

      {/* Grid */}
      {visible.length > 0 ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
        >
          {visible.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onUse={useTemplate}
              onPreview={setPreview}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="doc"
          title="No templates match your filters"
          hint="Try a different industry or clear your search to see the full catalog of blueprints."
          action={
            filtersActive ? (
              <Button
                icon="refresh"
                onClick={() => {
                  setQuery('');
                  setIndustry(ALL);
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}

      {preview ? (
        <PreviewModal
          template={preview}
          onClose={() => setPreview(null)}
          onUse={useTemplate}
        />
      ) : null}
    </div>
  );
}
