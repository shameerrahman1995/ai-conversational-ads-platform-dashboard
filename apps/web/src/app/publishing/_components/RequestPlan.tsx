'use client';

import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Card, Chip, DefinitionList } from '@/components/ui';
import type { PublishPlan } from '@acp/api-client';

/* ------------------------------------------------------------------ */
/* Surfacing the REAL dry-run / request-plan data the publishing API   */
/* already returns. These are read-only presentational panels — they   */
/* never mutate a plan or change any status. Everything shown here is   */
/* the exact object the server handed back.                            */
/* ------------------------------------------------------------------ */

/** The full object `client.publishing.createPlan(...)` resolves to. */
export interface CreatePlanResult {
  plan: PublishPlan;
  validation?: unknown;
  capabilities?: unknown;
  snapshotId?: string | null;
  policy?: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const prettyKey = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const asList = (v: unknown): string | null =>
  Array.isArray(v) && v.length > 0 ? v.map((x) => prettyKey(String(x))).join(', ') : null;

const fmtBytes = (n: number): string =>
  n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`;

/** Monospace, scrollable raw-JSON block — the source of truth for a panel. */
export function RawJson({ value }: { value: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre
      style={{
        background: 'var(--color-inset)',
        color: 'var(--color-ink)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.5,
        margin: 0,
        padding: '0.7rem 0.8rem',
        borderRadius: 'var(--radius-control, 8px)',
        border: '1px solid var(--color-line)',
        overflowX: 'auto',
        maxHeight: 260,
        overflowY: 'auto',
        whiteSpace: 'pre',
      }}
    >
      {text}
    </pre>
  );
}

const yesNoChip = (v: unknown) =>
  v === true ? (
    <Chip tone="success" icon="check">
      Yes
    </Chip>
  ) : v === false ? (
    <Chip tone="neutral">No</Chip>
  ) : (
    <span className="cell-muted">—</span>
  );

/** Human-readable summary of a connector capabilities document, mapping the
 *  known ConnectorCapabilities keys to labels, then the raw JSON underneath. */
export function CapabilitiesSummary({ caps }: { caps: unknown }) {
  const items: { label: string; value: ReactNode }[] = [];
  if (isRecord(caps)) {
    const push = (label: string, value: ReactNode) => {
      if (value != null && value !== '') items.push({ label, value });
    };
    if (typeof caps.platform === 'string') push('Platform', prettyKey(caps.platform));
    if (typeof caps.accountId === 'string') push('Account', <span className="tnum">{caps.accountId}</span>);
    push('Objectives', asList(caps.objectives));
    push('Placements', asList(caps.placements));
    push('Regions', asList(caps.regions));
    push('Supported formats', asList(caps.supportedFormats));
    if ('supportsHtml5' in caps) push('Interactive HTML5', yesNoChip(caps.supportsHtml5));
    if ('supportsNativeLeadForms' in caps)
      push('Native lead forms', yesNoChip(caps.supportsNativeLeadForms));
    if (typeof caps.maxBundleBytes === 'number')
      push('Max bundle size', <span className="tnum">{fmtBytes(caps.maxBundleBytes)}</span>);
    if (typeof caps.notes === 'string') push('Notes', caps.notes);
  }
  return (
    <div className="stack" style={{ gap: '0.6rem' }}>
      {items.length > 0 ? <DefinitionList items={items} /> : null}
      <RawJson value={caps} />
    </div>
  );
}

/** Dry-run preview: what the destination account supports, BEFORE creating a
 *  plan. Read-only — nothing is created or pushed by fetching this. */
export function CapabilitiesPreview({ caps }: { caps: unknown }) {
  return (
    <Card className="card-pad" style={{ background: 'var(--color-surface-2)' }}>
      <div className="row" style={{ gap: '0.5rem', marginBottom: '0.6rem' }}>
        <span className="stat-ic">
          <Icon name="eye" size={15} />
        </span>
        <div>
          <div style={{ fontWeight: 600 }}>Destination capabilities (dry run)</div>
          <div className="muted" style={{ fontSize: 12 }}>
            A preview of what this account supports. Nothing is created or published.
          </div>
        </div>
      </div>
      <CapabilitiesSummary caps={caps} />
    </Card>
  );
}

const validationTone = (validation: unknown) => {
  if (isRecord(validation) && typeof validation.ok === 'boolean')
    return validation.ok ? 'success' : 'danger';
  return 'neutral';
};

const policyTone = (policy: unknown) => {
  if (isRecord(policy) && typeof policy.ok === 'boolean') return policy.ok ? 'success' : 'warning';
  return 'neutral';
};

function Section({
  icon,
  title,
  hint,
  chip,
  children,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  chip?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="card-pad" style={{ background: 'var(--color-surface-2)' }}>
      <div className="spread" style={{ alignItems: 'flex-start', marginBottom: '0.6rem' }}>
        <span className="row" style={{ gap: '0.5rem' }}>
          <span className="stat-ic">
            <Icon name={icon} size={15} />
          </span>
          <span>
            <div style={{ fontWeight: 600 }}>{title}</div>
            {hint ? (
              <div className="muted" style={{ fontSize: 12 }}>
                {hint}
              </div>
            ) : null}
          </span>
        </span>
        {chip ?? null}
      </div>
      {children}
    </Card>
  );
}

/** The "Request plan" — the full context the server returned when the plan was
 *  created: the pinned snapshot, connector validation, destination capabilities
 *  and the compliance policy read. All read-only; the plan itself starts paused
 *  in review and only serves once approved and executed. */
export function RequestPlanDetails({ result }: { result: CreatePlanResult }) {
  const snapshotId = result.snapshotId ?? result.plan.snapshotId ?? null;
  return (
    <div className="stack" style={{ gap: '0.85rem' }}>
      <div
        className="chip chip-info"
        style={{ alignSelf: 'flex-start' }}
      >
        <Icon name="shield" size={12} /> Created paused, in review — it only serves once approved and
        executed
      </div>

      <Section
        icon="database"
        title="Pinned snapshot"
        hint="The immutable campaign version this plan is locked to — later edits start a new version."
        chip={snapshotId ? <Chip tone="brand" icon="lock">Pinned</Chip> : <Chip tone="neutral">None</Chip>}
      >
        <div className="tnum" style={{ fontSize: 13, wordBreak: 'break-all' }}>
          {snapshotId ?? <span className="cell-muted">No campaign version pinned</span>}
        </div>
      </Section>

      {result.validation !== undefined ? (
        <Section
          icon="check-circle"
          title="Connector validation"
          hint="The destination's pre-flight check on this creative."
          chip={
            <Chip tone={validationTone(result.validation)}>
              {isRecord(result.validation) && result.validation.ok === true
                ? 'Valid'
                : isRecord(result.validation) && result.validation.ok === false
                  ? 'Issues found'
                  : 'Reported'}
            </Chip>
          }
        >
          <RawJson value={result.validation} />
        </Section>
      ) : null}

      {result.capabilities !== undefined ? (
        <Section
          icon="eye"
          title="Destination capabilities"
          hint="What the connected account supports for this push."
        >
          <CapabilitiesSummary caps={result.capabilities} />
        </Section>
      ) : null}

      {result.policy !== undefined ? (
        <Section
          icon="shield-check"
          title="Compliance policy"
          hint="The vertical rule-pack read recorded against this plan."
          chip={
            <Chip tone={policyTone(result.policy)}>
              {isRecord(result.policy) && result.policy.ok === true
                ? 'Clear'
                : isRecord(result.policy) && result.policy.ok === false
                  ? 'Needs review'
                  : 'Reported'}
            </Chip>
          }
        >
          <RawJson value={result.policy} />
        </Section>
      ) : null}
    </div>
  );
}
