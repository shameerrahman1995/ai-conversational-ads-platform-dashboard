import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { PrivacyService } from './privacy.service';
import { PrivacyRequestDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('privacy')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/privacy')
@UseGuards(TenantGuard, RolesGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  // DSAR subject-access export: the subject's data, decrypted.
  @Post('export')
  @Roles('admin')
  export(@Req() req: { orgId: string }, @Body() dto: PrivacyRequestDto) {
    return this.privacy.exportSubject(req.orgId, dto.leadId);
  }

  // Right to erasure: delete the subject's lead + linked personal data.
  @Post('erase')
  @Roles('admin')
  erase(@Req() req: { orgId: string }, @Body() dto: PrivacyRequestDto) {
    return this.privacy.eraseSubject(req.orgId, dto.leadId);
  }
}
