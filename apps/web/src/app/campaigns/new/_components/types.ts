import type { IconName } from '@/components/Icon';

/** All setup captured by the campaign-creation wizard. Persisted to Campaign.settings. */
export interface WizardState {
  // 1 — objective
  objective: string;
  name: string;
  vertical: string; // 'none' | restricted vertical key

  // 2 — channels (ad platforms)
  platforms: string[]; // provider keys

  // 3 — audience & targeting
  locations: string[];
  ageMin: number;
  ageMax: number;
  genders: string[]; // ['all'] | subset of ['male','female','nonbinary']
  languages: string[];
  interests: string[];

  // 4 — budget & schedule
  budgetType: 'daily' | 'lifetime';
  budgetAmount: number;
  currency: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // '' = run continuously
  bidStrategy: string;

  // 5 — creative & agent
  sourceUri: string; // product page to ground on (optional)
  formats: string[];
  attachAgent: boolean;
  agentModel: string;
  brandVoice: string;
}

export interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  /** Provider keys already connected (from connections.list) — for ChannelsStep. */
  connectedProviders?: string[];
  /** Model catalog — for CreativeAgentStep. */
  models?: { id: string; label: string; tier?: string; description?: string }[];
}

const today = () => new Date().toISOString().slice(0, 10);

export const DEFAULT_WIZARD: WizardState = {
  objective: 'lead_generation',
  name: '',
  vertical: 'none',
  platforms: [],
  locations: [],
  ageMin: 25,
  ageMax: 65,
  genders: ['all'],
  languages: ['English'],
  interests: [],
  budgetType: 'daily',
  budgetAmount: 50,
  currency: 'USD',
  startDate: today(),
  endDate: '',
  bidStrategy: 'maximize_conversions',
  sourceUri: '',
  formats: ['image_1_1', 'image_9_16'],
  attachAgent: true,
  agentModel: 'claude-sonnet-5',
  brandVoice: 'Confident & local',
};

export interface ObjectiveOption {
  key: string;
  label: string;
  description: string;
  icon: IconName;
}
export const OBJECTIVES: ObjectiveOption[] = [
  { key: 'lead_generation', label: 'Lead generation', description: 'Capture and qualify leads via the AI agent.', icon: 'leads' },
  { key: 'conversions', label: 'Conversions', description: 'Drive purchases or sign-ups on your site.', icon: 'up-right' },
  { key: 'traffic', label: 'Traffic', description: 'Send high-intent visitors to a landing page.', icon: 'globe' },
  { key: 'awareness', label: 'Awareness', description: 'Maximize reach and brand recall.', icon: 'campaigns' },
];

export interface PlatformOption {
  key: string;
  label: string;
  description: string;
  formats: string[]; // supported creative formats
}
export const PLATFORMS: PlatformOption[] = [
  { key: 'google_ads', label: 'Google Ads', description: 'Search + Performance Max for high-intent queries.', formats: ['image_1_1', 'image_16_9'] },
  { key: 'meta', label: 'Meta (Facebook / Instagram)', description: 'Feed + Stories lead forms into the AI agent.', formats: ['image_1_1', 'image_9_16', 'image_4_5'] },
  { key: 'tiktok', label: 'TikTok', description: 'Vertical Spark Ads for storm-season demand.', formats: ['image_9_16'] },
  { key: 'microsoft', label: 'Microsoft Advertising', description: 'Bing search for higher-value homeowners.', formats: ['image_1_1', 'image_16_9'] },
  { key: 'amazon_dsp', label: 'Amazon DSP', description: 'Programmatic display retargeting.', formats: ['image_16_9', 'image_1_1'] },
  { key: 'linkedin', label: 'LinkedIn', description: 'B2B lead forms for property managers.', formats: ['image_1_1', 'image_16_9'] },
];

export const FORMATS: { key: string; label: string }[] = [
  { key: 'image_1_1', label: '1:1 Square feed' },
  { key: 'image_9_16', label: '9:16 Vertical story' },
  { key: 'image_16_9', label: '16:9 Landscape' },
  { key: 'image_4_5', label: '4:5 Portrait feed' },
];

export const BID_STRATEGIES: { key: string; label: string }[] = [
  { key: 'maximize_conversions', label: 'Maximize conversions' },
  { key: 'target_cpa', label: 'Target CPA' },
  { key: 'maximize_clicks', label: 'Maximize clicks' },
  { key: 'manual_cpc', label: 'Manual CPC' },
];

export const BRAND_VOICES = ['Confident & local', 'Warm & consultative', 'Straightforward', 'Urgent — storm season'];
export const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese'];
export const GENDERS = [
  { key: 'all', label: 'All' },
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
];
