import type { WizardState } from './types';

/**
 * Templates U2.1 bridge: the Templates catalog stashes a chosen template id in
 * `localStorage['acp-template']` and routes here. The Campaign Builder consumes
 * that id on load to prefill the wizard, then clears it so a later manual visit
 * starts clean.
 *
 * The catalog itself is a curated static library on the Templates page (no
 * backend), so the wizard-facing prefill lives here as a small id→state map.
 * Template platform keys (google/meta/tiktok/publisher) are translated to the
 * wizard's provider keys (google_ads/meta/tiktok…); `publisher` has no wizard
 * equivalent and is dropped. `name`, `objective`, `platforms`, `brandVoice`
 * (the creative brief tone) and `vertical` are prefilled where a template
 * defines them — the advertiser edits everything from there.
 */
export const TEMPLATE_STORAGE_KEY = 'acp-template';

const PREFILLS: Record<string, Partial<WizardState>> = {
  're-buyer-qualifier': {
    name: 'Real-estate buyer qualifier',
    objective: 'lead_generation',
    platforms: ['meta', 'google_ads'],
    brandVoice: 'Warm & consultative',
    vertical: 'housing',
  },
  'auto-test-drive': {
    name: 'Automotive test-drive booking',
    objective: 'lead_generation',
    platforms: ['meta', 'google_ads', 'tiktok'],
    brandVoice: 'Confident & local',
  },
  'saas-demo-intent': {
    name: 'SaaS demo-intent capture',
    objective: 'lead_generation',
    platforms: ['google_ads', 'meta'],
    brandVoice: 'Straightforward',
  },
  'health-consult-restricted': {
    name: 'Healthcare consult (restricted)',
    objective: 'lead_generation',
    platforms: ['google_ads'],
    brandVoice: 'Warm & consultative',
    vertical: 'healthcare',
  },
  'd2c-product-explainer': {
    name: 'D2C product explainer',
    objective: 'conversions',
    platforms: ['tiktok', 'meta'],
    brandVoice: 'Confident & local',
  },
  'local-service-callback': {
    name: 'Local service call-back',
    objective: 'lead_generation',
    platforms: ['google_ads', 'meta'],
    brandVoice: 'Confident & local',
  },
};

/**
 * Read (and clear) the chosen template from localStorage, returning the wizard
 * prefill for it. Returns `null` when nothing was chosen, the id is unknown, or
 * storage is unavailable. Always clears the key so it applies exactly once.
 */
export function consumeTemplatePrefill(): { id: string; prefill: Partial<WizardState> } | null {
  try {
    const id = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!id) return null;
    localStorage.removeItem(TEMPLATE_STORAGE_KEY);
    const prefill = PREFILLS[id];
    return prefill ? { id, prefill } : null;
  } catch {
    return null;
  }
}
