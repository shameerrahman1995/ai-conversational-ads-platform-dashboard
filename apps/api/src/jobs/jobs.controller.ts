import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { JobsProducer } from './jobs.producer';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/rbac/roles.guard';
import { Roles } from '../common/rbac/roles.decorator';

@ApiTags('jobs')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1')
@UseGuards(TenantGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobs: JobsProducer) {}

  /** Enqueue asynchronous parsing of a registered source (durable queue). */
  @Post('sources/:id/parse')
  @Roles('creator')
  async parse(@Req() req: { orgId: string }, @Param('id') id: string) {
    const job = await this.jobs.enqueueParse(req.orgId, id);
    return { jobId: job.id, queued: true };
  }
}
