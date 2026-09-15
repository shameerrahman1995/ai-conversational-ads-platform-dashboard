import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service';
import { generateTotpSecret, totp } from '../src/common/auth/totp';
import { encryptField } from '../src/common/crypto/field-crypto';

// verifyPassword is a scrypt check — stub it so only 'pw' is the correct password
// (lets us exercise the step-up re-authentication path).
vi.mock('../src/common/auth/password', () => ({ verifyPassword: (pw: string) => pw === 'pw' }));

const SECRET = generateTotpSecret();
const ENC = encryptField(SECRET) as string; // secret is stored ENCRYPTED at rest
const currentStep = () => Math.floor(Date.now() / 1000 / 30);

function deps(user: any) {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(user),
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...user, ...data })),
    },
  } as any;
  const jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') } as any;
  const audit = { record: vi.fn() } as any;
  return { svc: new AuthService(prisma, jwt, audit), prisma };
}

const base = { id: 'u1', orgId: 'org_1', email: 'a@b.co', role: 'admin', platformAdmin: false, name: 'A', passwordHash: 'h', mfaEnabled: false, mfaSecret: null, mfaLastStep: null, org: { status: 'active' } };

describe('AuthService MFA (hardened)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs in without a code when MFA is disabled', async () => {
    const out = await deps(base).svc.login('a@b.co', 'pw');
    expect(out.token).toBe('signed.jwt.token');
  });

  it('refuses login when the tenant org is suspended', async () => {
    const { svc } = deps({ ...base, org: { status: 'suspended' } });
    await expect(svc.login('a@b.co', 'pw')).rejects.toThrow(/suspended/i);
  });

  it('lets a platform super-admin log in even when their org is suspended (to reactivate it)', async () => {
    const { svc } = deps({ ...base, platformAdmin: true, org: { status: 'suspended' } });
    const out = await svc.login('a@b.co', 'pw');
    expect(out.token).toBe('signed.jwt.token');
    expect(out.user.platformAdmin).toBe(true);
  });

  it('requires a code when MFA is enabled (mfa_required)', async () => {
    const { svc } = deps({ ...base, mfaEnabled: true, mfaSecret: ENC });
    await expect(svc.login('a@b.co', 'pw')).rejects.toMatchObject({ response: { code: 'mfa_required' } });
  });

  it('rejects an invalid code and accepts a valid one (secret decrypted from rest)', async () => {
    const { svc } = deps({ ...base, mfaEnabled: true, mfaSecret: ENC });
    await expect(svc.login('a@b.co', 'pw', '000000')).rejects.toBeTruthy();
    const good = await svc.login('a@b.co', 'pw', totp(SECRET));
    expect(good.token).toBe('signed.jwt.token');
  });

  it('stores the secret ENCRYPTED at rest and step-up requires the password', async () => {
    const { svc, prisma } = deps(base);
    await expect(svc.enrollMfa('u1', 'wrong')).rejects.toBeTruthy(); // step-up: bad password
    const enrolled = await svc.enrollMfa('u1', 'pw');
    expect(enrolled.secret).toMatch(/^[A-Z2-7]+$/); // plaintext returned once
    // but what's persisted is the encrypted form
    const stored = prisma.user.update.mock.calls.at(-1)?.[0]?.data?.mfaSecret;
    expect(stored).toMatch(/^enc:v1:/);
    expect(stored).not.toContain(enrolled.secret);
  });

  it('enable requires password + a valid code; disable requires them too', async () => {
    const pending = { ...base, mfaSecret: ENC };
    const d1 = deps(pending);
    await expect(d1.svc.enableMfa('u1', 'wrong', totp(SECRET))).rejects.toBeTruthy(); // bad password
    await expect(d1.svc.enableMfa('u1', 'pw', '000000')).rejects.toBeTruthy(); // bad code
    await d1.svc.enableMfa('u1', 'pw', totp(SECRET));
    expect(d1.prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { mfaEnabled: true, mfaLastStep: expect.any(Number) } });

    const enabled = { ...base, mfaEnabled: true, mfaSecret: ENC };
    const d2 = deps(enabled);
    await expect(d2.svc.disableMfa('u1', 'wrong', totp(SECRET))).rejects.toBeTruthy();
    await d2.svc.disableMfa('u1', 'pw', totp(SECRET));
    expect(d2.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { mfaEnabled: false, mfaSecret: null, mfaLastStep: expect.any(Number) },
    });
  });

  it('rejects a replayed code (at or below the last consumed step)', async () => {
    // mfaLastStep already at the current step → the current code is a replay.
    const { svc } = deps({ ...base, mfaEnabled: true, mfaSecret: ENC, mfaLastStep: currentStep() });
    await expect(svc.login('a@b.co', 'pw', totp(SECRET))).rejects.toMatchObject({ response: { code: 'mfa_invalid' } });
  });
});
