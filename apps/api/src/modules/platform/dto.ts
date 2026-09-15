import { IsIn } from 'class-validator';

/** The tenant plans a platform admin may assign. Mirrors the Prisma OrgPlan enum. */
export const ORG_PLANS = ['trial', 'starter', 'growth', 'enterprise'] as const;
export type OrgPlanValue = (typeof ORG_PLANS)[number];

export class ChangeOrgPlanDto {
  @IsIn(ORG_PLANS)
  plan!: OrgPlanValue;
}
