'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import {
  PageHeader,
  Button,
  Card,
  Chip,
  StatusChip,
  DataState,
} from '@/components/ui';
import { Tabs, type TabDef } from './_components/primitives';
import { deriveAgents, type Agent, type TabKey } from './_components/types';
import { IdentityTab } from './_components/IdentityTab';
import { KnowledgeTab } from './_components/KnowledgeTab';
import { ToolsTab, type ToolKey } from './_components/ToolsTab';
import { SimulatorTab } from './_components/SimulatorTab';
import { TranscriptsTab } from './_components/TranscriptsTab';

const TABS: TabDef[] = [
  { key: 'identity', label: 'Identity', icon: 'users' },
  { key: 'knowledge', label: 'Knowledge', icon: 'database' },
  { key: 'tools', label: 'Tools', icon: 'bolt' },
  { key: 'simulator', label: 'Simulator', icon: 'message' },
  { key: 'transcripts', label: 'Transcripts', icon: 'doc' },
];

export default function AgentsPage() {
  const client = useApiClient();
  const { data, error, loading } = useAsync(
    () => Promise.all([client.campaigns.list(), client.sources.list()]),
    [client],
  );

  const [campaigns, sources] = data ?? [];
  const agents = deriveAgents(campaigns ?? []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('identity');

  // Builder state (visual only — persists while switching tabs).
  const [voiceOn, setVoiceOn] = useState(false);
  const [avatarOn, setAvatarOn] = useState(false);
  const [tools, setTools] = useState<Record<ToolKey, boolean>>({
    meeting: true,
    crm: true,
    pricing: false,
  });

  const selected = agents.find((a) => a.id === selectedId) ?? agents[0];

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="Build the post-click AI sales agent that greets every visitor, answers from approved facts, and books qualified leads."
        actions={
          <>
            <Button variant="ghost" icon="publishing">
              Publish agent
            </Button>
            <Button variant="primary" icon="play">
              Test agent
            </Button>
          </>
        }
      />

      <DataState
        loading={loading}
        error={error}
        isEmpty={agents.length === 0}
        loadingLabel="Loading your agents…"
        emptyTitle="No agents yet"
        emptyHint="Every campaign hosts its own AI sales agent. Launch a campaign to build your first one."
      >
        {selected ? (
          <div
            className="grid"
            style={{ gridTemplateColumns: 'minmax(0, 288px) minmax(0, 1fr)', gap: '1rem' }}
          >
            <AgentRail
              agents={agents}
              selectedId={selected.id}
              onSelect={(id) => {
                setSelectedId(id);
                setTab('identity');
              }}
            />

            <div className="stack" style={{ gap: '1rem' }}>
              <AgentSummary agent={selected} sourceCount={sources?.length ?? 0} tools={tools} />

              <Card style={{ overflow: 'hidden' }}>
                <Tabs tabs={TABS} active={tab} onChange={setTab} />
                <div className="card-pad">
                  {tab === 'identity' ? (
                    <IdentityTab
                      agent={selected}
                      voiceOn={voiceOn}
                      setVoiceOn={setVoiceOn}
                      avatarOn={avatarOn}
                      setAvatarOn={setAvatarOn}
                    />
                  ) : null}
                  {tab === 'knowledge' ? <KnowledgeTab sources={sources ?? []} /> : null}
                  {tab === 'tools' ? (
                    <ToolsTab
                      tools={tools}
                      setTool={(key, on) => setTools((t) => ({ ...t, [key]: on }))}
                    />
                  ) : null}
                  {tab === 'simulator' ? <SimulatorTab agent={selected} /> : null}
                  {tab === 'transcripts' ? <TranscriptsTab /> : null}
                </div>
              </Card>
            </div>
          </div>
        ) : null}
      </DataState>
    </div>
  );
}

/* ---- Left rail: the roster of agents ------------------------------- */
function AgentRail({
  agents,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const live = agents.filter((a) => a.campaignStatus === 'LIVE').length;
  return (
    <Card style={{ overflow: 'hidden', alignSelf: 'flex-start' }}>
      <div className="panel-head">
        <span className="panel-title">Your agents</span>
        <Chip tone={live > 0 ? 'success' : 'neutral'} dot>
          {live} live
        </Chip>
      </div>
      <div>
        {agents.map((a, i) => {
          const on = a.id === selectedId;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                gap: '0.65rem',
                alignItems: 'center',
                padding: '0.8rem 1rem',
                background: on ? 'var(--color-brand-soft)' : 'transparent',
                border: 'none',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-line)',
                borderLeft: `3px solid ${on ? 'var(--color-brand)' : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  flex: 'none',
                  borderRadius: 9999,
                  display: 'grid',
                  placeItems: 'center',
                  background: on
                    ? 'linear-gradient(140deg, var(--color-brand), var(--color-violet))'
                    : 'var(--color-inset)',
                  color: on ? '#fff' : 'var(--color-ink-2)',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {a.name.slice(0, 1)}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span
                  className="spread"
                  style={{ gap: '0.4rem' }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-ink)' }}>
                    {a.name}
                  </span>
                  <StatusChip status={a.campaignStatus} />
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--color-ink-3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.campaignName}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ---- Selected-agent summary header --------------------------------- */
function AgentSummary({
  agent,
  sourceCount,
  tools,
}: {
  agent: Agent;
  sourceCount: number;
  tools: Record<ToolKey, boolean>;
}) {
  const enabledTools = Object.values(tools).filter(Boolean).length;
  return (
    <Card className="card-pad">
      <div className="spread" style={{ gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: '0.85rem', alignItems: 'center', minWidth: 0 }}>
          <span
            style={{
              width: 48,
              height: 48,
              flex: 'none',
              borderRadius: 14,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(140deg, var(--color-brand), var(--color-violet))',
              color: '#fff',
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            {agent.name.slice(0, 1)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: '0.5rem' }}>
              <h2 style={{ fontSize: 19 }}>{agent.name}</h2>
              <Chip tone="brand" icon="sparkles">
                AI agent
              </Chip>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: '0.1rem' }}>
              {agent.role} — {agent.persona.toLowerCase()} tone
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Chip tone="info" icon="database">
            {sourceCount} knowledge {sourceCount === 1 ? 'source' : 'sources'}
          </Chip>
          <Chip tone="neutral" icon="bolt">
            {enabledTools} tools on
          </Chip>
          <StatusChip status={agent.campaignStatus} />
        </div>
      </div>
    </Card>
  );
}
