'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Button, StatusChip, DataState, EmptyState } from '@/components/ui';
import { useToast } from '@/components/feedback';
import { Icon } from '@/components/Icon';
import { ApiClientError, type AgentDetail, type AgentSettings, type AgentSummary } from '@acp/api-client';
import {
  AGENT_TABS,
  computeReadiness,
  cx,
  modelLabel,
  type AgentTabId,
  type Notify,
  type ResolvedAgentSettings,
  type StudioAgent,
} from './_studio/model';
import { ReadinessRail } from './_studio/ReadinessRail';
import type { TabProps } from './_studio/tabs/types';
import { SetupTab } from './_studio/tabs/SetupTab';
import { InstructionsTab } from './_studio/tabs/InstructionsTab';
import { RuntimeTab } from './_studio/tabs/RuntimeTab';
import { KnowledgeTab } from './_studio/tabs/KnowledgeTab';
import { ToolsTab } from './_studio/tabs/ToolsTab';
import { QualificationTab } from './_studio/tabs/QualificationTab';
import { SafetyTab } from './_studio/tabs/SafetyTab';
import { VoiceTab } from './_studio/tabs/VoiceTab';
import { TestingTab } from './_studio/tabs/TestingTab';
import { VersionsTab } from './_studio/tabs/VersionsTab';

const TAB_COMPONENTS: Record<AgentTabId, (p: TabProps) => ReactNode> = {
  setup: SetupTab,
  instructions: InstructionsTab,
  runtime: RuntimeTab,
  knowledge: KnowledgeTab,
  tools: ToolsTab,
  qualification: QualificationTab,
  safety: SafetyTab,
  voice: VoiceTab,
  testing: TestingTab,
  versions: VersionsTab,
};

export default function AgentStudioPage() {
  const client = useApiClient();
  const toast = useToast();

  const notify: Notify = (title, body, tone) => {
    const msg = body ? `${title} — ${body}` : title;
    if (tone === 'success') toast.success(msg);
    else if (tone === 'danger') toast.error(msg);
    else toast.toast(msg, 'info');
  };

  const [listReload, setListReload] = useState(0);
  const { data: agents, error: listErr, loading: listLoading } = useAsync(
    () => client.agents.list(),
    [client, listReload],
  );
  // useAsync nulls `data` on every refetch (a Save/Publish bumps `listReload`).
  // Retain the last successfully-loaded list so a background refetch doesn't blank
  // the studio to "Loading agents…", collapse `activeId` to '', and drop the
  // in-progress tab state (e.g. the Testing conversation/trace). The cache only
  // updates when a fresh list arrives, so the very first load still shows the
  // spinner.
  const [loadedAgents, setLoadedAgents] = useState<AgentSummary[] | null>(null);
  useEffect(() => {
    if (agents) setLoadedAgents(agents);
  }, [agents]);
  const agentList = agents ?? loadedAgents;

  const { data: modelData } = useAsync(() => client.agents.models(), [client]);
  const models = modelData?.models ?? [];
  const capabilities = modelData?.capabilities ?? {};

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const activeId = selectedId || agentList?.[0]?.id || '';

  const [draft, setDraft] = useState<StudioAgent | null>(null);
  const [saved, setSaved] = useState<StudioAgent | null>(null);
  const [tab, setTab] = useState<AgentTabId>('setup');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [regressionPassed, setRegressionPassed] = useState<boolean | null>(null);
  const [detailReload, setDetailReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!activeId) {
      setDraft(null);
      setSaved(null);
      return;
    }
    client.agents
      .get(activeId)
      .then((d) => {
        if (cancelled) return;
        setDraft(d);
        setSaved(d);
        setRegressionPassed(null);
      })
      .catch((e) => {
        if (!cancelled) notify('Could not load agent', e instanceof ApiClientError ? e.body.message : 'Try again.', 'danger');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, activeId, detailReload]);

  const dirty = useMemo(
    () => Boolean(draft && saved && JSON.stringify(draft.settings) !== JSON.stringify(saved.settings)),
    [draft, saved],
  );

  // Publish gate (V10 §9 / U4.5). Mirror the ReadinessRail so the header
  // "Publish version" button can't bypass the governance gate: disabled below a
  // readiness score of 75 OR without a passing regression run this session. The
  // tooltip names the outstanding checks. The server enforces the same rule, so
  // this only removes the client-side bypass affordance.
  const readiness = useMemo(
    () => (draft ? computeReadiness(draft.settings, regressionPassed) : null),
    [draft, regressionPassed],
  );
  const failingChecks = readiness ? readiness.checks.filter((c) => !c.ok) : [];
  const canPublish = Boolean(readiness && readiness.score >= 75 && regressionPassed === true);
  const publishBlockedReason =
    canPublish || !readiness
      ? undefined
      : `Not ready to publish — readiness ${readiness.score}/100 (needs ≥ 75)${
          failingChecks.length ? `. Outstanding: ${failingChecks.map((c) => c.label).join(', ')}` : ''
        }.`;

  const patch = (partial: Partial<AgentSettings>) =>
    setDraft((d) => (d ? { ...d, settings: { ...d.settings, ...partial } } : d));

  async function saveDraft() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const r = await client.agents.updateConfig(draft.id, draft.settings);
      const next: AgentDetail = { ...draft, name: r.settings.name, settings: r.settings };
      setDraft(next);
      setSaved(next);
      notify('Agent saved', 'Configuration saved.', 'success');
      setListReload((n) => n + 1);
    } catch (e) {
      notify('Save failed', e instanceof ApiClientError ? e.body.message : 'Try again.', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!draft || publishing) return;
    setPublishing(true);
    try {
      if (dirty) await client.agents.updateConfig(draft.id, draft.settings);
      const r = await client.agents.publish(draft.id);
      notify('Agent version published', `${draft.settings.name} is now ${r.status}.`, 'success');
      setDetailReload((n) => n + 1);
      setListReload((n) => n + 1);
    } catch (e) {
      notify('Publish failed', e instanceof ApiClientError ? e.body.message : 'Try again.', 'danger');
    } finally {
      setPublishing(false);
    }
  }

  const filtered = (agentList ?? []).filter(
    (a) => !query || `${a.name} ${a.campaignName}`.toLowerCase().includes(query.toLowerCase()),
  );

  const TabComponent = TAB_COMPONENTS[tab];
  const tabProps: TabProps | null = draft
    ? {
        agent: draft,
        settings: draft.settings as ResolvedAgentSettings,
        patch,
        notify,
        client,
        models,
        capabilities,
        onRegression: setRegressionPassed,
        refetch: () => {
          setDetailReload((n) => n + 1);
          setListReload((n) => n + 1);
        },
      }
    : null;

  return (
    <div className="agent-page">
      <aside className="agent-list-panel">
        <div className="agent-list-head">
          <div>
            <span>Build</span>
            <h1>AI Agents</h1>
          </div>
        </div>
        <div className="searchbar">
          <div className="searchbar-field">
            <Icon name="search" size={16} />
            <input
              className="searchbar-input"
              type="search"
              placeholder="Search agents…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search agents"
            />
          </div>
        </div>
        <div className="agent-list">
          {filtered.map((a) => (
            <button key={a.id} type="button" className={cx(activeId === a.id && 'active')} onClick={() => setSelectedId(a.id)}>
              <span className="agent-list-orb">
                <Icon name="bot" size={16} />
              </span>
              <div>
                <strong>{a.name}</strong>
                <small>{modelLabel(a.model, models)}</small>
              </div>
              <span className="agent-list-meta">
                <StatusChip status={a.status} />
              </span>
            </button>
          ))}
          {!listLoading && filtered.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5, padding: '0.5rem' }}>
              {agentList?.length ? 'No agents match your search.' : 'No agents yet — create one from a campaign.'}
            </div>
          ) : null}
        </div>
      </aside>

      <div className="agent-main">
        <DataState loading={listLoading && !agentList} error={listErr} onRetry={() => setListReload((n) => n + 1)} loadingLabel="Loading agents…">
          {!draft ? (
            <EmptyState icon="agents" title="Select an agent" hint="Choose an agent from the list to configure it, or create one from a campaign." />
          ) : (
            <>
              <div className="agent-header">
                <div>
                  <div className="eyebrow">AI Agent Studio</div>
                  <h1>{draft.settings.name}</h1>
                  <p>
                    {draft.settings.setup?.product || draft.campaignName} · {modelLabel(draft.settings.model, models)} · v
                    {draft.versions[0]?.version ?? 1}
                  </p>
                </div>
                <div className="agent-header-actions">
                  {dirty ? (
                    <span className="unsaved-dot">
                      <i />
                      Unsaved changes
                    </span>
                  ) : (
                    <span className="saved-dot">
                      <i />
                      Saved
                    </span>
                  )}
                  <Button size="sm" variant="ghost" icon="play" onClick={() => setTab('testing')}>
                    Run test
                  </Button>
                  <Button size="sm" variant="ghost" icon="save" disabled={saving || !dirty} onClick={saveDraft}>
                    {saving ? 'Saving…' : 'Save draft'}
                  </Button>
                  {/* Wrapper carries the tooltip: a disabled <button> is inert
                      and won't surface its own title on hover. */}
                  <span
                    title={publishBlockedReason}
                    style={{ display: 'inline-flex', cursor: canPublish ? undefined : 'not-allowed' }}
                  >
                    <Button
                      size="sm"
                      variant="primary"
                      icon="rocket"
                      disabled={publishing || !canPublish}
                      aria-disabled={!canPublish}
                      onClick={publish}
                    >
                      Publish version
                    </Button>
                  </span>
                </div>
              </div>

              <nav className="agent-tabs">
                {AGENT_TABS.map((t) => (
                  <button key={t.id} type="button" className={cx(tab === t.id && 'active')} onClick={() => setTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </nav>

              <div className="agent-editor-layout">
                <section className="agent-editor-card">{tabProps ? TabComponent(tabProps) : null}</section>
                <ReadinessRail
                  agent={draft}
                  settings={draft.settings}
                  regressionPassed={regressionPassed}
                  onRunTests={() => setTab('testing')}
                  onPublish={publish}
                  publishing={publishing}
                  notify={notify}
                />
              </div>
            </>
          )}
        </DataState>
      </div>
    </div>
  );
}
