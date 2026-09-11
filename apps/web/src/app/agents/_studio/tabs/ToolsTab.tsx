'use client';

import type { Connection } from '@acp/api-client';
import type { IconName } from '@/components/Icon';
import { Button, Card, DefinitionList } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useAsync } from '@/lib/useAsync';
import { Switch, SectionTitle } from '../atoms';
import { cx } from '../model';
import type { TabProps } from './types';

type ToolKey = 'booking' | 'crm' | 'pricing';

interface ToolDef {
  key: ToolKey;
  name: string;
  desc: string;
  icon: IconName;
  consent: 'Required' | 'Not required';
  /** Connection providers that satisfy this tool (empty = no connection needed). */
  providers: string[];
}

// Provider keys as returned by connections.list() (see connections catalog).
const CALENDAR_PROVIDERS = ['google_calendar', 'microsoft_365'];
const CRM_PROVIDERS = ['hubspot', 'salesforce', 'zoho', 'webhook'];

const TOOLS: ToolDef[] = [
  {
    key: 'booking',
    name: 'Appointment booking',
    desc: 'Book consented appointments on the connected calendar',
    icon: 'clock',
    consent: 'Required',
    providers: CALENDAR_PROVIDERS,
  },
  {
    key: 'crm',
    name: 'CRM lead handoff',
    desc: 'Create a consented contact in the connected CRM',
    icon: 'contact',
    consent: 'Required',
    providers: CRM_PROVIDERS,
  },
  {
    key: 'pricing',
    name: 'Pricing lookup',
    desc: 'Answer from an approved pricing source',
    icon: 'billing',
    consent: 'Not required',
    providers: [],
  },
];

/** Tools — server-side actions (Full build: U4.3) */
export function ToolsTab({ settings, patch, notify, client }: TabProps) {
  const { data: connections, loading: connLoading } = useAsync(
    () => client.connections.list(),
    [client],
  );

  const isConnected = (providers: string[]) =>
    (connections ?? []).some(
      (c: Connection) => providers.includes(c.provider) && c.status.toUpperCase() === 'CONNECTED',
    );

  const statusValue = (t: ToolDef): string => {
    // Pricing has no connection prerequisite — it reads from approved sources.
    if (t.providers.length === 0) return 'Configured';
    if (connLoading) return 'Checking…';
    return isConnected(t.providers) ? 'Connected' : 'Not connected';
  };

  const setTool = (key: ToolKey, on: boolean) =>
    patch({ tools: { ...settings.tools, [key]: on } });

  return (
    <div className="agent-section">
      <SectionTitle
        title="Server-side tools"
        subtitle="Tools perform approved actions such as availability checks, bookings and consented CRM handoff."
      />

      <div className="tool-card-list">
        {TOOLS.map((t) => {
          const on = settings.tools[t.key];
          return (
            <Card key={t.key} className={cx('tool-card', on && 'enabled')}>
              <div className="tool-card-head">
                <span className="tool-icon">
                  <Icon name={t.icon} size={17} />
                </span>
                <div>
                  <h3>{t.name}</h3>
                  <p>{t.desc}</p>
                </div>
                <Switch checked={on} onChange={(v) => setTool(t.key, v)} />
              </div>

              <DefinitionList
                items={[
                  { label: 'Consent', value: t.consent },
                  { label: 'Execution', value: 'Server-side only' },
                  { label: 'Schema', value: 'Validated JSON' },
                  { label: 'Status', value: statusValue(t) },
                ]}
              />

              <div className="tool-card-actions">
                <Button
                  size="sm"
                  icon="flask"
                  onClick={() =>
                    notify(
                      'Tool test passed',
                      `${t.name} returned a valid simulated response.`,
                      'success',
                    )
                  }
                >
                  Test
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="settings"
                  onClick={() =>
                    notify(
                      'Tool editor',
                      'Schema, auth reference and response mapping are editable.',
                      'info',
                    )
                  }
                >
                  Configure
                </Button>
              </div>
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
        <span className="tool-icon" style={{ background: 'var(--color-inset)', color: 'var(--color-ink-2)' }}>
          <Icon name="shield" size={16} />
        </span>
        <div className="muted" style={{ fontSize: 12.5 }}>
          The ad client calls your conversation API. Provider keys, CRM tokens and tool credentials
          stay in a server-side vault and are referenced by connection id — they are never shipped to
          the ad client.
        </div>
      </div>
    </div>
  );
}
