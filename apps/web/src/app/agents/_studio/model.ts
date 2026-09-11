import type { AgentDetail, AgentSettings } from '@acp/api-client';

/** The ten studio tabs, in order. */
export type AgentTabId =
  | 'setup'
  | 'instructions'
  | 'runtime'
  | 'knowledge'
  | 'tools'
  | 'qualification'
  | 'safety'
  | 'voice'
  | 'testing'
  | 'versions';

export const AGENT_TABS: { id: AgentTabId; label: string }[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'runtime', label: 'Model & runtime' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'tools', label: 'Tools' },
  { id: 'qualification', label: 'Qualification' },
  { id: 'safety', label: 'Safety' },
  { id: 'voice', label: 'Voice' },
  { id: 'testing', label: 'Testing' },
  { id: 'versions', label: 'Versions' },
];

export type NotifyTone = 'info' | 'success' | 'warning' | 'danger';
export type Notify = (title: string, body?: string, tone?: NotifyTone) => void;

/** The working agent draft the studio edits (an AgentDetail with normalized settings). */
export type StudioAgent = AgentDetail;

/**
 * AgentSettings with the V10 sections guaranteed present. The server normalizes
 * and defaults every section on read, so the studio can rely on them being there.
 */
export type ResolvedAgentSettings = AgentSettings & {
  noAnswerMessage: string;
  knowledgeSourceIds: string[];
  runtime: NonNullable<AgentSettings['runtime']>;
  retrieval: NonNullable<AgentSettings['retrieval']>;
  qualification: NonNullable<AgentSettings['qualification']>;
  safety: NonNullable<AgentSettings['safety']>;
  setup: NonNullable<AgentSettings['setup']>;
};

export interface ReadinessCheck {
  label: string;
  ok: boolean;
  hint: string;
}

/**
 * Persistent readiness gate (V10 §9 / U4.5). Eight checks over the agent config
 * plus the current regression outcome. Publish is disabled below 75.
 * `regressionPassed`: null = not run this session, true = ran with no failures.
 */
export function computeReadiness(
  s: AgentSettings,
  regressionPassed: boolean | null,
): { score: number; checks: ReadinessCheck[]; ready: boolean } {
  const checks: ReadinessCheck[] = [
    { label: 'Client intake', ok: Boolean(s.name?.trim() && s.setup?.product?.trim()), hint: 'Set an agent name and the product it represents.' },
    { label: 'General prompt', ok: (s.systemPrompt ?? '').length > 150, hint: 'Write a fuller system prompt (150+ characters).' },
    { label: 'Model and fallback', ok: Boolean(s.model && s.runtime?.fallbackModel), hint: 'Choose a primary model and a fallback route.' },
    { label: 'Approved knowledge', ok: (s.knowledgeSourceIds ?? []).length > 0, hint: 'Attach at least one approved knowledge source.' },
    { label: 'Tools tested', ok: Boolean(s.tools?.booking || s.tools?.crm || s.tools?.pricing), hint: 'Enable and test at least one server-side tool.' },
    { label: 'Qualification', ok: (s.qualification?.fields ?? []).length > 0, hint: 'Define the qualification fields your team needs.' },
    { label: 'Safety guardrails', ok: (s.safety?.guardrails ?? []).length >= 3, hint: 'Add at least three guardrail instructions.' },
    { label: 'Regression suite', ok: regressionPassed === true, hint: 'Run the regression suite with no failures.' },
  ];
  // Weighted score so a well-configured agent lands near 100.
  const weights = [14, 15, 12, 15, 10, 10, 12, 12];
  const score = Math.min(
    100,
    checks.reduce((sum, c, i) => sum + (c.ok ? weights[i] : 0), 0),
  );
  return { score, checks, ready: score >= 75 };
}

let seq = 0;
export function uid(prefix = 'id'): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function downloadJson(filename: string, data: unknown): void {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* download unavailable (SSR / sandbox) */
  }
}

/** Label for a model id from the catalog (falls back to the id). */
export function modelLabel(id: string | undefined, models: { id: string; label: string }[]): string {
  return (id && models.find((m) => m.id === id)?.label) || id || 'a model';
}
