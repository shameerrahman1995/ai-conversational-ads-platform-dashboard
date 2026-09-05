import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { verifyPassword } from '../../common/auth/password';

/**
 * Password login → signed JWT carrying the verified principal (sub/org/role).
 * This replaces the header-based dev identity for real deployments.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, status: { not: 'suspended' } },
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const token = await this.jwt.signAsync({
      sub: user.id,
      orgId: user.orgId,
      role: user.role,
      email: user.email,
    });
    await this.audit.record({
      orgId: user.orgId,
      actorId: user.id,
      action: 'auth.login',
      target: user.id,
    });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        name: user.name,
      },
    };
  }
}
