import { describe, it, expect, vi } from 'vitest';
import { ProjectionsService } from '../src/modules/analytics/projections.service';

// ---------------------------------------------------------------------------
// In-memory Prisma fake. Honors the exact filters the service issues (orgId,
// type/type.in, createdAt gte/lt/lte, date gte/lte) so windowing, zero-fill and
// org scoping are exercised for real rather than stubbed to a fixed answer.
// ---------------------------------------------------------------------------
interface EventRow {
  orgId: string;
  type: string;
  payload?: Record<string, unknown>;
  createdAt?: Date;
}
interface SpendRow {
  orgId: string;
  date: string;
  spend: number;
  currency?: string;
}
interface ExperimentRow {
  id: string;
  orgId: string;
  arms: Array<{ key: string; exposures: number; conversions: number }>;
}
interface ConnectionRow {
  orgId: string;
  provider: string;
  status: string;
  updatedAt: Date;
  scopes?: string[];
  meta?: Record<string, unknown> | null;
  secretRef?: string | null;
}
interface OrgRow {
  id: string;
  settings?: Record<string, unknown> | null;
}

function matchEvent(e: EventRow, where: any): boolean {
  if (where.orgId && e.orgId !== where.orgId) return false;
  if (where.type) {
    if (typeof where.type === 'string') {
      if (e.type !== where.type) return false;
    } else if (where.type.in && !where.type.in.includes(e.type)) return false;
  }
  if (where.createdAt) {
    const t = new Date(e.createdAt ?? 0).getTime();
    if (where.createdAt.gte && t < new Date(where.createdAt.gte).getTime()) return false;
    if (where.createdAt.lt && t >= new Date(where.createdAt.lt).getTime()) return false;
    if (where.createdAt.lte && t > new Date(where.createdAt.lte).getTime()) return false;
  }
  return true;
}
function matchSpend(r: SpendRow, where: any): boolean {
  if (where.orgId && r.orgId !== where.orgId) return false;
  if (where.date) {
    if (where.date.gte && r.date < where.date.gte) return false;
    if (where.date.lte && r.date > where.date.lte) return false;
  }
  return true;
}

function makePrisma(data: {
  events?: EventRow[];
  spend?: SpendRow[];
  experiments?: ExperimentRow[];
  connections?: ConnectionRow[];
  orgs?: OrgRow[];
}) {
  const events = data.events ?? [];
  const spend = data.spend ?? [];
  const experiments = data.experiments ?? [];
  const connections = data.connections ?? [];
  const orgs = data.orgs ?? [];
  return {
    organization: {
      findUnique: vi.fn(async ({ where, select }: any) => {
        const org = orgs.find((o) => o.id === where?.id);
        if (!org) return null;
        // Mirror Prisma's `select` so the service only sees what it asked for.
        return select?.settings ? { settings: org.settings ?? null } : org;
      }),
    },
    event: {
      findMany: vi.fn(async ({ where }: any) => events.filter((e) => matchEvent(e, where ?? {}))),
      count: vi.fn(async ({ where }: any) => events.filter((e) => matchEvent(e, where ?? {})).length),
    },
    spendMetric: {
      findMany: vi.fn(async ({ where }: any) => spend.filter((r) => matchSpend(r, where ?? {}))),
    },
    experiment: {
      findMany: vi.fn(async ({ where }: any) =>
        experiments.filter((x) => !where?.orgId || x.orgId === where.orgId),
      ),
    },
    connection: {
      findMany: vi.fn(async ({ where }: any) =>
        connections
          .filter((c) => !where?.orgId || c.orgId === where.orgId)
          // The service never selects secretRef; the fake strips it defensively too.
          .map(({ secretRef: _s, orgId: _o, ...rest }) => rest),
      ),
    },
  } as any;
}

const svc = (prisma: any) => new ProjectionsService(prisma);
const rep = (type: string, n: number, createdAt: Date) =>
  Array.from({ length: n }, () => ({ orgId: 'org_1', type, payload: {}, createdAt }));

describe('ProjectionsService.timeseries', () => {
  it('zero-fills a continuous series and computes the equally-long prior window', async () => {
    const prisma = makePrisma({
      events: [
        { orgId: 'org_1', type: 'ad.click', createdAt: new Date('2026-09-10T05:00:00Z') },
        { orgId: 'org_1', type: 'ad.click', createdAt: new Date('2026-09-10T09:00:00Z') },
        { orgId: 'org_1', type: 'ad.click', createdAt: new Date('2026-09-14T12:00:00Z') },
        // Prior window (2026-09-01..2026-09-07).
        { orgId: 'org_1', type: 'ad.click', createdAt: new Date('2026-09-02T00:00:00Z') },
        // Wrong type — must be ignored.
        { orgId: 'org_1', type: 'ad.impression', createdAt: new Date('2026-09-10T00:00:00Z') },
        // Wrong org — must be excluded by scoping.
        { orgId: 'org_2', type: 'ad.click', createdAt: new Date('2026-09-10T00:00:00Z') },
      ],
    });
    const out = await svc(prisma).timeseries('org_1', {
      metric: 'clicks',
      from: '2026-09-08',
      to: '2026-09-14',
    });

    expect(out.metric).toBe('clicks');
    expect(out.interval).toBe('day');
    expect(out.from).toBe('2026-09-08');
    expect(out.to).toBe('2026-09-14');

    // 7-day current window, gap-free.
    expect(out.points.map((p) => p.date)).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
    ]);
    expect(out.points.find((p) => p.date === '2026-09-10')?.value).toBe(2);
    expect(out.points.find((p) => p.date === '2026-09-14')?.value).toBe(1);
    // Zero-filled empty days.
    expect(out.points.find((p) => p.date === '2026-09-09')?.value).toBe(0);

    // Prior window is the 7 days immediately before [from,to].
    expect(out.priorPoints.map((p) => p.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
    ]);
    expect(out.priorPoints.find((p) => p.date === '2026-09-02')?.value).toBe(1);
    expect(out.priorPoints.every((p) => (p.date === '2026-09-02' ? true : p.value === 0))).toBe(true);

    // Org scoping + combined-window query bounds (priorFrom .. to+1day).
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: {
        orgId: 'org_1',
        type: { in: ['ad.click'] },
        createdAt: {
          gte: new Date(Date.UTC(2026, 8, 1)),
          lt: new Date(Date.UTC(2026, 8, 15)),
        },
      },
      select: { createdAt: true },
    });
  });

  it('spend series reports in the org-configured currency (USD), never a hard-coded INR', async () => {
    const prisma = makePrisma({
      // Org's configured reporting currency is USD (Organization.settings.currency).
      orgs: [{ id: 'org_1', settings: { currency: 'USD', timezone: 'America/New_York' } }],
      spend: [
        { orgId: 'org_1', date: '2026-09-10', spend: 100, currency: 'USD' },
        { orgId: 'org_1', date: '2026-09-14', spend: 50, currency: 'USD' },
        // INR dropped: reporting currency is the org's USD, NOT the old hard-coded INR
        // default (which would previously have won just by being present).
        { orgId: 'org_1', date: '2026-09-12', spend: 777, currency: 'INR' },
        // Prior window.
        { orgId: 'org_1', date: '2026-09-03', spend: 20, currency: 'USD' },
        // Wrong org.
        { orgId: 'org_2', date: '2026-09-10', spend: 999, currency: 'USD' },
      ],
    });
    const out = await svc(prisma).timeseries('org_1', {
      metric: 'spend',
      from: '2026-09-08',
      to: '2026-09-14',
    });

    expect(out.points.find((p) => p.date === '2026-09-10')?.value).toBe(100);
    expect(out.points.find((p) => p.date === '2026-09-14')?.value).toBe(50);
    expect(out.points.find((p) => p.date === '2026-09-12')?.value).toBe(0); // INR excluded
    expect(out.priorPoints.find((p) => p.date === '2026-09-03')?.value).toBe(20);

    expect(prisma.spendMetric.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1', date: { gte: '2026-09-01', lte: '2026-09-14' } },
      select: { date: true, spend: true, currency: true },
    });
    // Org currency is read from Organization.settings (org-scoped by primary key).
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      select: { settings: true },
    });
  });

  it('falls back to the dominant currency in the data when the org configures none', async () => {
    const prisma = makePrisma({
      // No org row -> settings.currency absent -> infer from the data, not a constant.
      spend: [
        { orgId: 'org_1', date: '2026-09-10', spend: 300, currency: 'USD' }, // dominant
        { orgId: 'org_1', date: '2026-09-11', spend: 40, currency: 'INR' },
        { orgId: 'org_1', date: '2026-09-12', spend: 60, currency: 'INR' }, // 100 INR < 300 USD
      ],
    });
    const out = await svc(prisma).timeseries('org_1', {
      metric: 'spend',
      from: '2026-09-08',
      to: '2026-09-14',
    });
    expect(out.points.find((p) => p.date === '2026-09-10')?.value).toBe(300); // USD kept
    expect(out.points.find((p) => p.date === '2026-09-11')?.value).toBe(0); // INR excluded
    expect(out.points.find((p) => p.date === '2026-09-12')?.value).toBe(0); // INR excluded
  });

  it('counts only the canonical lead_submitted event and never double-counts lead.captured', async () => {
    const prisma = makePrisma({
      events: [
        // Canonical creative-runtime leads (what the edge writes).
        { orgId: 'org_1', type: 'lead_submitted', createdAt: new Date('2026-09-10T05:00:00Z') },
        { orgId: 'org_1', type: 'lead_submitted', createdAt: new Date('2026-09-10T06:00:00Z') },
        // Audit action a client could also emit for the SAME lead — must NOT be counted.
        { orgId: 'org_1', type: 'lead.captured', createdAt: new Date('2026-09-10T05:00:00Z') },
        { orgId: 'org_1', type: 'lead.captured', createdAt: new Date('2026-09-10T06:00:00Z') },
      ],
    });
    const out = await svc(prisma).timeseries('org_1', {
      metric: 'leads',
      from: '2026-09-08',
      to: '2026-09-14',
    });
    // 2 lead_submitted, not 4 (would be double-counted if lead.captured were unioned in).
    expect(out.points.find((p) => p.date === '2026-09-10')?.value).toBe(2);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: { in: ['lead_submitted'] } }),
      }),
    );
  });
});

describe('ProjectionsService.insights', () => {
  it('ranks a shippable experiment winner above a funnel drop-off; org-scoped', async () => {
    const day = new Date('2026-05-01T00:00:00Z'); // well away from any CPQL window
    const prisma = makePrisma({
      experiments: [
        {
          id: 'exp_1',
          orgId: 'org_1',
          arms: [
            { key: 'A', exposures: 1000, conversions: 200 },
            { key: 'B', exposures: 1000, conversions: 100 },
          ],
        },
        // Foreign org experiment — must not surface.
        {
          id: 'exp_x',
          orgId: 'org_2',
          arms: [
            { key: 'A', exposures: 1000, conversions: 900 },
            { key: 'B', exposures: 1000, conversions: 100 },
          ],
        },
      ],
      events: [
        ...rep('ad.impression', 100, day),
        ...rep('ad.click', 50, day),
        ...rep('agent.session_started', 10, day), // click -> agent_start = 20%, the worst
        ...rep('agent.meaningful_conversation', 8, day),
        ...rep('lead.captured', 6, day),
        ...rep('lead.qualified', 5, day),
        ...rep('meeting.booked', 4, day),
      ],
      // No spend rows -> no CPQL / spend-WoW insights.
    });

    // `now` is pinned to the funnel data day so the bounded trailing window includes it.
    const { insights } = await svc(prisma).insights('org_1', { now: day });

    const winner = insights.find((i) => i.id === 'experiment-winner-exp_1');
    expect(winner).toBeDefined();
    expect(winner?.source).toBe('experiments');
    expect(winner?.severity).toBe('high');
    expect(winner?.deepLink).toBe('/experiments'); // route that exists in apps/web
    expect(winner?.evidence).toMatch(/confidence across 2000 sessions/);
    // Foreign experiment excluded by scoping.
    expect(insights.some((i) => i.id.includes('exp_x'))).toBe(false);

    const drop = insights.find((i) => i.id === 'funnel-dropoff-click-agent_start');
    expect(drop).toBeDefined();
    expect(drop?.source).toBe('analytics');
    expect(drop?.severity).toBe('high'); // 20% < 25%
    expect(drop?.evidence).toContain('20.0%');
    expect(drop?.evidence).toContain('10 of 50');
    expect(drop?.deepLink).toBe('/analytics'); // route that exists in apps/web

    // Ranked by impact: the winner outranks the drop-off.
    expect(insights.indexOf(winner!)).toBeLessThan(insights.indexOf(drop!));

    expect(prisma.experiment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1' } }),
    );
  });

  it('emits rising-CPQL and spend-WoW insights from windowed spend + qualified events', async () => {
    const now = new Date('2026-09-16T00:00:00Z'); // cur 09-10..09-16, prior 09-03..09-09
    const prisma = makePrisma({
      spend: [
        // Prior 7 days: 100 total.
        { orgId: 'org_1', date: '2026-09-05', spend: 100, currency: 'USD' },
        // Current 7 days: 300 total (3x -> spend WoW up, CPQL up).
        { orgId: 'org_1', date: '2026-09-12', spend: 300, currency: 'USD' },
      ],
      events: [
        // Prior qualified: 10 -> priorCPQL = 100/10 = 10.
        ...rep('lead.qualified', 10, new Date('2026-09-05T00:00:00Z')),
        // Current qualified: 5 -> curCPQL = 300/5 = 60 (6x prior).
        ...rep('lead.qualified', 5, new Date('2026-09-12T00:00:00Z')),
      ],
    });

    const { insights } = await svc(prisma).insights('org_1', { now });

    const cpql = insights.find((i) => i.id === 'cpql-rising');
    expect(cpql).toBeDefined();
    expect(cpql?.source).toBe('analytics');
    expect(cpql?.evidence).toContain('10.00 → 60.00');
    expect(cpql?.deepLink).toBe('/analytics'); // route that exists in apps/web

    const spend = insights.find((i) => i.id === 'spend-wow');
    expect(spend).toBeDefined();
    expect(spend?.source).toBe('spend');
    expect(spend?.evidence).toContain('100.00 → 300.00');

    // Higher-impact CPQL rise ranks above the spend swing.
    expect(insights.indexOf(cpql!)).toBeLessThan(insights.indexOf(spend!));

    // Org-scoped windowed queries.
    expect(prisma.event.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: 'org_1', type: { in: ['lead.qualified'] } }),
      }),
    );
  });
});

describe('ProjectionsService.platformHealth', () => {
  it('maps connection status, derives agent p95, never exposes secretRef; org-scoped', async () => {
    const updated = new Date('2026-09-15T10:00:00Z');
    const prisma = makePrisma({
      connections: [
        {
          orgId: 'org_1',
          provider: 'google_ads',
          status: 'CONNECTED',
          updatedAt: updated,
          scopes: ['adwords'],
          meta: { tokenExpiresAt: '2026-12-01T00:00:00Z' },
          secretRef: 'secret://google',
        },
        {
          orgId: 'org_1',
          provider: 'meta',
          status: 'REAUTH_REQUIRED',
          updatedAt: updated,
          meta: null,
          secretRef: 'secret://meta',
        },
        // tiktok intentionally absent -> disconnected.
        // Foreign org -> excluded.
        { orgId: 'org_2', provider: 'google_ads', status: 'CONNECTED', updatedAt: updated },
      ],
      events: [
        { orgId: 'org_1', type: 'message_sent', payload: { latencyMs: 100 }, createdAt: new Date('2026-09-15T00:00:01Z') },
        { orgId: 'org_1', type: 'message_sent', payload: { latencyMs: 200 }, createdAt: new Date('2026-09-15T00:00:02Z') },
        { orgId: 'org_1', type: 'answer_rendered', payload: { latencyMs: 300 }, createdAt: new Date('2026-09-15T00:00:03Z') },
        { orgId: 'org_1', type: 'message_sent', payload: { latencyMs: 400 }, createdAt: new Date('2026-09-15T00:00:04Z') },
        { orgId: 'org_1', type: 'message_sent', payload: { latencyMs: 500 }, createdAt: new Date('2026-09-15T00:00:05Z') },
      ],
    });

    const { platforms } = await svc(prisma).platformHealth('org_1');
    const by = Object.fromEntries(platforms.map((p) => [p.platform, p]));

    expect(platforms.map((p) => p.platform)).toEqual(['google_ads', 'meta', 'tiktok', 'agent_runtime']);

    expect(by.google_ads.status).toBe('healthy');
    expect(by.google_ads.lastSyncAt).toBe(updated.toISOString());
    expect(by.google_ads.tokenExpiresAt).toBe('2026-12-01T00:00:00.000Z');
    expect(by.google_ads.latencyMs).toBeNull();

    expect(by.meta.status).toBe('action_required');
    expect(by.meta.tokenExpiresAt).toBeNull();

    expect(by.tiktok.status).toBe('disconnected');
    expect(by.tiktok.lastSyncAt).toBeNull();

    expect(by.agent_runtime.status).toBe('healthy');
    expect(by.agent_runtime.latencyMs).toBe(500); // p95 nearest-rank over [100..500]
    expect(by.agent_runtime.lastSyncAt).toBe('2026-09-15T00:00:05.000Z');
    expect(by.agent_runtime.tokenExpiresAt).toBeNull();

    // secretRef never leaves the service.
    for (const p of platforms) expect('secretRef' in p).toBe(false);
    const selectArg = prisma.connection.findMany.mock.calls[0][0].select;
    expect(selectArg.secretRef).toBeUndefined();
    expect(prisma.connection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org_1' } }),
    );
  });

  it('reports every platform disconnected and the agent idle with no data', async () => {
    const prisma = makePrisma({});
    const { platforms } = await svc(prisma).platformHealth('org_1');
    const by = Object.fromEntries(platforms.map((p) => [p.platform, p]));
    expect(by.google_ads.status).toBe('disconnected');
    expect(by.agent_runtime.status).toBe('idle');
    expect(by.agent_runtime.latencyMs).toBeNull();
  });
});
