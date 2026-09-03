import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { OrgsController } from './orgs.controller';
import { UsersController } from './users.controller';

// Identity & tenancy: organizations, users, invitations, RBAC, audit (blueprint §10).
@Module({
  controllers: [OrgsController, UsersController],
  providers: [IdentityService],
})
export class IdentityModule {}
