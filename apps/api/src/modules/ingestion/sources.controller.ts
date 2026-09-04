import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { IngestionService } from './ingestion.service';
import { ParseService } from './parse.service';
import { RegisterSourceDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('ingestion')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/sources')
@UseGuards(TenantGuard, RolesGuard)
export class SourcesController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly parseService: ParseService,
  ) {}

  @Post()
  @Roles('creator')
  register(@Req() req: { orgId: string }, @Body() dto: RegisterSourceDto) {
    return this.ingestion.registerSource(req.orgId, dto);
  }

  /**
   * Parse a registered source now (crawl/parse → extract candidate facts, stored
   * UNAPPROVED). Runs synchronously so the reviewer sees facts immediately; the
   * durable-queue path is used when a real worker is wired.
   */
  @Post(':id/parse')
  @Roles('creator')
  async parse(@Req() req: { orgId: string }, @Param('id') id: string) {
    await this.parseService.parseSource(req.orgId, id);
    return this.ingestion.getStatus(req.orgId, id);
  }

  @Get()
  @Roles('creator')
  list(@Req() req: { orgId: string }) {
    return this.ingestion.listSources(req.orgId);
  }

  @Get(':id')
  @Roles('creator')
  status(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.ingestion.getStatus(req.orgId, id);
  }

  @Get(':id/facts')
  @Roles('creator')
  facts(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.ingestion.listFacts(req.orgId, id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.ingestion.deleteSource(req.orgId, id);
  }
}
