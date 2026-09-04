'use client';

import type { IconName } from '@/components/Icon';
import type { AgentSettings } from '@acp/api-client';
import { Card, Chip } from '@/components/ui';
import { IconTile, Toggle, SaveBar } from './primitives';

export type ToolKey = 'booking' | 'crm' | 'pricing';
type Tools = AgentSettings['tools'];

interface ToolDef {
  key: ToolKey;
  icon: IconName;
  name: string;
  desc: string;
  requires: string;
  requiresTone: 'success' | 'warning';
}

const TOOLS: ToolDef[] = [
  {
    key: 'booking',
    icon: 'clock',
    name: 'Book a meeting',
    desc: 'Offers open slots and books a free roof inspection straight onto the calendar.',
    requires: 'Google Calendar connected',
    requiresTone: 'success',
  },
  {
    key: 'crm',
    icon: 'link',
    name: 'Send to CRM',
    desc: 'Pushes qualified leads and the conversation summary to your CRM in real time.',
    requires: 'HubSpot connected',
    requiresTone: 'success',
  },
  {
    key: 'pricing',
    icon: 'billing',
    name: 'Fetch pricing',
    desc: 'Looks up ballpark price ranges from approved pricing sheets before quoting.',
    requires: 'Needs a pricing source',
    requiresTone: 'warning',
  },
];

export function ToolsTab({
  tools,
  saved,
  busy,
  onChange,
  onSave,
}: {
  tools: Tools;
  saved: Tools;
  busy: boolean;
  onChange: (patch: Partial<AgentSettings>) => void;
  onSave: () => void;
}) {
  const dirty = JSON.stringify(tools) !== JSON.stringify(saved);
  const setTool = (key: ToolKey, on: boolean) => onChange({ tools: { ...tools, [key]: on } });

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div className="grid grid-3">
        {TOOLS.map((t) => {
          const on = tools[t.key];
          return (
            <Card key={t.key} className="card-pad stack" style={{ gap: '0.75rem' }}>
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <IconTile icon={t.icon} tone={on ? 'brand' : 'neutral'} size={36} />
                <Toggle on={on} onChange={(v) => setTool(t.key, v)} label={t.name} />
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
                <Chip tone={t.requiresTone} icon={t.requiresTone === 'success' ? 'check' : 'alert'}>
                  {t.requires}
                </Chip>
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
        <IconTile icon="shield" tone="neutral" size={30} />
        <div className="muted" style={{ fontSize: 12.5 }}>
          Tools run only after the visitor gives consent, and every action is written to the audit
          log with the source turn that triggered it.
        </div>
      </div>

      <SaveBar dirty={dirty} busy={busy} onSave={onSave} label="Save tool access" />
    </div>
  );
}
