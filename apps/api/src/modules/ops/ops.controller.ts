import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { JobsAdminService } from '../../jobs/jobs-admin.service';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

/**
 * Ops / SRE surface (Wave 3, P2 reliability): dead-letter-queue visibility and
 * one-click replay for the durable BullMQ queues. Admin-only.
 */
@ApiTags('ops')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/admin/jobs')
@UseGuards(TenantGuard, RolesGuard)
export class OpsController {
  constructor(private readonly jobsAdmin: JobsAdminService) {}

  /** Queue depth / failed / active counts for every queue. */
  @Get('counts')
  @Roles('admin')
  counts(@Req() req: { orgId: string }) {
    void req.orgId; // tenant-scoped access enforced by TenantGuard; view is platform-wide.
    return this.jobsAdmin.getCounts();
  }

  /** List the retained failed (dead-letter) jobs for one queue. */
  @Get(':queue/failed')
  @Roles('admin')
  failed(
    @Req() req: { orgId: string },
    @Param('queue') queue: string,
    @Query('limit') limit?: string,
  ) {
    void req.orgId;
    this.assertQueue(queue);
    const parsedLimit = this.parseLimit(limit);
    return this.jobsAdmin.getFailed(queue, parsedLimit);
  }

  /** Replay a single failed job (re-enqueue for a worker to retry). */
  @Post(':queue/:id/retry')
  @Roles('admin')
  retry(
    @Req() req: { orgId: string },
    @Param('queue') queue: string,
    @Param('id') id: string,
  ) {
    void req.orgId;
    this.assertQueue(queue);
    return this.jobsAdmin.retryJob(queue, id);
  }

  private assertQueue(queue: string): void {
    if (!this.jobsAdmin.isKnownQueue(queue)) {
      throw new BadRequestException(
        `Unknown queue "${queue}". Valid queues: ${JobsAdminService.queueNames.join(', ')}`,
      );
    }
  }

  private parseLimit(limit: string | undefined): number | undefined {
    if (limit === undefined || limit === '') return undefined;
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('Query param "limit" must be a positive number');
    }
    return parsed;
  }
}
