/**
 * Idempotent database seed — demo tenant + sample data for local dev and CI e2e.
 *
 * WHY: the demo workspace (org_demo / srahman@hodos360.ai) was previously created
 * by hand, which blocks unattended CI e2e. This script provisions the same data
 * reproducibly. Every write is an UPSERT keyed on a stable id or unique
 * constraint, so it is safe to run repeatedly — running it twice produces no
 * duplicates and simply refreshes the demo rows.
 *
 * HOW TO RUN:
 *   DATABASE_URL=postgresql://<user>@localhost:5432/acp pnpm --filter @acp/db seed
 *   # or, via Prisma's own hook (uses the prisma.seed entry in package.json):
 *   DATABASE_URL=... pnpm --filter @acp/db exec prisma db seed
 *
 * WHAT IT CREATES:
 *   - Organization  org_demo  "Demo Advertiser Co." (growth plan, active)
 *   - Users (all password: demo1234)
 *       srahman@hodos360.ai  (admin)      <- the demo login
 *       creator@demo.co      (creator)
 *       reviewer@demo.co     (reviewer)
 *   - 2 campaigns, 1 agent config, 2 creative variants
 *   - 2 publish plans (one LIVE, one IN_REVIEW) so the Publishing queue is populated
 *   - 1 conversation, 2 leads, and a set of funnel events so the dashboard shows data
 *
 * Passwords are hashed with the SAME scrypt helper the API uses
 * (apps/api/src/common/auth/password.ts) so verifyPassword() accepts them.
 * This file is executed directly by Node's native TypeScript type-stripping
 * (Node >= 22.6, no ts-node/tsx needed) — see the "seed" script in package.json.
 */

import pkg from '../generated/client/index.js';
import { hashPassword } from '../../apps/api/src/common/auth/password.ts';

const { PrismaClient } = pkg as { PrismaClient: new () => import('../generated/client').PrismaClient };
const prisma = new PrismaClient();

const ORG_ID = 'org_demo';
const DEMO_PASSWORD = 'demo1234';

async function seedOrgAndUsers() {
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: 'Demo Advertiser Co.', plan: 'growth', status: 'active' },
    create: {
      id: ORG_ID,
      name: 'Demo Advertiser Co.',
      plan: 'growth',
      status: 'active',
      region: 'us',
      settings: { currency: 'USD', timezone: 'America/New_York' },
    },
  });

  const passwordHash = hashPassword(DEMO_PASSWORD);
  const users: Array<{ id: string; email: string; role: string; name: string; admin?: boolean }> = [
    { id: 'user_demo_admin', email: 'srahman@hodos360.ai', role: 'admin', name: 'Shameer Rahman' },
    { id: 'user_demo_creator', email: 'creator@demo.co', role: 'creator', name: 'Demo Creator' },
    { id: 'user_demo_reviewer', email: 'reviewer@demo.co', role: 'reviewer', name: 'Demo Reviewer' },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { orgId_email: { orgId: ORG_ID, email: u.email } },
      // Re-hash on every run so the known password is always restored, and keep
      // role/name/status current.
      update: { role: u.role as never, name: u.name, status: 'active', passwordHash },
      create: {
        id: u.id,
        orgId: ORG_ID,
        email: u.email,
        role: u.role as never,
        name: u.name,
        status: 'active',
        passwordHash,
      },
    });
  }
  return org;
}

async function seedCampaignsAndCreative() {
  // Campaign 1 — live lead-gen.
  await prisma.campaign.upsert({
    where: { id: 'camp_demo_1' },
    update: { name: 'Spring Lead Gen', status: 'LIVE', objective: 'lead_generation' },
    create: {
      id: 'camp_demo_1',
      orgId: ORG_ID,
      name: 'Spring Lead Gen',
      objective: 'lead_generation',
      status: 'LIVE',
      settings: { platforms: ['google_ads'], budget: { dailyUsd: 250 } },
    },
  });

  // Campaign 2 — in review.
  await prisma.campaign.upsert({
    where: { id: 'camp_demo_2' },
    update: { name: 'Brand Awareness Q3', status: 'IN_REVIEW', objective: 'awareness' },
    create: {
      id: 'camp_demo_2',
      orgId: ORG_ID,
      name: 'Brand Awareness Q3',
      objective: 'awareness',
      status: 'IN_REVIEW',
      settings: { platforms: ['meta'], budget: { dailyUsd: 100 } },
    },
  });

  // Agent config for campaign 1 (campaignId is unique → upsert on it).
  await prisma.agentConfig.upsert({
    where: { campaignId: 'camp_demo_1' },
    update: { status: 'live', name: 'Spring Lead Gen Assistant' },
    create: {
      id: 'agent_demo_1',
      orgId: ORG_ID,
      campaignId: 'camp_demo_1',
      name: 'Spring Lead Gen Assistant',
      status: 'live',
      promptVer: '1',
      settings: { persona: 'friendly', model: 'claude-sonnet-5', voice: 'off' },
    },
  });

  // A creative variant per campaign (referenced by the publish plans below).
  await prisma.creativeVariant.upsert({
    where: { id: 'var_demo_1' },
    update: { status: 'approved' },
    create: {
      id: 'var_demo_1',
      orgId: ORG_ID,
      campaignId: 'camp_demo_1',
      format: 'html5',
      status: 'approved',
      spec: { headline: 'Talk to our AI advisor', body: 'Get a quote in 60 seconds', runtimeProfile: 'live-conversation' },
    },
  });
  await prisma.creativeVariant.upsert({
    where: { id: 'var_demo_2' },
    update: { status: 'draft' },
    create: {
      id: 'var_demo_2',
      orgId: ORG_ID,
      campaignId: 'camp_demo_2',
      format: 'image_1_1',
      status: 'draft',
      spec: { headline: 'Meet the future of advertising', body: 'Conversations that convert' },
    },
  });
}

async function seedPublishPlans() {
  // The idempotencyKey MUST match the 3-part `${variantId}:${platform}:${accountId}`
  // key that PublishService.createPlan builds, so a later createPlan for the same
  // variant/platform/account dedupes against this seeded plan instead of creating a
  // duplicate. We upsert on the stable primary `id` (like the campaigns/agent/
  // variants above) rather than the composite unique key: that keeps the seed
  // idempotent AND migrates any plan previously seeded under the old 2-part key —
  // the update refreshes its idempotencyKey to the new 3-part value in place
  // (upserting on the composite key would miss the old row and collide on `id`).

  // Plan 1 — LIVE on Google Ads.
  await prisma.publishJob.upsert({
    where: { id: 'plan_demo_1' },
    update: {
      status: 'LIVE',
      remoteId: 'gads-ad-1001',
      idempotencyKey: 'var_demo_1:google_ads:123-456-7890',
    },
    create: {
      id: 'plan_demo_1',
      orgId: ORG_ID,
      variantId: 'var_demo_1',
      platform: 'google_ads',
      accountId: '123-456-7890',
      idempotencyKey: 'var_demo_1:google_ads:123-456-7890',
      status: 'LIVE',
      remoteId: 'gads-ad-1001',
      runtimeProfile: 'live-conversation',
    },
  });

  // Plan 2 — awaiting platform review on Meta.
  await prisma.publishJob.upsert({
    where: { id: 'plan_demo_2' },
    update: {
      status: 'IN_REVIEW',
      idempotencyKey: 'var_demo_2:meta:act_998877',
    },
    create: {
      id: 'plan_demo_2',
      orgId: ORG_ID,
      variantId: 'var_demo_2',
      platform: 'meta',
      accountId: 'act_998877',
      idempotencyKey: 'var_demo_2:meta:act_998877',
      status: 'IN_REVIEW',
      remoteId: 'meta-ad-2002',
    },
  });
}

async function seedConversationsLeadsEvents() {
  await prisma.conversation.upsert({
    where: { id: 'conv_demo_1' },
    update: { consent: true },
    create: {
      id: 'conv_demo_1',
      orgId: ORG_ID,
      agentId: 'agent_demo_1',
      visitorId: 'visitor_demo_1',
      consent: true,
    },
  });

  await prisma.lead.upsert({
    where: { id: 'lead_demo_1' },
    update: { score: 82, qualificationLevel: 'high', qualified: true },
    create: {
      id: 'lead_demo_1',
      orgId: ORG_ID,
      conversationId: 'conv_demo_1',
      score: 82,
      qualificationLevel: 'high',
      qualified: true,
      lifecycleStage: 'marketing_qualified',
      agentSummary: 'Interested in the enterprise plan; requested a demo next week.',
    },
  });
  await prisma.lead.upsert({
    where: { id: 'lead_demo_2' },
    update: { score: 45, qualificationLevel: 'medium' },
    create: {
      id: 'lead_demo_2',
      orgId: ORG_ID,
      score: 45,
      qualificationLevel: 'medium',
      lifecycleStage: 'lead',
      agentSummary: 'Early-stage interest; comparing vendors.',
    },
  });

  // Funnel events (types must match analytics/funnel.ts). dedupeKey is unique, so
  // upserting on it keeps re-runs idempotent.
  const events: Array<{ key: string; type: string; variantId?: string }> = [
    ...Array.from({ length: 6 }, (_, i) => ({ key: `evt_demo_impr_${i}`, type: 'ad.impression', variantId: 'var_demo_1' })),
    ...Array.from({ length: 3 }, (_, i) => ({ key: `evt_demo_click_${i}`, type: 'ad.click', variantId: 'var_demo_1' })),
    { key: 'evt_demo_session_0', type: 'agent.session_started', variantId: 'var_demo_1' },
    { key: 'evt_demo_session_1', type: 'agent.session_started', variantId: 'var_demo_1' },
    { key: 'evt_demo_convo_0', type: 'agent.meaningful_conversation', variantId: 'var_demo_1' },
    { key: 'evt_demo_lead_0', type: 'lead.captured', variantId: 'var_demo_1' },
    { key: 'evt_demo_qualified_0', type: 'lead.qualified', variantId: 'var_demo_1' },
  ];
  for (const e of events) {
    await prisma.event.upsert({
      where: { dedupeKey: e.key },
      update: {},
      create: {
        orgId: ORG_ID,
        type: e.type,
        dedupeKey: e.key,
        payload: e.variantId ? { creativeVariantId: e.variantId } : {},
      },
    });
  }
}

async function main() {
  await seedOrgAndUsers();
  await seedCampaignsAndCreative();
  await seedPublishPlans();
  await seedConversationsLeadsEvents();

  const [users, campaigns, plans, leads, events] = await Promise.all([
    prisma.user.count({ where: { orgId: ORG_ID } }),
    prisma.campaign.count({ where: { orgId: ORG_ID } }),
    prisma.publishJob.count({ where: { orgId: ORG_ID } }),
    prisma.lead.count({ where: { orgId: ORG_ID } }),
    prisma.event.count({ where: { orgId: ORG_ID } }),
  ]);

  console.log('Seed complete for org_demo (Demo Advertiser Co.)');
  console.log(`  users=${users} campaigns=${campaigns} publishPlans=${plans} leads=${leads} events=${events}`);
  console.log('  login: srahman@hodos360.ai / demo1234');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
