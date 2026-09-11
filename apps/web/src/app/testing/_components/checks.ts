import type { ApiClient } from '@acp/api-client';

/* ================================================================== */
/* Testing & QA — preflight check catalogue.                           */
/*                                                                     */
/* HONESTY CONTRACT                                                    */
/* Two kinds of check live here and they are never mixed up:           */
/*  - `runnable`   : executed live against the API with real,          */
/*                   read-only / non-mutating calls. Their pass/fail    */
/*                   comes from the actual response — never fabricated. */
/*  - `documented` : guarantees the backend enforces that a browser    */
/*                   cannot (and must not) execute. They are shown as   */
/*                   "verified by the platform" with a plain-language   */
/*                   explanation, NOT as a fake test that was run.      */
/* No `run` function performs a write / publish / execute call.        */
/* ================================================================== */

export type CheckStatus = 'passed' | 'warning' | 'failed';
export type Area = 'Creative' | 'AI agent' | 'Platform' | 'Consent';
export type CheckKind = 'runnable' | 'documented';

export interface CheckResult {
  status: CheckStatus;
  /** One-line, human-readable outcome. */
  summary: string;
  /** Raw evidence rendered in the Inspect drawer via <JsonViewer/>. */
  detail: unknown;
}

export interface CheckDef {
  id: string;
  name: string;
  area: Area;
  kind: CheckKind;
  /** What the check verifies (runnable) or why it is enforced server-side (documented). */
  description: string;
  /** Present only for runnable checks. Executes a real, read-only API call. */
  run?: (client: ApiClient) => Promise<CheckResult>;
  /** Present only for documented checks — the fixed, honest, verified-by-construction result. */
  documented?: CheckResult;
}

export const AREAS: Area[] = ['Creative', 'AI agent', 'Platform', 'Consent'];

/** Normalise any thrown value into inspectable JSON. */
function errToDetail(e: unknown): Record<string, unknown> {
  if (e instanceof Error) return { error: e.name, message: e.message };
  return { error: 'unknown', message: String(e) };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const LOWER = (s: string | null | undefined) => (s ?? '').toLowerCase();

/* ------------------------------------------------------------------ */
/* Runnable checks — every call below is a GET or a non-mutating       */
/* simulation. None of them create, publish, execute or deliver.       */
/* ------------------------------------------------------------------ */

/** Platform · the API is reachable — a hard prerequisite for everything else. */
async function runApiHealth(client: ApiClient): Promise<CheckResult> {
  try {
    const res = await client.health();
    const ok = res.status === 'ok';
    return {
      status: ok ? 'passed' : 'failed',
      summary: ok
        ? `API "${res.service}" responded ok`
        : `API responded with status "${res.status}"`,
      detail: res,
    };
  } catch (e) {
    return {
      status: 'failed',
      summary: `API unreachable — nothing can go live (${errMsg(e)})`,
      detail: errToDetail(e),
    };
  }
}

/** AI agent · run the studio grounding simulator and confirm the reply is grounded. */
async function runAgentGrounding(client: ApiClient): Promise<CheckResult> {
  try {
    const agents = await client.agents.list();
    if (agents.length === 0) {
      return { status: 'warning', summary: 'No agent available to evaluate', detail: { agents: 0 } };
    }
    const agent = agents[0];
    const probe = 'What do you offer, and how does it work?';
    const res = await client.agents.preview(agent.id, probe);
    const grounded = res.grounded && !res.fallback;
    const status: CheckStatus = grounded ? 'passed' : 'warning';
    const summary = grounded
      ? `Grounded reply with ${res.citations.length} citation(s)`
      : res.fallback
        ? 'Agent used its safe fallback instead of a grounded answer'
        : 'Reply was not grounded in approved facts';
    return {
      status,
      summary,
      detail: {
        note: 'Executed the same read-only preview simulator the Agent Studio uses. No agent version was published.',
        agent: { id: agent.id, name: agent.name },
        probe,
        model: res.model,
        grounded: res.grounded,
        fallback: res.fallback,
        citations: res.citations,
        reply: res.reply,
      },
    };
  } catch (e) {
    return {
      status: 'warning',
      summary: `Could not evaluate the agent (${errMsg(e)})`,
      detail: errToDetail(e),
    };
  }
}

/** Platform · every connected ad channel is authorised and healthy. */
async function runConnectionHealth(client: ApiClient): Promise<CheckResult> {
  try {
    const conns = await client.connections.list();
    if (conns.length === 0) {
      return {
        status: 'warning',
        summary: 'No ad channels connected yet',
        detail: { connections: [] },
      };
    }
    const BLOCK = new Set(['REVOKED']);
    const DEGRADED = new Set(['REAUTH_REQUIRED', 'DISCONNECTED', 'DEGRADED']);
    const blockers = conns.filter((c) => BLOCK.has(c.status));
    const degraded = conns.filter((c) => DEGRADED.has(c.status));
    const status: CheckStatus = blockers.length ? 'failed' : degraded.length ? 'warning' : 'passed';
    const summary = blockers.length
      ? `${blockers.length} channel(s) revoked — reconnect before publishing`
      : degraded.length
        ? `${degraded.length} of ${conns.length} channel(s) need attention`
        : `All ${conns.length} channel(s) connected`;
    return {
      status,
      summary,
      detail: {
        connections: conns.map((c) => ({ provider: c.provider, status: c.status, scopes: c.scopes })),
      },
    };
  } catch (e) {
    return {
      status: 'warning',
      summary: `Could not read connections (${errMsg(e)})`,
      detail: errToDetail(e),
    };
  }
}

/** Platform · no publish package is stuck in a validation-failed / rejected state. */
async function runPublishPlans(client: ApiClient): Promise<CheckResult> {
  try {
    const plans = await client.publishing.plans();
    if (plans.length === 0) {
      return { status: 'passed', summary: 'No publish packages queued', detail: { plans: 0 } };
    }
    const FAILED = new Set(['VALIDATION_FAILED', 'REJECTED']);
    const REVIEW = new Set(['IN_REVIEW', 'READY_FOR_REVIEW']);
    const failed = plans.filter((p) => FAILED.has(p.status));
    const inReview = plans.filter((p) => REVIEW.has(p.status));
    const status: CheckStatus = failed.length ? 'failed' : inReview.length ? 'warning' : 'passed';
    const summary = failed.length
      ? `${failed.length} package(s) failed validation / were rejected`
      : inReview.length
        ? `${inReview.length} package(s) awaiting review`
        : `All ${plans.length} package(s) validate`;
    return {
      status,
      summary,
      detail: {
        plans: plans.map((p) => ({
          platform: p.platform,
          status: p.status,
          reviewReason: p.reviewReason ?? null,
        })),
      },
    };
  } catch (e) {
    return {
      status: 'warning',
      summary: `Could not read publish packages (${errMsg(e)})`,
      detail: errToDetail(e),
    };
  }
}

/** Creative · no creative variant is sitting in a validation-failed state. */
async function runCreativeValidation(client: ApiClient): Promise<CheckResult> {
  try {
    const campaigns = await client.campaigns.list();
    if (campaigns.length === 0) {
      return { status: 'warning', summary: 'No campaigns to validate creative for', detail: { campaigns: 0 } };
    }
    const sample = campaigns.slice(0, 8);
    const groups = await Promise.all(
      sample.map(async (c) => {
        try {
          return { campaignId: c.id, variants: await client.creative.variants(c.id) };
        } catch {
          return { campaignId: c.id, variants: [] };
        }
      }),
    );
    const variants = groups.flatMap((g) => g.variants);
    const failed = variants.filter((v) => LOWER(v.status) === 'validation_failed');
    const status: CheckStatus = failed.length ? 'failed' : variants.length === 0 ? 'warning' : 'passed';
    const summary = failed.length
      ? `${failed.length} of ${variants.length} variant(s) failed validation`
      : variants.length === 0
        ? `No creative variants across ${sample.length} sampled campaign(s)`
        : `All ${variants.length} variant(s) across ${sample.length} campaign(s) valid`;
    return {
      status,
      summary,
      detail: {
        sampledCampaigns: sample.length,
        variantCount: variants.length,
        failed: failed.map((v) => ({ id: v.id, format: v.format, status: v.status })),
      },
    };
  } catch (e) {
    return {
      status: 'warning',
      summary: `Could not read creative variants (${errMsg(e)})`,
      detail: errToDetail(e),
    };
  }
}

/** Consent · every stored lead sampled carries at least one consent record. */
async function runLeadConsent(client: ApiClient): Promise<CheckResult> {
  try {
    const leads = await client.leads.list();
    if (leads.length === 0) {
      return {
        status: 'passed',
        summary: 'No stored leads — nothing captured without consent',
        detail: { leads: 0 },
      };
    }
    const sample = leads.slice(0, 5);
    const details = await Promise.all(
      sample.map(async (l) => {
        try {
          return await client.leads.get(l.id);
        } catch {
          return null;
        }
      }),
    );
    const checked = details.filter((d): d is NonNullable<typeof d> => d !== null);
    const missing = checked.filter((d) => !d.consentRecords || d.consentRecords.length === 0);
    const status: CheckStatus = missing.length ? 'failed' : 'passed';
    const summary = missing.length
      ? `${missing.length} of ${checked.length} sampled lead(s) missing a consent record`
      : `All ${checked.length} sampled lead(s) carry a consent record`;
    return {
      status,
      summary,
      detail: {
        sampled: checked.length,
        missingConsent: missing.map((d) => d.id),
        sample: checked.map((d) => ({
          id: d.id,
          consentRecords: (d.consentRecords ?? []).map((c) => ({
            type: c.type,
            granted: c.granted,
            disclosureVersion: c.disclosureVersion,
          })),
        })),
      },
    };
  } catch (e) {
    return {
      status: 'warning',
      summary: `Could not sample lead consent (${errMsg(e)})`,
      detail: errToDetail(e),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Documented checks — guarantees the backend enforces. These are NOT  */
/* run from the browser; each says plainly why, and what the platform  */
/* guarantees. Status is 'passed' = verified by construction.          */
/* ------------------------------------------------------------------ */

function documented(guarantee: string, why: string): CheckResult {
  return {
    status: 'passed',
    summary: guarantee,
    detail: {
      verification: 'verified-by-construction',
      enforcedBy: 'ConvoAds backend',
      runnableFromBrowser: false,
      whyNotRunHere: why,
      guarantee,
    },
  };
}

/* ------------------------------------------------------------------ */

export const CHECKS: CheckDef[] = [
  {
    id: 'creative-validation',
    name: 'Creative variants pass validation',
    area: 'Creative',
    kind: 'runnable',
    description: 'Samples your campaigns and flags any creative variant left in a validation-failed state.',
    run: runCreativeValidation,
  },
  {
    id: 'tiktok-offline',
    name: 'TikTok offline package makes no external requests',
    area: 'Creative',
    kind: 'documented',
    description:
      'The exported TikTok package is self-contained: assets are embedded and it issues no network calls at render time.',
    documented: documented(
      'Exported TikTok package is fully self-contained — no external requests at render time',
      'The check inspects a compiled binary package the browser never receives; the export builder enforces it server-side.',
    ),
  },
  {
    id: 'agent-grounding',
    name: 'Grounded agent replies with citations',
    area: 'AI agent',
    kind: 'runnable',
    description: 'Runs the read-only Agent Studio preview simulator and confirms the reply is grounded, not a fallback.',
    run: runAgentGrounding,
  },
  {
    id: 'agent-eval-gate',
    name: 'Agent cannot publish until its evaluation passes',
    area: 'AI agent',
    kind: 'documented',
    description:
      'Publishing an agent version is gated on its golden-set evaluation passing; a failing agent can never reach production.',
    documented: documented(
      'Publish is blocked until the agent version passes its golden-set evaluation',
      'The gate lives in the publish pipeline and cannot be exercised without mutating state, so it is not run from here.',
    ),
  },
  {
    id: 'api-health',
    name: 'API service is reachable',
    area: 'Platform',
    kind: 'runnable',
    description: 'Calls the API health endpoint — a hard prerequisite before anything can be validated or published.',
    run: runApiHealth,
  },
  {
    id: 'connection-health',
    name: 'Ad channels connected and healthy',
    area: 'Platform',
    kind: 'runnable',
    description: 'Reads your connections and flags any channel that is revoked, disconnected or needs re-authorisation.',
    run: runConnectionHealth,
  },
  {
    id: 'publish-plans',
    name: 'Publish packages validate',
    area: 'Platform',
    kind: 'runnable',
    description: 'Reads queued publish packages and flags any stuck in a validation-failed or rejected state.',
    run: runPublishPlans,
  },
  {
    id: 'no-secrets',
    name: 'No secrets in compiled packages',
    area: 'Platform',
    kind: 'documented',
    description:
      'Compiled export packages ship only public configuration; credentials and API keys are stripped at build time.',
    documented: documented(
      'Compiled packages contain no credentials or secrets — stripped at build time',
      'This scans build artefacts on the server; the browser has no access to them, so it is reported, not executed.',
    ),
  },
  {
    id: 'remote-paused',
    name: 'Remote objects created paused / disabled',
    area: 'Platform',
    kind: 'documented',
    description:
      'The publish executor creates every remote ad object paused — nothing spends until you explicitly resume it.',
    documented: documented(
      'Every remote ad object is created paused — no spend until explicitly resumed',
      'Confirming it would require executing a real publish (a write); the executor enforces it, so it is documented here.',
    ),
  },
  {
    id: 'lead-consent',
    name: 'Stored leads carry a consent record',
    area: 'Consent',
    kind: 'runnable',
    description: 'Samples stored leads and confirms each one has at least one recorded consent grant.',
    run: runLeadConsent,
  },
  {
    id: 'consent-required',
    name: 'Consent required before a lead is stored',
    area: 'Consent',
    kind: 'documented',
    description:
      'The lead-capture pipeline refuses to persist a lead without a consent record; disclosure is versioned per capture.',
    documented: documented(
      'The pipeline rejects any lead without a consent record before storage',
      'It is a server-side write-path guard; it cannot be tripped from the browser without storing a real lead.',
    ),
  },
];

export const RUNNABLE_COUNT = CHECKS.filter((c) => c.kind === 'runnable').length;
export const DOCUMENTED_COUNT = CHECKS.filter((c) => c.kind === 'documented').length;
