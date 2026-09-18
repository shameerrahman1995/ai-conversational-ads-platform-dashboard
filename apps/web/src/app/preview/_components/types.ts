import type { Tone } from '@/components/ui';
import type { IconName } from '@/components/Icon';

/* ================================================================== */
/* Shared vocabulary for the Placement Preview sandbox. This is a       */
/* client-side simulation only — nothing here ever touches the API or   */
/* creates a lead. All state is local to the browser tab.               */
/* ================================================================== */

export type Placement = 'google' | 'meta' | 'tiktok' | 'publisher';
export type Device = 'desktop' | 'mobile';
export type Runtime = 'live' | 'slow' | 'timeout' | 'voice-denied' | 'offline';
export type Step = 'hook' | 'explore' | 'ask' | 'answer' | 'qualify' | 'convert';

export const STEP_ORDER: readonly Step[] = ['hook', 'explore', 'ask', 'answer', 'qualify', 'convert'];

export const STEP_LABEL: Record<Step, string> = {
  hook: 'Hook',
  explore: 'Explore',
  ask: 'Ask AI',
  answer: 'Answer',
  qualify: 'Qualify',
  convert: 'Convert',
};

/**
 * The shared `InteractiveAd` runtime is driven by a journey-state LABEL (see
 * `JOURNEY_STATES`), while the preview page tracks a `Step`. These map between
 * the two so Preview drives the same runtime the Studio and Simulator use.
 */
export const STATE_LABEL_BY_STEP: Record<Step, string> = STEP_LABEL;

export const STEP_BY_STATE_LABEL: Record<string, Step> = {
  Hook: 'hook',
  Explore: 'explore',
  'Ask AI': 'ask',
  Answer: 'answer',
  Qualify: 'qualify',
  Convert: 'convert',
};

export const PLACEMENT_LABEL: Record<Placement, string> = {
  google: 'Google',
  meta: 'Meta',
  tiktok: 'TikTok',
  publisher: 'Publisher',
};

export const DEVICE_LABEL: Record<Device, string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
};

export const RUNTIME_LABEL: Record<Runtime, string> = {
  live: 'Live runtime',
  slow: 'Slow network',
  timeout: 'Agent timeout',
  'voice-denied': 'Voice denied',
  offline: 'Offline fallback',
};

export const PLACEMENT_OPTIONS: readonly Placement[] = ['google', 'meta', 'tiktok', 'publisher'];
export const RUNTIME_OPTIONS: readonly Runtime[] = ['live', 'slow', 'timeout', 'voice-denied', 'offline'];

export function stepIndex(step: Step): number {
  return STEP_ORDER.indexOf(step);
}

/** True once the journey has advanced to (or past) `target`. */
export function reached(current: Step, target: Step): boolean {
  return stepIndex(current) >= stepIndex(target);
}

export function nextStep(step: Step): Step {
  const i = stepIndex(step);
  return STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)];
}

export function isLastStep(step: Step): boolean {
  return stepIndex(step) === STEP_ORDER.length - 1;
}

/** Local intent score (/100) that rises as the visitor advances. */
const INTENT_BY_STEP: Record<Step, number> = {
  hook: 8,
  explore: 26,
  ask: 44,
  answer: 62,
  qualify: 80,
  convert: 92,
};

export function intentScore(step: Step, consent: boolean): number {
  const base = INTENT_BY_STEP[step];
  return Math.min(100, step === 'convert' && consent ? base + 8 : base);
}

/* ---- Verified capability matrix (drives the Notice) ---------------- */
export interface CapabilityInfo {
  tone: Tone;
  icon: IconName;
  title: string;
  body: string;
}

export const CAPABILITY: Record<Placement, CapabilityInfo> = {
  publisher: {
    tone: 'success',
    icon: 'sparkles',
    title: 'Full conversational runtime (host-cooperative)',
    body: 'The complete AI agent executes inside a first-party inline unit — live answers, qualification and consent all run in-place.',
  },
  google: {
    tone: 'warning',
    icon: 'shield',
    title: 'Uploaded HTML5 display candidate — serving-host review applies',
    body: 'The creative is submitted as an HTML5 display candidate; the serving host reviews and gates what may execute in the slot.',
  },
  meta: {
    tone: 'info',
    icon: 'shield',
    title: 'May run an approved native/offline fallback, not arbitrary live code',
    body: 'Live third-party code is not permitted. An approved native or pre-bundled offline experience stands in for the full runtime.',
  },
  tiktok: {
    tone: 'info',
    icon: 'shield',
    title: 'May run an approved native/offline fallback, not arbitrary live code',
    body: 'Live third-party code is not permitted. An approved native or pre-bundled offline experience stands in for the full runtime.',
  },
};

/* ---- Grounded answer, resolved against the runtime condition ------- */
export interface AnswerInfo {
  chipTone: Tone;
  chipLabel: string;
  text: string;
}

export function answerFor(runtime: Runtime): AnswerInfo {
  switch (runtime) {
    case 'timeout':
      return {
        chipTone: 'warning',
        chipLabel: 'Approved fallback answer',
        text: 'The agent did not respond in time, so the pre-approved fallback is served: it connects to major CRMs — leave your details and our team confirms your exact setup.',
      };
    case 'offline':
      return {
        chipTone: 'info',
        chipLabel: 'Bundled offline answer',
        text: 'You are on the offline bundle, so this ships a cached answer: it integrates with major CRMs. Reconnect to ask live, grounded questions.',
      };
    case 'slow':
      return {
        chipTone: 'info',
        chipLabel: 'Grounded · recovered on slow network',
        text: 'Yes — qualified leads sync to HubSpot, Salesforce or your webhook in real time, and explicit consent is captured before anything is sent.',
      };
    case 'live':
    case 'voice-denied':
    default:
      return {
        chipTone: 'success',
        chipLabel: 'Grounded · live',
        text: 'Yes — qualified leads sync to HubSpot, Salesforce or your webhook in real time, and explicit consent is captured before anything is sent.',
      };
  }
}

/** Short status line describing the active runtime condition, if notable. */
export function runtimeNote(runtime: Runtime): string | null {
  switch (runtime) {
    case 'slow':
      return 'Slow network — responses stream in with added latency.';
    case 'timeout':
      return 'Agent timeout simulated — an approved fallback answer is served.';
    case 'offline':
      return 'Offline — a pre-bundled experience is serving in place of the live runtime.';
    case 'voice-denied':
      return 'Microphone permission denied — voice input is hidden.';
    case 'live':
    default:
      return null;
  }
}

export function micAllowed(runtime: Runtime): boolean {
  return runtime !== 'voice-denied';
}

/* ---- The (representative) creative shown inside every placement ---- */
export const CREATIVE = {
  brand: 'Concierge AI',
  headline: 'Turn ad clicks into conversations',
  subhead: 'An AI concierge that answers, qualifies and books — right inside the ad.',
  features: ['Answers in the ad', 'Qualifies intent', 'Books instantly', 'Brand-safe'],
  suggestedQuestion: 'Does it work with my CRM?',
  qualifyQuestion: 'When are you looking to launch?',
  qualifyOptions: ['This quarter', 'Next quarter', 'Just exploring'],
} as const;
