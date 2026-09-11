import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service';
import { generateTotpSecret, totp } from '../src/common/auth/totp';

// verifyPassword is a scrypt check — stub it so we can focus on the MFA logic.
vi.mock('../src/common/auth/password', () => ({ verifyPassword: () => true }));

const SECRET = generateTotpSecret();

function deps(user: any) {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(user), // login lookup
      findUnique: vi.fn().mockResolvedValue(user), // self-service lookup
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...user, ...data })),
    },
  } as any;
  const jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') } as any;
  const audit = { record: vi.fn() } as any;
  return { svc: new AuthService(prisma, jwt, audit), prisma };
}

const baseUser = { id: 'u1', orgId: 'org_1', email: 'a@b.co', role: 'admin', name: 'A', passwordHash: 'h', mfaEnabled: false, mfaSecret: null };

describe('AuthService MFA', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs in without a code when MFA is disabled', async () => {
    const { svc } = deps(baseUser);
    const out = await svc.login('a@b.co', 'pw');
    expect(out.token).toBe('signed.jwt.token');
  });

  it('requires a code when MFA is enabled (mfa_required)', async () => {
    const { svc } = deps({ ...baseUser, mfaEnabled: true, mfaSecret: SECRET });
    await expect(svc.login('a@b.co', 'pw')).rejects.toMatchObject({
      response: { code: 'mfa_required' },
    });
  });

  it('rejects an invalid code and accepts a valid one', async () => {
    const { svc } = deps({ ...baseUser, mfaEnabled: true, mfaSecret: SECRET });
    await expect(svc.login('a@b.co', 'pw', '000000')).rejects.toBeTruthy();
    const good = await svc.login('a@b.co', 'pw', totp(SECRET));
    expect(good.token).toBe('signed.jwt.token');
  });

  it('enroll → enable requires a valid code; enable flips mfaEnabled', async () => {
    // enroll stores a secret
    const enrollDeps = deps(baseUser);
    const enrolled = await enrollDeps.svc.enrollMfa('u1');
    expect(enrolled.secret).toMatch(/^[A-Z2-7]+$/);
    expect(enrolled.otpauthUri).toContain('otpauth://');

    // enable with a bad code throws; a good code enables
    const pending = { ...baseUser, mfaSecret: SECRET };
    const { svc, prisma } = deps(pending);
    await expect(svc.enableMfa('u1', '000000')).rejects.toBeTruthy();
    await svc.enableMfa('u1', totp(SECRET));
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { mfaEnabled: true } });
  });

  it('disable requires a valid code and clears the secret', async () => {
    const { svc, prisma } = deps({ ...baseUser, mfaEnabled: true, mfaSecret: SECRET });
    await expect(svc.disableMfa('u1', '111111')).rejects.toBeTruthy();
    await svc.disableMfa('u1', totp(SECRET));
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { mfaEnabled: false, mfaSecret: null } });
  });
});
