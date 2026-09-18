'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Icon, type IconName } from '@/components/Icon';
import { PageHeader, Button, StatCard, Card, Chip, DataState, Skeleton } from '@/components/ui';
import { useToast, Modal } from '@/components/feedback';
import { ConnectorCard } from './_components/ConnectorCard';

interface Provider {
  key: string;
  name: string;
  blurb: string;
}

interface Category {
  key: string;
  label: string;
  note: string;
  icon: IconName;
  providers: Provider[];
}

/**
 * The integrations catalog. Provider `key`s match the `provider` field returned
 * by `connections.list()`, so live connections merge in by key.
 */
const CATALOG: Category[] = [
  {
    key: 'networks',
    label: 'Ad networks',
    note: 'Where campaigns run and spend is reported back',
    icon: 'globe',
    providers: [
      {
        key: 'google_ads',
        name: 'Google Ads',
        blurb: 'Search & Performance Max for high-intent queries.',
      },
      {
        key: 'meta',
        name: 'Meta Ads',
        blurb: 'Facebook and Instagram lead forms piped straight to the AI agent.',
      },
      {
        key: 'tiktok',
        name: 'TikTok Ads',
        blurb: 'Short-form Spark Ads for mobile-first discovery.',
      },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    note: 'Where qualified leads and revenue are written back',
    icon: 'database',
    providers: [
      {
        key: 'hubspot',
        name: 'HubSpot',
        blurb: 'Push qualified leads and write back deal stage and won revenue.',
      },
      {
        key: 'salesforce',
        name: 'Salesforce',
        blurb: 'Sync to Sales Cloud and map ConvoAds fields onto your objects.',
      },
      {
        key: 'zoho',
        name: 'Zoho CRM',
        blurb: 'Create contacts and deals from every qualified conversation.',
      },
    ],
  },
  {
    key: 'calendar',
    label: 'Calendar',
    note: 'Where the AI agent books meetings and consultations',
    icon: 'clock',
    providers: [
      {
        key: 'google_calendar',
        name: 'Google Calendar',
        blurb: 'Let the agent book meetings on your team calendar.',
      },
      {
        key: 'calendly',
        name: 'Calendly',
        blurb: 'Hand qualified leads a scheduling link to self-book.',
      },
    ],
  },
  {
    key: 'ai_media',
    label: 'AI voice & video',
    note: 'What gives the sales agent a voice and a face',
    icon: 'sparkles',
    providers: [
      {
        key: 'elevenlabs',
        name: 'ElevenLabs',
        blurb: 'Natural text-to-speech so the agent can answer out loud.',
      },
      {
        key: 'deepgram',
        name: 'Deepgram',
        blurb: 'Real-time speech-to-text that transcribes callers as they speak.',
      },
      {
        key: 'heygen',
        name: 'HeyGen',
        blurb: 'Render a talking avatar that walks visitors through an offer.',
      },
      {
        key: 'd_id',
        name: 'D-ID',
        blurb: 'Photoreal avatar streaming for a face-to-face chat experience.',
      },
    ],
  },
];

const WEBHOOK: Provider = {
  key: 'webhooks',
  name: 'Outbound webhooks',
  blurb: 'Post lead and status events to your own endpoint with signed payloads.',
};

const CATEGORY_COUNT = CATALOG.length + 1; // catalog groups + webhooks

/* ------------------------------------------------------------------ */
/* First-load skeleton — content-shaped (KPI strip + catalog card       */
/* grids) so first paint shows structure, not a spinner.                */
/* `.skeleton` already respects prefers-reduced-motion.                 */
/* ------------------------------------------------------------------ */
function ConnectorCardSkeleton() {
  return (
    <Card className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <div className="row" style={{ gap: '0.7rem', alignItems: 'flex-start' }}>
        <Skeleton width={34} height={34} radius={10} />
        <div style={{ display: 'grid', gap: 6, flex: 1 }}>
          <Skeleton width="55%" height={15} radius={6} />
          <Skeleton width="90%" height={12} radius={6} />
          <Skeleton width="75%" height={12} radius={6} />
        </div>
      </div>
      <Skeleton width={110} height={30} radius={8} />
    </Card>
  );
}

function ConnectionsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your connections…</span>
      <div className="grid grid-kpi">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card stat">
            <div className="stat-top">
              <Skeleton width="50%" height={12} radius={6} />
              <Skeleton width={30} height={30} radius={9} />
            </div>
            <div style={{ marginTop: '0.55rem' }}>
              <Skeleton width="45%" height={28} radius={8} />
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <Skeleton width="70%" height={12} radius={6} />
            </div>
          </div>
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, s) => (
        <section key={s}>
          <div className="spread" style={{ margin: '1.6rem 0 0.9rem', alignItems: 'flex-end' }}>
            <div className="row" style={{ gap: '0.65rem', alignItems: 'center' }}>
              <Skeleton width={30} height={30} radius={9} />
              <div style={{ display: 'grid', gap: 6 }}>
                <Skeleton width={130} height={16} radius={6} />
                <Skeleton width={200} height={12} radius={6} />
              </div>
            </div>
            <Skeleton width={110} height={22} radius={999} />
          </div>
          <div className="grid grid-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <ConnectorCardSkeleton key={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function ConnectionsPage() {
  const client = useApiClient();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [docsOpen, setDocsOpen] = useState(false);
  const { data, error, loading } = useAsync(() => client.connections.list(), [client, reload]);

  const refetch = () => setReload((n) => n + 1);

  const connections = data ?? [];
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const webhookConn = byProvider.get(WEBHOOK.key) ?? null;

  const allProviders = [...CATALOG.flatMap((c) => c.providers), WEBHOOK];
  const totalCount = allProviders.length;
  const connectedCount = connections.filter((c) => c.status === 'CONNECTED').length;
  const attentionCount = connections.filter(
    (c) =>
      c.status === 'DEGRADED' ||
      c.status === 'REAUTH_REQUIRED' ||
      c.status === 'REVOKED' ||
      c.status === 'DISCONNECTED',
  ).length;
  const linkedProviders = new Set(connections.map((c) => c.provider));
  const availableCount = totalCount - linkedProviders.size;

  const coveredCategories =
    CATALOG.filter((cat) => cat.providers.some((p) => linkedProviders.has(p.key))).length +
    (webhookConn ? 1 : 0);

  function refresh() {
    refetch();
    toast.success('Connection status refreshed');
  }

  const codeStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    background: 'var(--color-inset)',
    padding: '0.05rem 0.35rem',
    borderRadius: 4,
    color: 'var(--color-ink-2)',
  };

  return (
    <div>
      <PageHeader
        title="Connections"
        subtitle="Connect the ad networks, CRM, calendar, and AI voice & video providers that power your campaigns, lead routing, and the sales agent. Tokens are stored server-side and never exposed to the browser."
        actions={
          <Button icon="refresh" variant="ghost" onClick={refresh} disabled={loading}>
            Refresh status
          </Button>
        }
      />

      {loading ? <ConnectionsSkeleton /> : (
      <DataState
        loading={false}
        error={error}
        loadingLabel="Loading your connections…"
        onRetry={refetch}
      >
        {/* Summary row */}
        <div className="grid grid-kpi">
          <StatCard
            label="Connected"
            value={connectedCount}
            icon="link"
            footNote="Actively syncing data"
          />
          <StatCard
            label="Needs attention"
            value={attentionCount}
            icon="alert"
            footNote="Degraded, re-auth, revoked or disconnected"
          />
          <StatCard
            label="Available to connect"
            value={availableCount}
            icon="plus"
            footNote="Across ads, CRM, calendar & AI"
          />
          <StatCard
            label="Categories covered"
            value={`${coveredCategories} / ${CATEGORY_COUNT}`}
            icon="overview"
            footNote="Networks, CRM, calendar, AI, webhooks"
          />
        </div>

        {/* Catalog sections */}
        {CATALOG.map((cat) => {
          const catConnected = cat.providers.filter((p) => {
            const c = byProvider.get(p.key);
            return c && c.status === 'CONNECTED';
          }).length;
          return (
            <section key={cat.key}>
              <div className="spread" style={{ margin: '1.6rem 0 0.9rem', alignItems: 'flex-end' }}>
                <div className="row" style={{ gap: '0.65rem', alignItems: 'center' }}>
                  <span className="stat-ic">
                    <Icon name={cat.icon} size={16} />
                  </span>
                  <div>
                    <h2 style={{ fontSize: 16, lineHeight: 1.2 }}>{cat.label}</h2>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {cat.note}
                    </div>
                  </div>
                </div>
                <Chip tone={catConnected > 0 ? 'success' : 'neutral'} dot={catConnected > 0}>
                  {catConnected > 0
                    ? `${catConnected} of ${cat.providers.length} connected`
                    : `${cat.providers.length} available`}
                </Chip>
              </div>
              <div className="grid grid-3">
                {cat.providers.map((p) => (
                  <ConnectorCard
                    key={p.key}
                    name={p.name}
                    blurb={p.blurb}
                    icon={cat.icon}
                    provider={p.key}
                    connection={byProvider.get(p.key)}
                    onChanged={refetch}
                  />
                ))}
              </div>
              {cat.key === 'ai_media' ? (
                <div
                  className="row"
                  style={{
                    gap: '0.55rem',
                    alignItems: 'center',
                    marginTop: '0.8rem',
                    color: 'var(--color-ink-2)',
                    fontSize: 12.5,
                  }}
                >
                  <Icon name="agents" size={14} />
                  <span>
                    Once a provider is connected, turn on voice or an avatar for a specific agent on
                    the Agents page.
                  </span>
                </div>
              ) : null}
            </section>
          );
        })}

        {/* Webhooks — distinct, developer-facing treatment */}
        <section>
          <div className="spread" style={{ margin: '1.6rem 0 0.9rem', alignItems: 'flex-end' }}>
            <div className="row" style={{ gap: '0.65rem', alignItems: 'center' }}>
              <span className="stat-ic">
                <Icon name="link" size={16} />
              </span>
              <div>
                <h2 style={{ fontSize: 16, lineHeight: 1.2 }}>Webhooks</h2>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  Developer feature — endpoints are configured via the API, not the dashboard
                </div>
              </div>
            </div>
            <Chip tone="info" icon="doc">
              Configured via API
            </Chip>
          </div>
          <Card className="card-pad">
            <div className="spread" style={{ gap: '1rem', alignItems: 'flex-start' }}>
              <div className="row" style={{ gap: '0.7rem', alignItems: 'flex-start' }}>
                <span className="stat-ic">
                  <Icon name="link" size={16} />
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{WEBHOOK.name}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2, maxWidth: '62ch' }}>
                    {WEBHOOK.blurb} Every request is signed with HMAC-SHA256 and failed deliveries
                    retry with exponential backoff. Endpoints are created and rotated through the
                    ConvoAds API — there is no add-endpoint form in the dashboard.
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: '0.4rem', flex: 'none' }}>
                <Button variant="ghost" size="sm" icon="doc" onClick={() => setDocsOpen(true)}>
                  How webhooks work
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* Security note — the compliance spine of the product */}
        <Card
          className="card-pad row"
          style={{ marginTop: '1.6rem', gap: '0.85rem', alignItems: 'flex-start' }}
        >
          <span
            className="stat-ic"
            style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}
          >
            <Icon name="shield" size={16} />
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>Your tokens never touch the browser</div>
            <div className="muted" style={{ fontSize: 13, maxWidth: '82ch' }}>
              OAuth access and refresh tokens are held in the secrets manager and referenced only by{' '}
              <code style={codeStyle}>secretRef</code> — never written to app rows, logs, or the
              client. Each connection carries only the scopes its provider needs, and revoking access
              takes effect immediately with one click.
            </div>
          </div>
        </Card>
      </DataState>
      )}

      <Modal
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        title="How webhooks work"
        width={540}
        footer={
          <Button variant="primary" onClick={() => setDocsOpen(false)}>
            Got it
          </Button>
        }
      >
        <div className="stack" style={{ gap: '0.9rem', fontSize: 13 }}>
          <p style={{ margin: 0 }} className="muted">
            ConvoAds posts an event to your endpoint whenever a lead is qualified, delivered, or
            changes lifecycle stage — so your own systems stay in sync without polling.
          </p>
          <div>
            <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Delivery guarantees</div>
            <ul className="muted" style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.7 }}>
              <li>
                Each request carries an{' '}
                <code style={codeStyle}>X-ConvoAds-Signature</code> HMAC-SHA256 header you verify
                with your signing secret.
              </li>
              <li>Non-2xx responses retry with exponential backoff for up to 24 hours.</li>
              <li>
                Payloads are versioned and idempotent — dedupe on the{' '}
                <code style={codeStyle}>event.id</code>.
              </li>
            </ul>
          </div>
          <div
            className="row"
            style={{
              gap: '0.55rem',
              alignItems: 'flex-start',
              background: 'var(--color-inset)',
              borderRadius: 8,
              padding: '0.7rem 0.8rem',
            }}
          >
            <Icon name="shield" size={14} />
            <span className="muted" style={{ fontSize: 12.5 }}>
              Signing secrets live in the secrets manager, never in the dashboard. Rotate them from
              the API with zero downtime.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
