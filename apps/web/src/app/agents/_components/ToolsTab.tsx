'use client';

import Link from 'next/link';
import type { IconName } from '@/components/Icon';
import type { AgentSettings, Connection } from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Card, Chip } from '@/components/ui';
import { IconTile, Toggle, SaveBar } from './primitives';

export type ToolKey = 'booking' | 'crm' | 'pricing';
type Tools = AgentSettings['tools'];
type ReqKind = 'calendar' | 'crm' | 'pricing';

// Provider keys as returned by connections.list() (see connections catalog).
const CALENDAR_PROVIDERS = ['google_calendar', 'microsoft_365'];
const CRM_PROVIDERS = ['hubspot', 'salesforce', 'zoho', 'webhook'];

interface ToolDef {
  key: ToolKey;
  icon: IconName;
  name: string;
  desc: string;
  req: ReqKind;
  /** Copy shown when the prerequisite is satisfied. */
  metLabel: string;
  /** Copy shown when it isn't. */
  missingLabel: string;
  /** How to satisfy it when missing. */
  missingHint: string;
}

const TOOLS: ToolDef[] = [
  {
    key: 'booking',
    icon: 'clock',
    name: 'Book a meeting',
    desc: 'Offers open slots and books a free roof inspection straight onto the calendar.',
    req: 'calendar',
    metLabel: 'Calendar connected',
    missingLabel: 'No calendar connected',
    missingHint: 'Connect Google Calendar or Microsoft 365 so the agent can offer and book real slots.',
  },
  {
    key: 'crm',
    icon: 'link',
    name: 'Send to CRM',
    desc: 'Pushes qualified leads and the conversation summary to your CRM in real time.',
    req: 'crm',
    metLabel: 'CRM connected',
    missingLabel: 'No CRM connected',
    missingHint: 'Connect HubSpot, Salesforce, Zoho, or a webhook so leads can be routed automatically.',
  },
  {
    key: 'pricing',
    icon: 'billing',
    name: 'Fetch pricing',
    desc: 'Looks up ballpark price ranges from approved pricing sheets before quoting.',
    req: 'pricing',
    metLabel: 'Pricing source ready',
    missingLabel: 'No pricing source',
    missingHint: 'Add a pricing sheet on the Knowledge tab and approve its facts so the agent can quote.',
  },
];

export function ToolsTab({
  tools,
  saved,
  busy,
  hasPricingSource,
  onChange,
  onSave,
}: {
  tools: Tools;
  saved: Tools;
  busy: boolean;
  hasPricingSource: boolean;
  onChange: (patch: Partial<AgentSettings>) => void;
  onSave: () => void;
}) {
  const client = useApiClient();
  const { data: connections, loading: connLoading } = useAsync(
    () => client.connections.list(),
    [client],
  );

  const isConnected = (providers: string[]) =>
    (connections ?? []).some(
      (c: Connection) => providers.includes(c.provider) && c.status.toUpperCase() === 'CONNECTED',
    );

  const requirementMet = (req: ReqKind): boolean => {
    if (req === 'calendar') return isConnected(CALENDAR_PROVIDERS);
    if (req === 'crm') return isConnected(CRM_PROVIDERS);
    return hasPricingSource;
  };

  const dirty = JSON.stringify(tools) !== JSON.stringify(saved);
  const setTool = (key: ToolKey, on: boolean) => onChange({ tools: { ...tools, [key]: on } });

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div className="grid grid-3">
        {TOOLS.map((t) => {
          const on = tools[t.key];
          const met = requirementMet(t.req);
          // Prerequisites are still loading for connection-backed tools.
          const checking = connLoading && t.req !== 'pricing';
          // Can't turn a tool ON without its prerequisite; can always turn one off.
          const toggleDisabled = busy || checking || (!met && !on);
          const linkToConnections = t.req !== 'pricing';

          return (
            <Card key={t.key} className="card-pad stack" style={{ gap: '0.75rem' }}>
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <IconTile icon={t.icon} tone={on && met ? 'brand' : 'neutral'} size={36} />
                <Toggle
                  on={on}
                  onChange={(v) => setTool(t.key, v)}
                  label={t.name}
                  disabled={toggleDisabled}
                />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: '0.2rem' }}>
                  {t.desc}
                </div>
              </div>

              <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                <Chip tone={on ? 'success' : 'neutral'} dot>
                  {on ? 'Enabled' : 'Disabled'}
                </Chip>
                {checking ? (
                  <Chip tone="neutral" icon="refresh">
                    Checking…
                  </Chip>
                ) : met ? (
                  <Chip tone="success" icon="check">
                    {t.metLabel}
                  </Chip>
                ) : (
                  <Chip tone="warning" icon="alert">
                    {t.missingLabel}
                  </Chip>
                )}
              </div>

              {/* Warn if a tool is on but its prerequisite went away. */}
              {!checking && !met && on ? (
                <div className="muted" style={{ fontSize: 12, color: 'var(--color-warning-ink)' }}>
                  This tool is enabled but won&apos;t run until its prerequisite is met.
                </div>
              ) : null}

              {!checking && !met ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  {t.missingHint}{' '}
                  {linkToConnections ? (
                    <Link href="/connections" style={{ color: 'var(--color-brand)', fontWeight: 600 }}>
                      Open Connections →
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div
        className="row"
        style={{
          gap: '0.6rem',
          alignItems: 'flex-start',
          padding: '0.85rem 1rem',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-inset)',
          border: '1px solid var(--color-line)',
        }}
      >
        <IconTile icon="shield" tone="neutral" size={30} />
        <div className="muted" style={{ fontSize: 12.5 }}>
          Tools run only after the visitor gives consent, and every action is written to the audit
          log with the source turn that triggered it. A tool can be toggled on only once its
          prerequisite connection or source is in place.
        </div>
      </div>

      <SaveBar dirty={dirty} busy={busy} onSave={onSave} label="Save tool access" />
    </div>
  );
}
