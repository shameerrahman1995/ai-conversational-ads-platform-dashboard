import type { CampaignSummary } from '@acp/api-client';

export type TabKey = 'identity' | 'knowledge' | 'tools' | 'simulator' | 'transcripts';

/** A hosted AI sales agent, derived from a campaign (there is no list-agents API). */
export interface Agent {
  /** Campaign id — the agent is hosted on the campaign. */
  id: string;
  /** Persona display name (e.g. Ava). */
  name: string;
  /** What the agent does, in one line. */
  role: string;
  /** Short persona / tone descriptor. */
  persona: string;
  /** Personality traits shown as chips. */
  traits: string[];
  /** The visitor-facing opening line (includes the AI disclosure context). */
  greeting: string;
  /** Campaign this agent is attached to. */
  campaignName: string;
  campaignStatus: CampaignSummary['status'];
  objective: string;
  vertical: string | null;
  /** Restricted verticals (e.g. healthcare) require human review before publish. */
  restricted: boolean;
}

interface Persona {
  name: string;
  role: string;
  persona: string;
  traits: string[];
  greeting: string;
}

const ADVERTISER = 'Demo Advertiser Co.';

/** Deterministic persona per known campaign, with a sensible fallback. */
function personaFor(campaign: CampaignSummary, index: number): Persona {
  const key = (campaign.name ?? '').toLowerCase();

  if (key.includes('roof')) {
    return {
      name: 'Ava',
      role: 'Roofing sales assistant',
      persona: 'Warm & consultative',
      traits: ['Concise', 'Solution-oriented', 'Local expert'],
      greeting: `Hi! You're chatting with an AI assistant from ${ADVERTISER} I can help with roof repair questions, ballpark pricing, and booking a free inspection. What's going on with your roof?`,
    };
  }
  if (key.includes('hvac')) {
    return {
      name: 'Milo',
      role: 'HVAC service assistant',
      persona: 'Friendly & efficient',
      traits: ['Reassuring', 'Practical', 'Fast to book'],
      greeting: `Hi! You're chatting with an AI assistant from ${ADVERTISER} I can help schedule a tune-up, explain what's included, and share seasonal offers. How can I help with your system?`,
    };
  }
  if (key.includes('wellness') || campaign.vertical === 'healthcare') {
    return {
      name: 'Nova',
      role: 'Clinic intake assistant',
      persona: 'Calm & careful',
      traits: ['Compliant', 'Empathetic', 'Non-diagnostic'],
      greeting: `Hi! You're chatting with an AI assistant. I can share general clinic information and help you request a callback — I can't give medical advice. What would you like to know?`,
    };
  }

  const pool = ['Sol', 'Remy', 'Iris', 'Theo'];
  return {
    name: pool[index % pool.length],
    role: 'Post-click sales assistant',
    persona: 'Helpful & on-brand',
    traits: ['Concise', 'On-topic', 'Consultative'],
    greeting: `Hi! You're chatting with an AI assistant from ${ADVERTISER} I can answer questions and connect you with the team. How can I help?`,
  };
}

/** Turn the campaign list into the roster of hosted agents. */
export function deriveAgents(campaigns: CampaignSummary[]): Agent[] {
  return campaigns.map((c, i) => {
    const p = personaFor(c, i);
    return {
      id: c.id,
      name: p.name,
      role: p.role,
      persona: p.persona,
      traits: p.traits,
      greeting: p.greeting,
      campaignName: c.name ?? c.objective.replace(/_/g, ' '),
      campaignStatus: c.status,
      objective: c.objective.replace(/_/g, ' '),
      vertical: c.vertical ?? null,
      restricted: c.vertical === 'healthcare',
    };
  });
}
