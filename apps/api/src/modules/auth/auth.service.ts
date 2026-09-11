import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { verifyPassword } from '../../common/auth/password';
import { encryptField, decryptField } from '../../common/crypto/field-crypto';
import { generateTotpSecret, otpauthUri, verifyTotpWithStep } from '../../common/auth/totp';

type UserRow = { id: string; orgId: string; email: string; role: string; name: string | null; passwordHash: string | null; mfaEnabled: boolean; mfaSecret: string | null; mfaLastStep: number | null };

/**
 * Password login → signed JWT carrying the verified principal, with optional TOTP
 * two-factor. Hardening: the TOTP secret is encrypted at rest; each code is
 * single-use (replay-guarded via mfaLastStep); enrolling/enabling/disabling MFA
 * requires a password step-up; and the auth routes are rate-limited (controller).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  private assertPassword(user: UserRow, password: string) {
    if (!password || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Password confirmation is required for this change.');
    }
  }

  /**
   * Validate a submitted code against the (encrypted) secret and the replay guard.
   * Returns the matched time-step to persist as the new high-water mark. Throws on
   * an invalid code or a replay of a code at/below the last consumed step.
   */
  private consumeCode(user: UserRow, code: string): number {
    const secret = decryptField(user.mfaSecret);
    const step = secret ? verifyTotpWithStep(secret, code) : null;
    if (step === null) throw new BadRequestException('Invalid authenticator code.');
    if (user.mfaLastStep != null && step <= user.mfaLastStep) {
      throw new BadRequestException('That code was already used — wait for the next one.');
    }
    return step;
  }

  async login(email: string, password: string, code?: string) {
    const user = (await this.prisma.user.findFirst({
      where: { email, status: { not: 'suspended' } },
    })) as UserRow | null;
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.mfaEnabled) {
      if (!code) {
        throw new UnauthorizedException({ code: 'mfa_required', message: 'Authenticator code required' });
      }
      let step: number;
      try {
        step = this.consumeCode(user, code);
      } catch {
        throw new UnauthorizedException({ code: 'mfa_invalid', message: 'Invalid authenticator code' });
      }
      await this.prisma.user.update({ where: { id: user.id }, data: { mfaLastStep: step } });
    }
    const token = await this.jwt.signAsync({ sub: user.id, orgId: user.orgId, role: user.role, email: user.email });
    await this.audit.record({ orgId: user.orgId, actorId: user.id, action: 'auth.login', target: user.id });
    return {
      token,
      user: { id: user.id, email: user.email, role: user.role, orgId: user.orgId, name: user.name },
    };
  }

  private async requireUser(userId: string): Promise<UserRow> {
    const user = (await this.prisma.user.findUnique({ where: { id: userId } })) as UserRow | null;
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async mfaStatus(userId: string) {
    const user = await this.requireUser(userId);
    return { enabled: user.mfaEnabled };
  }

  /**
   * Begin enrollment: password step-up, then generate + store a fresh secret
   * (ENCRYPTED at rest, NOT yet enabled) and return the plaintext once for the
   * authenticator app. Enabling requires a valid code, so a bad secret cannot
   * lock the user out.
   */
  async enrollMfa(userId: string, password: string) {
    const user = await this.requireUser(userId);
    this.assertPassword(user, password);
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled.');
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: encryptField(secret), mfaLastStep: null },
    });
    return { secret, otpauthUri: otpauthUri(secret, user.email) };
  }

  async enableMfa(userId: string, password: string, code: string) {
    const user = await this.requireUser(userId);
    this.assertPassword(user, password);
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled.');
    if (!user.mfaSecret) throw new BadRequestException('Start enrollment before enabling MFA.');
    const step = this.consumeCode(user, code);
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true, mfaLastStep: step } });
    await this.audit.record({ orgId: user.orgId, actorId: userId, action: 'auth.mfa_enabled', target: userId });
    return { enabled: true };
  }

  async disableMfa(userId: string, password: string, code: string) {
    const user = await this.requireUser(userId);
    this.assertPassword(user, password);
    if (!user.mfaEnabled) return { enabled: false };
    const step = this.consumeCode(user, code);
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaLastStep: step },
    });
    await this.audit.record({ orgId: user.orgId, actorId: userId, action: 'auth.mfa_disabled', target: userId });
    return { enabled: false };
  }
}
