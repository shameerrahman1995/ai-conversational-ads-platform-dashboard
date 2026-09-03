import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MODEL_GATEWAY, type ModelGatewayPort } from './model-gateway.port';
import { SYSTEM_POLICY, wrapUntrusted } from './guardrails';
import { computeEvalResult, type EvalCase, type EvalResult, type GoldenQuestion } from './evaluation';

/**
 * Agent builder (blueprint §6): create/configure agents and publish immutable,
 * evaluation-gated versions. Publishing is refused unless golden-question
 * groundedness clears the threshold. Org-scoped + audited.
 */
@Injectable()
export class AgentBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly knowledge: KnowledgeService,
    @Inject(MODEL_GATEWAY) private readonly gateway: ModelGatewayPort,
  ) {}

  async createAgent(orgId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: campaignId }),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const agent = await this.prisma.agentConfig.create({
      data: { orgId, campaignId, promptVer: '1' },
    });
    await this.audit.record({ orgId, action: 'agent.created', target: agent.id });
    return agent;
  }

  async evaluate(orgId: string, agentId: string, goldenSet: GoldenQuestion[]): Promise<EvalResult> {
    await this.requireAgent(orgId, agentId);
    const cases: EvalCase[] = [];
    for (const g of goldenSet) {
      const chunks = await this.knowledge.retrieve(orgId, g.question, 4);
      const context = chunks.map((c) => c.content).join('\n');
      const { text } = await this.gateway.complete([
        { role: 'system', content: `${SYSTEM_POLICY}\n\n${wrapUntrusted(context)}` },
        { role: 'user', content: g.question },
      ]);
      const grounded = chunks.length > 0;
      const matched = g.expectSubstring
        ? text.toLowerCase().includes(g.expectSubstring.toLowerCase())
        : grounded;
      cases.push({ question: g.question, grounded, matched });
    }
    return computeEvalResult(cases);
  }

  async publishVersion(
    orgId: string,
    agentId: string,
    config: Record<string, unknown>,
    goldenSet: GoldenQuestion[],
  ) {
    await this.requireAgent(orgId, agentId);
    const evalResult = await this.evaluate(orgId, agentId, goldenSet);
    if (!evalResult.passed) {
      throw new BadRequestException(
        `Evaluation thresholds not met (groundedness ${(evalResult.groundedRate * 100).toFixed(0)}%)`,
      );
    }
    const version = (await this.prisma.agentVersion.count({ where: { agentConfigId: agentId } })) + 1;
    const agentVersion = await this.prisma.agentVersion.create({
      data: {
        agentConfigId: agentId,
        version,
        config: config as never,
        disclosure: (config.disclosure as string) ?? 'You are chatting with an AI assistant.',
        publishedAt: new Date(),
      },
    });
    await this.audit.record({
      orgId,
      action: 'agent.version_published',
      target: agentId,
      metadata: { version },
    });
    return { version, agentVersionId: agentVersion.id, evalResult };
  }

  private async requireAgent(orgId: string, agentId: string) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }
}
