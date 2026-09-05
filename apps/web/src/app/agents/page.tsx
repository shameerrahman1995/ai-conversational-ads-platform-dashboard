'use client';

import { useEffect, useState } from 'react';
import {
  ApiClientError,
  type AgentSettings,
  type AgentSummary,
  type SourceSummary,
} from '@acp/api-client';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast } from '@/components/feedback';
import { PageHeader, Button, Card, Chip, StatusChip, DataState } from '@/components/ui';
import { Tabs, RestrictedBanner, type TabDef } from './_components/primitives';
import { isRestricted, type TabKey } from './_components/types';
import { IdentityTab } from './_components/IdentityTab';
import { VoiceTab } from './_components/VoiceTab';
import { AvatarTab } from './_components/AvatarTab';
import { KnowledgeTab } from './_components/KnowledgeTab';
import { ToolsTab } from './_components/ToolsTab';
import { SimulatorTab } from './_components/SimulatorTab';
import { TranscriptsTab } from './_components/TranscriptsTab';

const TABS: TabDef[] = [
  { key: 'identity', label: 'Identity', icon: 'users' },
  { key: 'voice', label: 'Voice', icon: 'bell' },
  { key: 'avatar', label: 'Avatar', icon: 'sparkles' },
  { key: 'knowledge', label: 'Knowledge', icon: 'database' },
  { key: 'tools', label: 'Tools', icon: 'bolt' },
  { key: 'simulator', label: 'Simulator', icon: 'message' },
  { key: 'transcripts', label: 'Transcripts', icon: 'doc' },
];

export default function AgentsPage() {
  const client = useApiClient();
  const toast = useToast();

  // Roster + model catalog + knowledge sources (loaded once).
  const { data, error, loading } = useAsync(
    () =>
      Promise.all([client.agents.list(), client.agents.models(), client.sources.list()]),
    [client],
  );
  const [roster, catalog, sources] = data ?? [];

  // Local copies we patch after mutations (avoids full-page refetch flashes).
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [sourceList, setSourceList] = useState<SourceSummary[] | null>(null);
  useEffect(() => {
    if (roster) setAgents(roster);
  }, [roster]);
  useEffect(() => {
    if (sources) setSourceList(sources);
  }, [sources]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('identity');
  const [busy, setBusy] = useState(false);

  const list = agents ?? [];
  const effectiveId = selectedId ?? list[0]?.id ?? null;
  const selected = list.find((a) => a.id === effectiveId) ?? null;

  // Full settings + versions for the selected agent.
  const detail = useAsync(
    () => (effectiveId ? client.agents.get(effectiveId) : Promise.resolve(null)),
    [client, effectiveId],
  );

  // Editable draft + last-saved snapshot (for dirty tracking).
  const [draft, setDraft] = useState<AgentSettings | null>(null);
  const [saved, setSaved] = useState<AgentSettings | null>(null);
  useEffect(() => {
    if (detail.data) {
      setDraft(detail.data.settings);
      setSaved(detail.data.settings);
    }
  }, [detail.data]);

  function selectAgent(id: string) {
    setSelectedId(id);
    setDraft(null);
    setSaved(null);
    setTab('identity');
  }

  const patch = (p: Partial<AgentSettings>) => setDraft((d) => (d ? { ...d, ...p } : d));

  async function save(partial: Partial<AgentSettings>, message: string) {
    if (!effectiveId) return;
    setBusy(true);
    try {
      const res = await client.agents.updateConfig(effectiveId, partial);
      setDraft(res.settings);
      setSaved(res.settings);
      setAgents((prev) =>
        prev?.map((a) =>
          a.id === effectiveId
            ? {
                ...a,
                name: res.settings.name,
                model: res.settings.model,
                persona: res.settings.persona,
                tone: res.settings.tone,
                voiceEnabled: res.settings.voice.enabled,
                avatarEnabled: res.settings.avatar.enabled,
              }
            : a,
        ) ?? prev,
      );
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const restricted = selected ? isRestricted(selected.vertical) : false;

  async function publish() {
    if (!selected) return;
    if (restricted) {
      toast.toast(`${selected.name} sent for human review — required before a healthcare agent goes live`, 'info');
      return;
    }
    setBusy(true);
    try {
      const res = await client.agents.publish(selected.id);
      // Flip the status chip in the rail + summary header (no reload API on useAsync).
      setAgents((prev) =>
        prev?.map((a) => (a.id === selected.id ? { ...a, status: res.status } : a)) ?? prev,
      );
      toast.success(`${selected.name} is live`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="Configure the post-click AI sales agent that greets every visitor, answers from approved facts, and books qualified leads."
        actions={
          <>
            <Button
              variant="ghost"
              icon="publishing"
              onClick={publish}
              disabled={!selected || busy}
            >
              Publish agent
            </Button>
            <Button
              variant="primary"
              icon="play"
              onClick={() => setTab('simulator')}
              disabled={!selected}
            >
              Test agent
            </Button>
          </>
        }
      />

      <DataState
        loading={loading}
        error={error}
        isEmpty={list.length === 0}
        loadingLabel="Loading your agents…"
        emptyTitle="No agents yet"
        emptyHint="Every campaign hosts its own AI sales agent. Launch a campaign to build your first one."
      >
        {selected ? (
          <div
            className="grid"
            style={{ gridTemplateColumns: 'minmax(0, 288px) minmax(0, 1fr)', gap: '1rem' }}
          >
            <AgentRail agents={list} selectedId={selected.id} onSelect={selectAgent} />

            <div className="stack" style={{ gap: '1rem' }}>
              <AgentSummary
                agent={selected}
                draft={draft}
                sourceCount={sourceList?.length ?? 0}
              />

              {restricted ? <RestrictedBanner /> : null}

              <Card style={{ overflow: 'hidden' }}>
                <Tabs tabs={TABS} active={tab} onChange={setTab} />
                <div className="card-pad">
                  {draft && saved ? (
                    <>
                      {tab === 'identity' ? (
                        <IdentityTab
                          settings={draft}
                          saved={saved}
                          models={catalog?.models ?? []}
                          busy={busy}
                          onChange={patch}
                          onSave={() => save(draft, 'Agent updated')}
                        />
                      ) : null}
                      {tab === 'voice' ? (
                        <VoiceTab
                          voice={draft.voice}
                          saved={saved.voice}
                          busy={busy}
                          onChange={patch}
                          onSave={() => save({ voice: draft.voice }, 'Voice settings saved')}
                        />
                      ) : null}
                      {tab === 'avatar' ? (
                        <AvatarTab
                          avatar={draft.avatar}
                          saved={saved.avatar}
                          busy={busy}
                          onChange={patch}
                          onSave={() => save({ avatar: draft.avatar }, 'Avatar settings saved')}
                        />
                      ) : null}
                      {tab === 'tools' ? (
                        <ToolsTab
                          tools={draft.tools}
                          saved={saved.tools}
                          busy={busy}
                          onChange={patch}
                          onSave={() => save({ tools: draft.tools }, 'Tool access saved')}
                        />
                      ) : null}
                      {tab === 'simulator' ? (
                        <SimulatorTab
                          agentId={selected.id}
                          agentName={draft.name}
                          disclosure={draft.disclosure}
                          openingMessage={draft.openingMessage}
                        />
                      ) : null}
                    </>
                  ) : tab !== 'knowledge' && tab !== 'transcripts' ? (
                    <div className="empty" aria-busy="true">
                      <span className="spin" aria-hidden="true" style={{ marginBottom: '0.6rem' }} />
                      <div>Loading {selected.name}&apos;s configuration…</div>
                    </div>
                  ) : null}

                  {tab === 'knowledge' ? (
                    <KnowledgeTab
                      sources={sourceList ?? []}
                      onAdded={(s) => setSourceList((prev) => [s, ...(prev ?? [])])}
                    />
                  ) : null}
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
  agents: AgentSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const live = agents.filter((a) => a.status.toLowerCase() === 'live').length;
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
                <span className="spread" style={{ gap: '0.4rem' }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-ink)' }}>
                    {a.name}
                  </span>
                  <StatusChip status={a.status.toUpperCase()} />
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
  draft,
  sourceCount,
}: {
  agent: AgentSummary;
  draft: AgentSettings | null;
  sourceCount: number;
}) {
  const name = draft?.name ?? agent.name;
  const persona = draft?.persona ?? agent.persona;
  const tone = draft?.tone ?? agent.tone;
  const enabledTools = draft ? Object.values(draft.tools).filter(Boolean).length : 0;
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
            {name.slice(0, 1)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: '0.5rem' }}>
              <h2 style={{ fontSize: 19 }}>{name}</h2>
              <Chip tone="brand" icon="sparkles">
                AI agent
              </Chip>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: '0.1rem' }}>
              {persona} — {tone.toLowerCase()} on {agent.campaignName}
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Chip tone="neutral" icon="sparkles">
            {draft?.model ?? agent.model}
          </Chip>
          <Chip tone="info" icon="database">
            {sourceCount} knowledge {sourceCount === 1 ? 'source' : 'sources'}
          </Chip>
          <Chip tone="neutral" icon="bolt">
            {enabledTools} tools on
          </Chip>
          <StatusChip status={agent.status.toUpperCase()} />
        </div>
      </div>
    </Card>
  );
}
