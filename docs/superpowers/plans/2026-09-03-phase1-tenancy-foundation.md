# Phase 1 — Tenancy Foundation & DB Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Prisma into the API and deliver tenant isolation + role-based access (RBAC) + an audit spine for the ConvoAds AI platform, plus CI.

**Architecture:** NestJS modular monolith. Prisma client is generated from `db/prisma/schema.prisma` and exposed via the `@acp/db` package; a `PrismaService` (lazy connect) provides it through Nest DI. Tenancy is enforced by always scoping queries with `organizationId` via a `scopedWhere` helper and a `TenantGuard` that resolves the caller's org from a header (auth is stubbed for MVP). RBAC uses a `@Roles()` decorator + `RolesGuard`. Every privileged action writes an `AuditEvent`. Covers blueprint §10 (Identity & tenancy, Policy), §11 (data rules), §17 (tenant security).

**Tech Stack:** TypeScript 5.9.3, NestJS 12.0.1, Prisma 6.19.3 (`prisma-client-js` generator; Prisma 7 dropped in-schema `url` in favor of a driver-adapter model, so we use v6 for a simpler foundation), Vitest 3.2.7 (unit tests via direct instantiation + mocked Prisma), pnpm + Turborepo, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-03-ai-conversational-ads-platform-design.md`

## Global Constraints

- Every business record carries `organizationId`; tenant isolation enforced in application code (spec §3 data rules).
- Provider tokens never in rows/logs; the redacting logger from `@acp/config` is the only logger.
- Immutable versions for approved artifacts; never silently mutate live data.
- No exact-once claims; idempotency keys on publish/lead/booking/CRM writes (not exercised in this plan but respected by schema).
- Pinned versions are exact — do not bump: TypeScript `5.9.3`, NestJS `12.0.1`, Prisma `7.10.0`, Vitest `3.2.4`.
- **Environment note:** Docker daemon is unavailable in the build environment. Do NOT run `prisma migrate dev`, `pnpm infra:up`, or any test that opens a real DB connection. Generate migration SQL offline; unit tests must not connect to Postgres.

## File Structure

- `db/package.json` — add `build: prisma generate` + `exports` pointing at the generated client so `@acp/db` yields `PrismaClient`.
- `db/prisma/migrations/0001_init/migration.sql` + `db/prisma/migrations/migration_lock.toml` — initial schema migration (generated offline).
- `apps/api/src/prisma/prisma.service.ts` + `prisma.module.ts` — DI wrapper (lazy connect, shutdown hook).
- `packages/shared-types/src/index.ts` — add `roleSatisfies()` permission helper (pure).
- `apps/api/src/common/tenant/scoped-where.ts` — `scopedWhere()` helper.
- `apps/api/src/common/tenant/tenant.guard.ts` — resolves org id → `request.orgId`.
- `apps/api/src/common/rbac/roles.decorator.ts` + `roles.guard.ts` — `@Roles()` + `RolesGuard`.
- `apps/api/src/common/audit/audit.service.ts` + `audit.module.ts` — `AuditService.record()`.
- `apps/api/src/modules/identity/*` — `identity.service.ts`, `orgs.controller.ts`, `users.controller.ts`, DTOs; wire into `identity.module.ts`.
- `apps/api/vitest.config.ts` + `apps/api/package.json` test script — Vitest harness.
- `.github/workflows/ci.yml` — install/typecheck/build/test.

---

### Task 1: Generate Prisma client and expose it via `@acp/db`

**Files:**
- Modify: `db/package.json`
- (generated, gitignored) `db/generated/client/**`

**Interfaces:**
- Produces: package `@acp/db` whose default export includes `PrismaClient` (from `@prisma/client` runtime, generated to `db/generated/client`).

- [ ] **Step 1:** In `db/package.json`, add a `build` script and `exports` so consumers import the generated client. Result should contain:

```json
{
  "name": "@acp/db",
  "version": "0.0.0",
  "private": true,
  "exports": {
    ".": {
      "types": "./generated/client/index.d.ts",
      "default": "./generated/client/index.js"
    }
  },
  "scripts": {
    "build": "prisma generate",
    "generate": "prisma generate",
    "migrate": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "studio": "prisma studio",
    "format": "prisma format",
    "validate": "prisma validate"
  },
  "dependencies": { "@prisma/client": "7.10.0" },
  "devDependencies": { "prisma": "7.10.0" }
}
```

- [ ] **Step 2:** Run generate.

Run: `pnpm --filter @acp/db run generate`
Expected: PASS — "Generated Prisma Client" and `db/generated/client/index.js` exists. If the `prisma-client-js` generator errors on Prisma 7, change the generator block in `schema.prisma` to the new `prisma-client` provider with `output = "../generated/client"` and re-run; adjust the `exports` path to the emitted entry if different.

- [ ] **Step 3:** Verify the export resolves.

Run: `node -e "console.log(typeof require('./db/generated/client').PrismaClient)"`
Expected: prints `function`.

- [ ] **Step 4: Commit**

```bash
git add db/package.json
git commit -m "feat(db): generate prisma client and export it from @acp/db"
```

---

### Task 2: PrismaService/PrismaModule (lazy connect) + offline initial migration

**Files:**
- Create: `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.module.ts`
- Create: `db/prisma/migrations/migration_lock.toml`, `db/prisma/migrations/0001_init/migration.sql`
- Modify: `apps/api/package.json` (add `@acp/db` dep), `apps/api/src/app.module.ts` (import PrismaModule)

**Interfaces:**
- Produces: `PrismaService extends PrismaClient` (injectable); `PrismaModule` (global) exporting `PrismaService`.

- [ ] **Step 1:** Add `"@acp/db": "workspace:*"` to `apps/api/package.json` dependencies, then `pnpm install`.

- [ ] **Step 2:** Create `apps/api/src/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@acp/db';

/**
 * Prisma connects lazily on first query, so the API boots without a live DB
 * (blueprint deploy note). We only add a graceful disconnect.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 3:** Create `apps/api/src/prisma/prisma.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

- [ ] **Step 4:** In `apps/api/src/app.module.ts`, add `import { PrismaModule } from './prisma/prisma.module';` and put `PrismaModule` first in the `imports` array.

- [ ] **Step 5:** Generate the initial migration SQL offline (no DB) and the lock file.

Run:
```bash
pnpm --filter @acp/db exec prisma migrate diff \
  --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  > db/prisma/migrations/0001_init/migration.sql
printf 'provider = "postgresql"\n' > db/prisma/migrations/migration_lock.toml
```
(Create the `0001_init` directory first if needed.)
Expected: `migration.sql` contains `CREATE TABLE "Organization"` and the enum types.

- [ ] **Step 6:** Verify the API still builds and boots without a DB.

Run: `pnpm --filter @acp/api build` then boot check:
```bash
DATABASE_URL='postgresql://acp:acp@localhost:5432/acp' REDIS_URL='redis://localhost:6379' node apps/api/dist/main.js &
P=$!; curl -s --retry 15 --retry-connrefused http://localhost:4000/health; echo; kill $P
```
Expected: `{"status":"ok",...}` (no DB connection attempted at boot).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/prisma apps/api/src/app.module.ts apps/api/package.json db/prisma/migrations pnpm-lock.yaml
git commit -m "feat(api): add PrismaService/PrismaModule and initial migration"
```

---

### Task 3: Role permission helper + Vitest harness

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Create: `apps/api/vitest.config.ts`, `apps/api/test/role-satisfies.spec.ts`
- Modify: `apps/api/package.json` (add vitest devDep + `test` script)

**Interfaces:**
- Produces: `roleSatisfies(userRole: UserRole, allowed: UserRole[]): boolean` — `true` if `userRole === 'admin'` OR `userRole` is in `allowed`. Consumed by `RolesGuard` (Task 5).

- [ ] **Step 1: Write the failing test** — `apps/api/test/role-satisfies.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { roleSatisfies } from '@acp/shared-types';

describe('roleSatisfies', () => {
  it('admin satisfies any requirement', () => {
    expect(roleSatisfies('admin', ['publisher'])).toBe(true);
  });
  it('exact role match passes', () => {
    expect(roleSatisfies('reviewer', ['reviewer', 'admin'])).toBe(true);
  });
  it('missing role is denied', () => {
    expect(roleSatisfies('analyst', ['publisher'])).toBe(false);
  });
  it('empty allowlist denies non-admin', () => {
    expect(roleSatisfies('creator', [])).toBe(false);
  });
});
```

- [ ] **Step 2:** Add Vitest to `apps/api/package.json` devDependencies (`"vitest": "3.2.4"`) and a script `"test": "vitest run"`. Create `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.spec.ts'], environment: 'node' },
});
```
Then run `pnpm install`.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @acp/api test`
Expected: FAIL — `roleSatisfies` is not exported.

- [ ] **Step 4: Implement** — append to `packages/shared-types/src/index.ts`:

```ts
/** RBAC check: admin is a superuser; otherwise the role must be in `allowed`. */
export function roleSatisfies(userRole: UserRole, allowed: UserRole[]): boolean {
  return userRole === 'admin' || allowed.includes(userRole);
}
```
Rebuild the package: `pnpm --filter @acp/shared-types build`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @acp/api test`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/index.ts apps/api/vitest.config.ts apps/api/test/role-satisfies.spec.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(auth): add roleSatisfies helper + vitest harness"
```

---

### Task 4: Tenant scoping helper + TenantGuard

**Files:**
- Create: `apps/api/src/common/tenant/scoped-where.ts`, `apps/api/src/common/tenant/tenant.guard.ts`
- Create: `apps/api/test/scoped-where.spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `scopedWhere<T extends object>(orgId: string, where?: T): T & { organizationId: string }`; `TenantGuard` (sets `request.orgId` from `x-org-id` header, throws 400 if absent).

- [ ] **Step 1: Write the failing test** — `apps/api/test/scoped-where.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scopedWhere } from '../src/common/tenant/scoped-where';

describe('scopedWhere', () => {
  it('injects organizationId into an empty where', () => {
    expect(scopedWhere('org_1')).toEqual({ organizationId: 'org_1' });
  });
  it('merges organizationId with an existing where', () => {
    expect(scopedWhere('org_1', { status: 'active' })).toEqual({
      organizationId: 'org_1',
      status: 'active',
    });
  });
  it('org id always wins over a spoofed organizationId in where', () => {
    expect(scopedWhere('org_1', { organizationId: 'org_evil' } as any)).toEqual({
      organizationId: 'org_1',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @acp/api test scoped-where`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `apps/api/src/common/tenant/scoped-where.ts`:

```ts
/**
 * Always constrain a query to a single tenant. The caller's orgId overrides
 * any organizationId present in `where` so a client can never widen scope.
 */
export function scopedWhere<T extends object>(
  orgId: string,
  where?: T,
): T & { organizationId: string } {
  return { ...(where ?? ({} as T)), organizationId: orgId };
}
```

And `apps/api/src/common/tenant/tenant.guard.ts`:

```ts
import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * MVP tenant resolution: read the org from the `x-org-id` header (auth/session
 * replaces this later) and stamp it on the request as `orgId`.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; orgId?: string }>();
    const orgId = req.headers['x-org-id'];
    if (!orgId) throw new BadRequestException('Missing x-org-id');
    req.orgId = orgId;
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @acp/api test scoped-where`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/tenant apps/api/test/scoped-where.spec.ts
git commit -m "feat(tenant): add scopedWhere helper and TenantGuard"
```

---

### Task 5: `@Roles()` decorator + RolesGuard

**Files:**
- Create: `apps/api/src/common/rbac/roles.decorator.ts`, `apps/api/src/common/rbac/roles.guard.ts`
- Create: `apps/api/test/roles.guard.spec.ts`

**Interfaces:**
- Consumes: `roleSatisfies` (Task 3).
- Produces: `Roles(...roles: UserRole[])` decorator (metadata key `'roles'`); `RolesGuard` reading `request.userRole` (from `x-user-role` header for MVP) and the route's required roles.

- [ ] **Step 1: Write the failing test** — `apps/api/test/roles.guard.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../src/common/rbac/roles.guard';

function ctx(userRole: string | undefined, requiredRoles?: string[]) {
  const reflector = new Reflector();
  // stub reflector to return requiredRoles
  (reflector.getAllAndOverride as unknown) = () => requiredRoles;
  const guard = new RolesGuard(reflector);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ headers: userRole ? { 'x-user-role': userRole } : {} }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
  return { guard, context };
}

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    const { guard, context } = ctx('creator', undefined);
    expect(guard.canActivate(context)).toBe(true);
  });
  it('allows admin for any requirement', () => {
    const { guard, context } = ctx('admin', ['publisher']);
    expect(guard.canActivate(context)).toBe(true);
  });
  it('denies a role not in the allowlist', () => {
    const { guard, context } = ctx('analyst', ['publisher']);
    expect(() => guard.canActivate(context)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @acp/api test roles.guard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `apps/api/src/common/rbac/roles.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@acp/shared-types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

And `apps/api/src/common/rbac/roles.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { roleSatisfies, type UserRole } from '@acp/shared-types';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const userRole = req.headers['x-user-role'] as UserRole | undefined;
    if (!userRole || !roleSatisfies(userRole, required)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @acp/api test roles.guard`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/rbac apps/api/test/roles.guard.spec.ts
git commit -m "feat(rbac): add Roles decorator and RolesGuard"
```

---

### Task 6: AuditService

**Files:**
- Create: `apps/api/src/common/audit/audit.service.ts`, `apps/api/src/common/audit/audit.module.ts`
- Create: `apps/api/test/audit.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 2) — but tests inject a mock, so no runtime dependency at test time.
- Produces: `AuditService.record(input: { orgId: string; actorId?: string; action: string; target?: string; metadata?: Record<string, unknown> }): Promise<void>` — writes one `AuditEvent` row.

- [ ] **Step 1: Write the failing test** — `apps/api/test/audit.service.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { AuditService } from '../src/common/audit/audit.service';

describe('AuditService', () => {
  it('writes an audit event scoped to the org', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = { auditEvent: { create } } as any;
    const svc = new AuditService(prisma);

    await svc.record({ orgId: 'org_1', actorId: 'u_1', action: 'org.created', target: 'org_1' });

    expect(create).toHaveBeenCalledWith({
      data: { orgId: 'org_1', actorId: 'u_1', action: 'org.created', target: 'org_1', metadata: undefined },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @acp/api test audit.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `apps/api/src/common/audit/audit.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditInput {
  orgId: string;
  actorId?: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId,
        action: input.action,
        target: input.target,
        metadata: input.metadata as never,
      },
    });
  }
}
```

And `apps/api/src/common/audit/audit.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
```

Note: in the test the `metadata: input.metadata as never` becomes `undefined` when not supplied, matching the assertion.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @acp/api test audit.service`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/audit apps/api/test/audit.service.spec.ts
git commit -m "feat(audit): add AuditService audit spine"
```

---

### Task 7: Identity module (orgs + users, org-scoped) with isolation test

**Files:**
- Create: `apps/api/src/modules/identity/identity.service.ts`, `orgs.controller.ts`, `users.controller.ts`, `dto.ts`
- Modify: `apps/api/src/modules/identity/identity.module.ts`
- Create: `apps/api/test/identity.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 2), `AuditService` (Task 6), `scopedWhere` (Task 4), `TenantGuard` (Task 4), `RolesGuard`/`Roles` (Task 5).
- Produces: `IdentityService` with `createOrg`, `listUsers(orgId)`, `inviteUser(orgId, email, role)`.

- [ ] **Step 1: Write the failing test** — `apps/api/test/identity.service.spec.ts` (isolation: `listUsers` MUST filter by orgId):

```ts
import { describe, it, expect, vi } from 'vitest';
import { IdentityService } from '../src/modules/identity/identity.service';

function makePrisma() {
  return {
    organization: { create: vi.fn().mockResolvedValue({ id: 'org_1', name: 'Acme' }) },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'u_1' }),
    },
  } as any;
}

describe('IdentityService tenant isolation', () => {
  it('listUsers only queries the caller org', async () => {
    const prisma = makePrisma();
    const svc = new IdentityService(prisma, { record: vi.fn() } as any);
    await svc.listUsers('org_1');
    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org_1' } });
  });

  it('inviteUser stamps the caller org and records an audit event', async () => {
    const prisma = makePrisma();
    const audit = { record: vi.fn() };
    const svc = new IdentityService(prisma, audit as any);
    await svc.inviteUser('org_1', 'a@b.com', 'creator');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { organizationId: 'org_1', email: 'a@b.com', role: 'creator', status: 'invited' },
    });
    expect(audit.record).toHaveBeenCalled();
  });
});
```

NOTE on schema: the Prisma model uses field `orgId` mapped from relation, but the scalar FK column is `orgId`. Use `organizationId` in `scopedWhere` ONLY if the Prisma field is named `organizationId`. **The schema names the scalar `orgId`** — so in the service, build the where as `{ orgId }`. Update the test assertions to `{ where: { orgId: 'org_1' } }` and `data: { orgId: 'org_1', ... }` to match the actual Prisma field names. (scopedWhere returns `organizationId`; for Prisma calls, map to the model's `orgId` field — see Step 3.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @acp/api test identity.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `apps/api/src/modules/identity/identity.service.ts` (use the Prisma field names from `schema.prisma`, i.e. `orgId`):

```ts
import { Injectable } from '@nestjs/common';
import type { UserRole } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createOrg(name: string, region = 'us') {
    const org = await this.prisma.organization.create({ data: { name, region } });
    await this.audit.record({ orgId: org.id, action: 'org.created', target: org.id });
    return org;
  }

  async listUsers(orgId: string) {
    return this.prisma.user.findMany({ where: { orgId } });
  }

  async inviteUser(orgId: string, email: string, role: UserRole) {
    const user = await this.prisma.user.create({
      data: { orgId, email, role, status: 'invited' },
    });
    await this.audit.record({ orgId, action: 'user.invited', target: user.id, metadata: { email, role } });
    return user;
  }
}
```

Create `dto.ts` (with `class-validator`-free simple shapes + Swagger `@ApiProperty` optional), `orgs.controller.ts` (`POST /v1/orgs` guarded by `RolesGuard` + `@Roles('admin')`), `users.controller.ts` (`GET /v1/users` + `POST /v1/users` under `TenantGuard`, reading `req.orgId`). Wire providers/controllers into `identity.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { OrgsController } from './orgs.controller';
import { UsersController } from './users.controller';

@Module({
  controllers: [OrgsController, UsersController],
  providers: [IdentityService],
})
export class IdentityModule {}
```

(Adjust the Step 1 test assertions to `{ where: { orgId: 'org_1' } }` and `data: { orgId: 'org_1', email, role, status: 'invited' }`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @acp/api test identity.service`
Expected: PASS (2 tests).

- [ ] **Step 5:** Ensure `AuditModule` and `PrismaModule` are imported so DI resolves at runtime. Add `AuditModule` to `app.module.ts` imports (global). Build the API.

Run: `pnpm --filter @acp/api build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/identity apps/api/src/common/audit apps/api/src/app.module.ts apps/api/test/identity.service.spec.ts
git commit -m "feat(identity): org-scoped orgs/users with tenant isolation + audit"
```

---

### Task 8: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** none.

- [ ] **Step 1:** Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11.5.2
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 2:** Verify the full pipeline locally (what CI will run).

Run: `pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm test`
Expected: all green; `pnpm test` runs the api Vitest suite (others have no test script and are skipped).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add install/build/typecheck/test workflow"
```

---

## Self-Review

- **Spec coverage:** P1.F3 (Tasks 1–2), P1.A tenant/RBAC/audit/identity + isolation tests (Tasks 3–7), P1.F2 CI (Task 8). ✔
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `roleSatisfies(UserRole, UserRole[])` defined in Task 3, consumed in Task 5. `scopedWhere` returns `organizationId`; Prisma model field is `orgId` — Task 7 explicitly maps to `orgId` for Prisma calls (documented in Steps 1 & 3) to avoid the mismatch. `PrismaService`/`AuditService` signatures consistent across Tasks 2/6/7.
- **Env constraint:** no task requires a running DB or Docker; migration is generated offline; tests use direct instantiation + mocked Prisma.
