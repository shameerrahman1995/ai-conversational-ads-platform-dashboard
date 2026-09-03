import { Global, Module } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { CostController } from './cost.controller';

// Cost controls (blueprint §22): per-tenant budgets, usage, alerts, model tiering.
// Global so the agent runtime can consult budget/tier before model calls.
@Global()
@Module({
  controllers: [CostController],
  providers: [BudgetService],
  exports: [BudgetService],
})
export class CostModule {}
