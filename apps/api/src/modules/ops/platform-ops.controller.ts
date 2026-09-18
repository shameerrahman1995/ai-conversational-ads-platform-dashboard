import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { JobsAdminService } from '../../jobs/jobs-admin.service';
import { PlatformAdminGuard } from '../../common/rbac/platform-admin.guard';

/**
 * Platform (cross-tenant) ops / SRE console: dead-letter-queue visibility and
 * one-click replay across EVERY tenant, for platform super-admins only.
 *
 * This is the cross-tenant sibling of the tenant-scoped {@link OpsController}
 * (`/v1/admin/jobs`, `@Roles('admin')`, org-filtered). Here every route is gated
 * by {@link PlatformAdminGuard}, which requires a verified JWT with
 * `platformAdmin` — a tenant `admin` cannot reach this, and there is no
 * dev-header path in. The failed-job payloads returned here carry their owning
 * `orgId`, which is intentional: a platform operator triages all tenants.
 */
@ApiTags('platform')
@ApiHeader({ name: 'authorization', required: true, description: 'Bearer JWT of a platform super-admin' })
@Controller('v1/platform/jobs')
@UseGuards(PlatformAdminGuard)
export class PlatformOpsController {
  constructor(private readonly jobsAdmin: JobsAdminService) {}

  /** Aggregate queue depth / failed / active counts for every queue (all tenants). */
  @Get()
  countsRoot() {
    return this.jobsAdmin.getCounts();
  }

  /** Alias of the root: aggregate counts for every queue. */
  @Get('counts')
  counts() {
    return this.jobsAdmin.getCounts();
  }

  /** List the retained failed (dead-letter) jobs for one queue across ALL tenants. */
  @Get(':queue/failed')
  failed(@Param('queue') queue: string, @Query('limit') limit?: string) {
    this.assertQueue(queue);
    const parsedLimit = this.parseLimit(limit);
    return this.jobsAdmin.getFailedAll(queue, parsedLimit);
  }

  /** Replay a single failed job by id, regardless of owning org (platform-level). */
  @Post(':queue/:id/retry')
  retry(@Param('queue') queue: string, @Param('id') id: string) {
    this.assertQueue(queue);
    return this.jobsAdmin.retryJobAny(queue, id);
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
