'use client';

import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Icon, type IconName } from '@/components/Icon';
import { PageHeader, Button, StatCard, Card, Chip, DataState } from '@/components/ui';
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
        blurb: 'Search & Performance Max for high-intent roofing and HVAC queries.',
      },
      {
        key: 'meta',
        name: 'Meta Ads',
        blurb: 'Facebook and Instagram lead forms piped straight to the AI agent.',
      },
      {
        key: 'tiktok',
        name: 'TikTok Ads',
        blurb: 'Short-form Spark Ads for storm-damage and AC-repair demand.',
      },
      {
        key: 'microsoft',
        name: 'Microsoft Advertising',
        blurb: 'Bing search coverage for older, higher-value homeowners.',
      },
      {
        key: 'amazon_dsp',
        name: 'Amazon DSP',
        blurb: 'Programmatic display retargeting across Amazon inventory.',
      },
      {
        key: 'linkedin',
        name: 'LinkedIn Ads',
        blurb: 'Reach property managers and facilities buyers with B2B lead forms.',
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
    note: 'Where the AI agent books estimates and consultations',
    icon: 'clock',
    providers: [
      {
        key: 'google_calendar',
        name: 'Google Calendar',
        blurb: "Let the agent book on-site estimates on your crew's calendar.",
      },
      {
        key: 'calendly',
        name: 'Calendly',
        blurb: 'Hand qualified homeowners a scheduling link to self-book.',
      },
    ],
  },
];

const WEBHOOK: Provider = {
  key: 'webhooks',
  name: 'Outbound webhooks',
  blurb: 'Post lead and status events to your own endpoint with signed payloads.',
};

export default function ConnectionsPage() {
  const client = useApiClient();
  const { data, error, loading } = useAsync(() => client.connections.list(), [client]);

  const connections = data ?? [];
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const webhookConn = byProvider.get(WEBHOOK.key) ?? null;

  const allProviders = [...CATALOG.flatMap((c) => c.providers), WEBHOOK];
  const totalCount = allProviders.length;
  const connectedCount = connections.filter((c) => c.status === 'CONNECTED').length;
  const attentionCount = connections.filter(
    (c) => c.status === 'DEGRADED' || c.status === 'REAUTH_REQUIRED',
  ).length;
  const linkedProviders = new Set(connections.map((c) => c.provider));
  const availableCount = totalCount - linkedProviders.size;

  const totalCategories = 4; // ad networks, CRM, calendar, webhooks
  const coveredCategories =
    CATALOG.filter((cat) => cat.providers.some((p) => linkedProviders.has(p.key))).length +
    (webhookConn ? 1 : 0);

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
        subtitle="Connect the ad networks, CRM, and calendar that power your campaigns and lead routing. Tokens are stored server-side and never exposed to the browser."
        actions={
          <>
            <Button icon="refresh" variant="ghost">
              Refresh status
            </Button>
            <Button icon="plus" variant="primary">
              Add connection
            </Button>
          </>
        }
      />

      <DataState loading={loading} error={error} loadingLabel="Loading your connections…">
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
            footNote="Re-auth required or degraded"
          />
          <StatCard
            label="Available to connect"
            value={availableCount}
            icon="plus"
            footNote="Across ads, CRM & calendar"
          />
          <StatCard
            label="Categories covered"
            value={`${coveredCategories} / ${totalCategories}`}
            icon="overview"
            footNote="Networks, CRM, calendar, webhooks"
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
                    connection={byProvider.get(p.key)}
                  />
                ))}
              </div>
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
                  Send events to your own systems in real time
                </div>
              </div>
            </div>
            <Chip tone={webhookConn ? 'success' : 'neutral'} dot={!!webhookConn}>
              {webhookConn ? '1 endpoint active' : 'No endpoints yet'}
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
                    {WEBHOOK.blurb} Every request is signed with HMAC-SHA256 and failed
                    deliveries retry with exponential backoff.
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: '0.4rem', flex: 'none' }}>
                <Button variant="ghost" size="sm" icon="doc">
                  View docs
                </Button>
                <Button variant="primary" size="sm" icon="plus">
                  Add endpoint
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
              OAuth access and refresh tokens are held in the secrets manager and referenced only
              by <code style={codeStyle}>secretRef</code> — never written to app rows, logs, or the
              client. Each connection carries only the scopes its provider needs, and revoking
              access takes effect immediately with one click.
            </div>
          </div>
        </Card>
      </DataState>
    </div>
  );
}
