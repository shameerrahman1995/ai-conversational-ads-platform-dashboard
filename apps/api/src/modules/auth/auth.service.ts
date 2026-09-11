import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { verifyPassword } from '../../common/auth/password';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../../common/auth/totp';

/**
 * Password login → signed JWT carrying the verified principal (sub/org/role),
 * with optional TOTP two-factor. MFA is opt-in per user, so accounts that have
 * not enrolled are unaffected. This replaces the header-based dev identity for
 * real deployments.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, code?: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, status: { not: 'suspended' } },
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Second factor: only enforced when the user has enabled MFA.
    if (user.mfaEnabled) {
      if (!code) {
        // A distinct code the client uses to prompt for the authenticator code.
        throw new UnauthorizedException({ code: 'mfa_required', message: 'Authenticator code required' });
      }
      if (!user.mfaSecret || !verifyTotp(user.mfaSecret, code)) {
        throw new UnauthorizedException({ code: 'mfa_invalid', message: 'Invalid authenticator code' });
      }
    }
    const token = await this.jwt.signAsync({
      sub: user.id,
      orgId: user.orgId,
      role: user.role,
      email: user.email,
    });
    await this.audit.record({ orgId: user.orgId, actorId: user.id, action: 'auth.login', target: user.id });
    return {
      token,
      user: { id: user.id, email: user.email, role: user.role, orgId: user.orgId, name: user.name },
    };
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async mfaStatus(userId: string) {
    const user = await this.requireUser(userId);
    return { enabled: user.mfaEnabled };
  }

  /**
   * Begin enrollment: generate + store a fresh secret (NOT yet enabled) and
   * return it for the authenticator app. Enabling requires proving possession
   * of the secret via a valid code, so a bad secret can never lock the user out.
   */
  async enrollMfa(userId: string) {
    const user = await this.requireUser(userId);
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled.');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });
    return { secret, otpauthUri: otpauthUri(secret, user.email) };
  }

  async enableMfa(userId: string, code: string) {
    const user = await this.requireUser(userId);
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled.');
    if (!user.mfaSecret) throw new BadRequestException('Start enrollment before enabling MFA.');
    if (!verifyTotp(user.mfaSecret, code)) throw new BadRequestException('Invalid authenticator code.');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await this.audit.record({ orgId: user.orgId, actorId: userId, action: 'auth.mfa_enabled', target: userId });
    return { enabled: true };
  }

  async disableMfa(userId: string, code: string) {
    const user = await this.requireUser(userId);
    if (!user.mfaEnabled) return { enabled: false };
    if (!user.mfaSecret || !verifyTotp(user.mfaSecret, code)) {
      throw new BadRequestException('Invalid authenticator code.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } });
    await this.audit.record({ orgId: user.orgId, actorId: userId, action: 'auth.mfa_disabled', target: userId });
    return { enabled: false };
  }
}
