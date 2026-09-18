import type { ApiClient, AgentSettings, ModelOption, ModelCapabilities } from '@acp/api-client';
import type { Notify, StudioAgent, ResolvedAgentSettings } from '../model';

/** Props every studio tab receives. */
export interface TabProps {
  agent: StudioAgent;
  /** The working settings (normalized — all V10 sections guaranteed present). */
  settings: ResolvedAgentSettings;
  /** Merge a settings patch into the working draft (marks dirty). */
  patch: (partial: Partial<AgentSettings>) => void;
  notify: Notify;
  client: ApiClient;
  models: ModelOption[];
  /** Per-model capability registry keyed by model id (Model & runtime tab). */
  capabilities: Record<string, ModelCapabilities>;
  /** Report the latest regression outcome up to the readiness gate. */
  onRegression: (passed: boolean) => void;
  /** Re-fetch the active agent detail (e.g. after a version restore). */
  refetch: () => void;
}
