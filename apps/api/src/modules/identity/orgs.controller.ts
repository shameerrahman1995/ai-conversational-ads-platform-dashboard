import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { CreateOrgDto } from './dto';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('identity')
@Controller('v1/orgs')
export class OrgsController {
  constructor(private readonly identity: IdentityService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateOrgDto) {
    return this.identity.createOrg(dto.name, dto.region);
  }
}
