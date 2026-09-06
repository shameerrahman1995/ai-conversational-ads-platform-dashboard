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
import { PageHeader, Button, Card, Chip, StatusChip, DataState, EmptyState } from '@/components/ui';
import { Tabs, RestrictedBanner, type TabDef } from './_components/primitives';
import { isRestricted, type TabKey } from './_components/types';
import { IdentityTab } from './_components/IdentityTab';
import { VoiceTab } from './_components/VoiceTab';
import { AvatarTab } from './_components/AvatarTab';
import { KnowledgeTab } from './_components/KnowledgeTab';
import { ToolsTab } from './_components/ToolsTab';
import { SimulatorTab } from './_components/SimulatorTab';
import { TranscriptsTab } from './_components/TranscriptsTab';
import { CreateAgentModal } from './_components/CreateAgentModal';
import { PublishModal } from './_components/PublishModal';

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

  // Roster + model catalog + knowledge sources. `reloadKey` lets the error
  // state offer a real retry (useAsync re-runs when its deps change).
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error, loading } = useAsync(
    () =>
      Promise.all([client.agents.list(), client.agents.models(), client.sources.list()]),
    [client, reloadKey],
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
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

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

  // Draft differs from the last saved snapshot (across every tab).
  const isDirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

  // Select a different agent, warning first if the current draft has unsaved edits.
  function selectAgent(id: string) {
    if (id === effectiveId) return;
    if (
      isDirty &&
      typeof window !== 'undefined' &&
      !window.confirm('You have unsaved changes on this agent. Switching will discard them. Continue?')
    ) {
      return;
    }
    setSelectedId(id);
    setDraft(null);
    setSaved(null);
    setTab('identity');
  }

  const patch = (p: Partial<AgentSettings>) => setDraft((d) => (d ? { ...d, ...p } : d));

  // Keep the rail + summary header chips in sync after a save/publish.
  const applyToRoster = (id: string, settings: AgentSettings) =>
    setAgents((prev) =>
      prev?.map((a) =>
        a.id === id
          ? {
              ...a,
              name: settings.name,
              model: settings.model,
              persona: settings.persona,
              tone: settings.tone,
              voiceEnabled: settings.voice.enabled,
              avatarEnabled: settings.avatar.enabled,
            }
          : a,
      ) ?? prev,
    );

  async function save(partial: Partial<AgentSettings>, message: string) {
    if (!effectiveId) return;
    setBusy(true);
    try {
      const res = await client.agents.updateConfig(effectiveId, partial);
      // Merge: adopt the server's canonical value for just the fields we saved,
      // but preserve any unsaved edits the user made on other tabs.
      const savedFields = Object.fromEntries(
        (Object.keys(partial) as (keyof AgentSettings)[]).map((k) => [k, res.settings[k]]),
      ) as Partial<AgentSettings>;
      setDraft((d) => (d ? { ...d, ...savedFields } : res.settings));
      setSaved(res.settings);
      applyToRoster(effectiveId, res.settings);
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const restricted = selected ? isRestricted(selected.vertical) : false;

  async function createAgent(campaignId: string) {
    setCreating(true);
    try {
      const { id } = await client.agents.create({ campaignId });
      // Refresh the roster so the new agent has a full summary, then select it.
      const fresh = await client.agents.list();
      setAgents(fresh);
      setSelectedId(id);
      setDraft(null);
      setSaved(null);
      setTab('identity');
      setCreateOpen(false);
      toast.success('Agent created — configure it, then publish when ready');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : 'Could not create the agent');
    } finally {
      setCreating(false);
    }
  }

  // Confirmed from the publish modal. Optionally saves the full draft first so
  // the latest edits go live instead of a stale saved config.
  async function confirmPublish({ saveFirst }: { saveFirst: boolean }) {
    if (!selected || !draft) return;
    setBusy(true);
    try {
      if (saveFirst) {
        const res = await client.agents.updateConfig(selected.id, draft);
        setDraft(res.settings);
        setSaved(res.settings);
        applyToRoster(selected.id, res.settings);
      }
      if (restricted) {
        // Honest no-op: there's no auto-publish for restricted verticals.
        toast.toast(
          `${selected.name} submitted for human review — required before a healthcare agent can go live`,
          'info',
        );
      } else {
        const res = await client.agents.publish(selected.id);
        setAgents((prev) =>
          prev?.map((a) => (a.id === selected.id ? { ...a, status: res.status } : a)) ?? prev,
        );
        toast.success(`${selected.name} is live`);
      }
      setPublishOpen(false);
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
            <Button variant="ghost" icon="plus" onClick={() => setCreateOpen(true)} disabled={creating}>
              New agent
            </Button>
            <Button
              variant="ghost"
              icon="publishing"
              onClick={() => setPublishOpen(true)}
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
        isEmpty={false}
        loadingLabel="Loading your agents…"
        onRetry={() => setReloadKey((k) => k + 1)}
      >
        {list.length === 0 ? (
          <EmptyState
            icon="users"
            title="No agents yet"
            hint="An AI sales agent greets every visitor, answers from your approved facts, and books qualified leads. Create one on a campaign to get started."
            action={
              <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
                Create your first agent
              </Button>
            }
          />
        ) : selected ? (
          <div className="grid grid-rail-l" style={{ gap: '1rem' }}>
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
                          hasPricingSource={(sourceList?.length ?? 0) > 0}
                          onChange={patch}
                          onSave={() => save({ tools: draft.tools }, 'Tool access saved')}
                        />
                      ) : null}
                      {tab === 'simulator' ? (
                        <SimulatorTab
                          agentId={selected.id}
                          agentName={saved.name}
                          disclosure={saved.disclosure}
                          openingMessage={saved.openingMessage}
                          dirty={isDirty}
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

      <CreateAgentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        existingCampaignIds={new Set(list.map((a) => a.campaignId))}
        creating={creating}
        onCreate={createAgent}
      />

      {selected && draft ? (
        <PublishModal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          agentName={selected.name}
          draft={draft}
          isDirty={isDirty}
          restricted={restricted}
          sources={sourceList ?? []}
          busy={busy}
          onConfirm={confirmPublish}
        />
      ) : null}
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
