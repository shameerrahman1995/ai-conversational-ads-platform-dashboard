import type { ApiClient } from '@acp/api-client';
import type { StudioCreative } from '../model';
import type { NotifyTone } from '../InteractiveAd';

/** The nine studio stages, in pipeline order. */
export type StageId =
  | 'brief'
  | 'directions'
  | 'experience'
  | 'produce'
  | 'studio'
  | 'variants'
  | 'simulate'
  | 'review'
  | 'learn';

export type Notify = (title: string, body?: string, tone?: NotifyTone) => void;

/** Props every stage component receives. */
export interface StageProps {
  creative: StudioCreative;
  /** Merge a change into the working creative (marks it dirty). */
  patch: (change: Partial<StudioCreative>) => void;
  /** Navigate to another stage. */
  setStage: (id: StageId) => void;
  /** Toast bridge. */
  notify: Notify;
  /** API client (Brief uses it to generate a real blueprint). */
  client: ApiClient;
  /** The campaign the studio is designing for (Brief generates against it). */
  campaignId: string | null;
  /** Replace the whole working creative (Brief uses it after generate). */
  setCreative: (c: StudioCreative) => void;
  /** The persisted blueprint row id (null until a generate/save persists one). */
  blueprintId: string | null;
  /** Record the persisted blueprint id (Brief sets it after generate). */
  setBlueprintId: (id: string | null) => void;
}
