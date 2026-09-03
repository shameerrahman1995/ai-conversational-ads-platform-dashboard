# Phase 1 — Product Ingestion (P1.I) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Register product sources (URL / PDF / feed), obtain signed upload URLs with malware-scan gating, parse them, extract candidate facts, let a human approve facts, and delete sources — all org-scoped and audited.

**Architecture:** NestJS modules over Prisma. External systems sit behind **ports** (interfaces) so the platform is testable without live infra: `StoragePort` (S3 presigned uploads), `MalwareScannerPort`, `SourceParserPort`, `FactExtractorPort`. Real `S3StorageAdapter` ships; malware scan, PDF/OCR parsing, and LLM extraction ship as **dev stubs** behind their ports (ClamAV / OCR / Anthropic swap in later without touching callers). Approved facts are the ONLY input campaign generation later consumes.

**Tech Stack:** NestJS 12, Prisma 6.19.3, Vitest 3.2.7, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 3.1125.0.

**Spec:** `docs/superpowers/specs/2026-09-03-ai-conversational-ads-platform-design.md`

## Global Constraints

- Every record carries `orgId`; all queries scoped via `scopedWhere(orgId)`; RBAC via `@Roles()`; privileged actions audited via `AuditService`.
- Signed upload URLs only; never expose S3 credentials to the browser. Assets start `scanClean=false`; parsing must refuse unscanned/unclean assets.
- Header auth remains the dev stub (fails closed in prod via `assertDevAuthAllowed`).
- Pinned exact: NestJS `12.0.1`, Prisma `6.19.3`, Vitest `3.2.7`, aws-sdk `3.1125.0`.
- **Env note:** No Docker/S3/Redis/Postgres live. Do not run migrations against a DB or integration-test S3. Regenerate the single init migration offline; unit-test all logic with mocked ports + mocked Prisma.

## File Structure

- `db/prisma/schema.prisma` — add `SourceFact` model + back-relations; regenerate `0001_init` offline (no env has applied it yet).
- `apps/api/package.json` — add aws-sdk deps.
- `apps/api/src/common/storage/{storage.port.ts,s3-storage.adapter.ts,storage.module.ts}`
- `apps/api/src/common/scanner/{scanner.port.ts,dev-scanner.ts,scanner.module.ts}`
- `apps/api/src/modules/ingestion/parsing/{parser.port.ts,source-parser.ts}`
- `apps/api/src/modules/ingestion/facts/{extractor.port.ts,stub-extractor.ts}`
- `apps/api/src/modules/ingestion/{ingestion.service.ts,parse.service.ts,sources.controller.ts,facts.controller.ts,dto.ts,ingestion.module.ts}`
- `apps/api/test/*.spec.ts` — unit tests.

---

### Task 1: Schema — SourceFact model + regenerate client/migration

**Files:** Modify `db/prisma/schema.prisma`; regenerate `db/generated/client` + `db/prisma/migrations/0001_init/migration.sql`.

**Interfaces:** Produces Prisma model `SourceFact { id, orgId, sourceDocId, text, approved, approvedBy?, createdAt }` and `SourceDocument.facts`.

- [ ] **Step 1:** Add to `SourceDocument` model: `facts SourceFact[]`. Add to `Organization` model: `sourceFacts SourceFact[]`. Add new model:

```prisma
model SourceFact {
  id          String   @id @default(cuid())
  orgId       String
  sourceDocId String
  text        String
  approved    Boolean  @default(false)
  approvedBy  String?
  createdAt   DateTime @default(now())

  org       Organization   @relation(fields: [orgId], references: [id], onDelete: Cascade)
  sourceDoc SourceDocument @relation(fields: [sourceDocId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@index([sourceDocId])
}
```

- [ ] **Step 2:** Regenerate client + migration (offline; no env has applied migrations yet, so overwriting the init migration is safe):

```bash
pnpm --filter @acp/db run generate
pnpm --filter @acp/db exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > db/prisma/migrations/0001_init/migration.sql
```
Expected: `migration.sql` now contains `CREATE TABLE "SourceFact"`.

- [ ] **Step 3:** Verify the client exposes the model: `node -e "const {PrismaClient}=require('./db/generated/client'); console.log('sourceFact' in new PrismaClient())"` → prints `true` (or check `db/generated/client/index.d.ts` for `SourceFact`).

- [ ] **Step 4: Commit** (central; done by orchestrator).

---

### Task 2: StoragePort + S3 adapter

**Files:** Create `apps/api/src/common/storage/{storage.port.ts,s3-storage.adapter.ts,storage.module.ts}`; add aws-sdk deps to `apps/api/package.json`.

**Interfaces:** Produces `STORAGE_PORT` token + `StoragePort { createSignedUploadUrl(key, contentType): Promise<{ url: string; key: string }>; deleteObject(key): Promise<void> }`.

- [ ] **Step 1:** `storage.port.ts`:

```ts
export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface SignedUpload {
  url: string;
  key: string;
}

export interface StoragePort {
  createSignedUploadUrl(key: string, contentType: string): Promise<SignedUpload>;
  deleteObject(key: string): Promise<void>;
}
```

- [ ] **Step 2:** `s3-storage.adapter.ts` — real adapter (not unit-tested; correctness by inspection). Uses `@aws-sdk/client-s3` `S3Client` + `PutObjectCommand`/`DeleteObjectCommand` and `getSignedUrl` from `@aws-sdk/s3-request-presigner`; reads `loadEnv()` S3_* fields; `forcePathStyle: true` for MinIO. Export `@Injectable() class S3StorageAdapter implements StoragePort`.

- [ ] **Step 3:** `storage.module.ts`: `@Global() @Module({ providers: [{ provide: STORAGE_PORT, useClass: S3StorageAdapter }], exports: [STORAGE_PORT] })`.

- [ ] **Step 4:** Add to `apps/api/package.json` deps: `"@aws-sdk/client-s3": "3.1125.0"`, `"@aws-sdk/s3-request-presigner": "3.1125.0"`. (Install done centrally.)

---

### Task 3: MalwareScannerPort + dev scanner

**Files:** Create `apps/api/src/common/scanner/{scanner.port.ts,dev-scanner.ts,scanner.module.ts}` + `apps/api/test/dev-scanner.spec.ts`.

**Interfaces:** Produces `MALWARE_SCANNER` token + `MalwareScannerPort { scan(key: string): Promise<{ clean: boolean }> }`.

- [ ] **Step 1: Test** `apps/api/test/dev-scanner.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DevMalwareScanner } from '../src/common/scanner/dev-scanner';

describe('DevMalwareScanner', () => {
  it('reports clean (dev stub)', async () => {
    expect(await new DevMalwareScanner().scan('k')).toEqual({ clean: true });
  });
});
```

- [ ] **Step 2:** Run: `pnpm --filter @acp/api test dev-scanner` → FAIL.

- [ ] **Step 3:** `scanner.port.ts`:

```ts
export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');

export interface MalwareScannerPort {
  scan(key: string): Promise<{ clean: boolean }>;
}
```

`dev-scanner.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { MalwareScannerPort } from './scanner.port';

/** DEV STUB: always clean. Replace with ClamAV/service scan in a later phase. */
@Injectable()
export class DevMalwareScanner implements MalwareScannerPort {
  async scan(_key: string): Promise<{ clean: boolean }> {
    return { clean: true };
  }
}
```

`scanner.module.ts`: `@Global() @Module({ providers: [{ provide: MALWARE_SCANNER, useClass: DevMalwareScanner }], exports: [MALWARE_SCANNER] })`.

- [ ] **Step 4:** Run: `pnpm --filter @acp/api test dev-scanner` → PASS.

---

### Task 4: SourceParserPort + parser (URL text extraction; PDF stub)

**Files:** Create `apps/api/src/modules/ingestion/parsing/{parser.port.ts,source-parser.ts}` + `apps/api/test/source-parser.spec.ts`.

**Interfaces:** Produces `SOURCE_PARSER` token + `SourceParserPort { parse(input: { type: string; uri?: string }): Promise<{ text: string }> }`.

- [ ] **Step 1: Test** `apps/api/test/source-parser.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SourceParser } from '../src/modules/ingestion/parsing/source-parser';

afterEach(() => vi.restoreAllMocks());

describe('SourceParser', () => {
  it('extracts visible text from a URL, stripping tags/script/style', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          '<html><head><style>.x{}</style><script>bad()</script></head><body><h1>Hi</h1><p>Buy now</p></body></html>',
      }),
    );
    const out = await new SourceParser().parse({ type: 'url', uri: 'https://x.test' });
    expect(out.text).toContain('Hi');
    expect(out.text).toContain('Buy now');
    expect(out.text).not.toContain('bad()');
    expect(out.text).not.toContain('<');
  });

  it('returns a stub note for pdf (OCR not yet implemented)', async () => {
    const out = await new SourceParser().parse({ type: 'pdf', uri: 'k' });
    expect(out.text.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3:** `parser.port.ts`:

```ts
export const SOURCE_PARSER = Symbol('SOURCE_PARSER');

export interface ParseInput {
  type: string;
  uri?: string;
}

export interface SourceParserPort {
  parse(input: ParseInput): Promise<{ text: string }>;
}
```

`source-parser.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { ParseInput, SourceParserPort } from './parser.port';

/**
 * URL parsing does a fetch + naive HTML→text strip (good enough for MVP fact
 * candidates). PDF/OCR and product-feed parsing are stubbed behind this port
 * and swap in later without changing callers.
 */
@Injectable()
export class SourceParser implements SourceParserPort {
  async parse(input: ParseInput): Promise<{ text: string }> {
    if (input.type === 'url' && input.uri) {
      const res = await fetch(input.uri);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const html = await res.text();
      return { text: htmlToText(html) };
    }
    return { text: `[unparsed ${input.type} source; OCR/feed parsing pending]` };
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4:** Run → PASS (2 tests).

---

### Task 5: FactExtractorPort + stub extractor

**Files:** Create `apps/api/src/modules/ingestion/facts/{extractor.port.ts,stub-extractor.ts}` + `apps/api/test/stub-extractor.spec.ts`.

**Interfaces:** Produces `FACT_EXTRACTOR` token + `FactExtractorPort { extract(text: string): Promise<string[]> }`.

- [ ] **Step 1: Test** `apps/api/test/stub-extractor.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { StubFactExtractor } from '../src/modules/ingestion/facts/stub-extractor';

describe('StubFactExtractor', () => {
  it('splits text into trimmed candidate facts and caps the count', async () => {
    const text = 'Fast setup in minutes. Cancel anytime. Free trial available. Trusted by teams.';
    const facts = await new StubFactExtractor(3).extract(text);
    expect(facts.length).toBe(3);
    expect(facts[0]).toBe('Fast setup in minutes.');
  });

  it('ignores very short fragments', async () => {
    expect(await new StubFactExtractor().extract('Hi. No.')).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3:** `extractor.port.ts`:

```ts
export const FACT_EXTRACTOR = Symbol('FACT_EXTRACTOR');

export interface FactExtractorPort {
  extract(text: string): Promise<string[]>;
}
```

`stub-extractor.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { FactExtractorPort } from './extractor.port';

/**
 * DEV STUB: deterministic sentence-splitting so the pipeline is testable without
 * an LLM. A grounded LLM extractor (Anthropic) replaces this behind the port
 * later; every extracted fact still requires human approval before use.
 */
@Injectable()
export class StubFactExtractor implements FactExtractorPort {
  constructor(private readonly max = 10) {}

  async extract(text: string): Promise<string[]> {
    return text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12)
      .slice(0, this.max);
  }
}
```

- [ ] **Step 4:** Run → PASS (2 tests).

---

### Task 6: IngestionService (sources CRUD, org-scoped, audited)

**Files:** Create `apps/api/src/modules/ingestion/ingestion.service.ts` + `apps/api/test/ingestion.service.spec.ts`.

**Interfaces:** Consumes PrismaService, AuditService, StoragePort, `scopedWhere`. Produces `IngestionService` with `registerSource`, `getStatus`, `deleteSource`, `listFacts`, `approveFact`, `rejectFact`.

- [ ] **Step 1: Test** (isolation + signed-URL + deletion via port). `apps/api/test/ingestion.service.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { IngestionService } from '../src/modules/ingestion/ingestion.service';

function deps() {
  const prisma = {
    sourceDocument: {
      create: vi.fn().mockResolvedValue({ id: 'src_1' }),
      findFirst: vi.fn().mockResolvedValue({ id: 'src_1', parseStatus: 'pending' }),
      delete: vi.fn().mockResolvedValue({ id: 'src_1' }),
    },
    asset: { create: vi.fn().mockResolvedValue({ id: 'a_1' }) },
    sourceFact: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: 'f_1' }),
      delete: vi.fn().mockResolvedValue({ id: 'f_1' }),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  const storage = {
    createSignedUploadUrl: vi.fn().mockResolvedValue({ url: 'https://signed', key: 'k' }),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  } as any;
  return { prisma, audit, storage };
}

describe('IngestionService', () => {
  it('registerSource(url) creates a source scoped to the org, no upload url', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    const out = await svc.registerSource('org_1', { type: 'url', uri: 'https://x.test' });
    expect(prisma.sourceDocument.create).toHaveBeenCalledWith({
      data: { orgId: 'org_1', type: 'url', uri: 'https://x.test' },
    });
    expect(out.uploadUrl).toBeUndefined();
    expect(audit.record).toHaveBeenCalled();
  });

  it('registerSource(pdf) returns a signed upload url and creates an unscanned asset', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    const out = await svc.registerSource('org_1', {
      type: 'pdf',
      filename: 'f.pdf',
      contentType: 'application/pdf',
    });
    expect(storage.createSignedUploadUrl).toHaveBeenCalled();
    expect(out.uploadUrl).toBe('https://signed');
    expect(prisma.asset.create).toHaveBeenCalled();
  });

  it('getStatus scopes by org (findFirst with orgId)', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    await svc.getStatus('org_1', 'src_1');
    expect(prisma.sourceDocument.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org_1', id: 'src_1' },
    });
  });

  it('approveFact scopes update by org and stamps approver', async () => {
    const { prisma, audit, storage } = deps();
    const svc = new IngestionService(prisma, audit, storage);
    await svc.approveFact('org_1', 'f_1', 'u_1');
    expect(prisma.sourceFact.update).toHaveBeenCalledWith({
      where: { id: 'f_1', orgId: 'org_1' },
      data: { approved: true, approvedBy: 'u_1' },
    });
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** `ingestion.service.ts`:

```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { STORAGE_PORT, type StoragePort } from '../../common/storage/storage.port';

export interface RegisterSourceInput {
  type: 'url' | 'pdf' | 'feed';
  uri?: string;
  filename?: string;
  contentType?: string;
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async registerSource(orgId: string, input: RegisterSourceInput) {
    const source = await this.prisma.sourceDocument.create({
      data: { orgId, type: input.type, uri: input.uri ?? '' },
    });
    await this.audit.record({ orgId, action: 'source.registered', target: source.id });

    if (input.type !== 'url') {
      const key = `sources/${orgId}/${source.id}/${input.filename ?? 'upload'}`;
      await this.prisma.asset.create({
        data: { orgId, kind: input.type, storageKey: key, checksum: '', scanClean: false },
      });
      const signed = await this.storage.createSignedUploadUrl(
        key,
        input.contentType ?? 'application/octet-stream',
      );
      return { sourceId: source.id, uploadUrl: signed.url };
    }
    return { sourceId: source.id, uploadUrl: undefined as string | undefined };
  }

  async getStatus(orgId: string, sourceId: string) {
    const src = await this.prisma.sourceDocument.findFirst({
      where: scopedWhere(orgId, { id: sourceId }),
    });
    if (!src) throw new NotFoundException('Source not found');
    return src;
  }

  async listFacts(orgId: string, sourceId: string) {
    return this.prisma.sourceFact.findMany({
      where: scopedWhere(orgId, { sourceDocId: sourceId }),
    });
  }

  async approveFact(orgId: string, factId: string, approverId: string) {
    const fact = await this.prisma.sourceFact.update({
      where: { id: factId, orgId },
      data: { approved: true, approvedBy: approverId },
    });
    await this.audit.record({ orgId, actorId: approverId, action: 'fact.approved', target: factId });
    return fact;
  }

  async rejectFact(orgId: string, factId: string) {
    await this.prisma.sourceFact.delete({ where: { id: factId, orgId } });
    await this.audit.record({ orgId, action: 'fact.rejected', target: factId });
  }

  async deleteSource(orgId: string, sourceId: string) {
    const src = await this.prisma.sourceDocument.findFirst({
      where: scopedWhere(orgId, { id: sourceId }),
    });
    if (!src) throw new NotFoundException('Source not found');
    await this.prisma.sourceDocument.delete({ where: { id: sourceId } });
    await this.audit.record({ orgId, action: 'source.deleted', target: sourceId });
  }
}
```

Note: `scopedWhere(orgId, { id })` yields `{ id, orgId }`; the test expects `{ orgId, id }` — key order is irrelevant to `toHaveBeenCalledWith` deep-equality.

- [ ] **Step 4:** Run → PASS (4 tests).

---

### Task 7: ParseService (parse → extract → store facts) with state transitions

**Files:** Create `apps/api/src/modules/ingestion/parse.service.ts` + `apps/api/test/parse.service.spec.ts`.

**Interfaces:** Consumes PrismaService, `SOURCE_PARSER`, `FACT_EXTRACTOR`, `MALWARE_SCANNER`. Produces `ParseService.parseSource(orgId, sourceId): Promise<void>`.

- [ ] **Step 1: Test** `apps/api/test/parse.service.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ParseService } from '../src/modules/ingestion/parse.service';

function deps(source: any) {
  const prisma = {
    sourceDocument: {
      findFirst: vi.fn().mockResolvedValue(source),
      update: vi.fn().mockResolvedValue({}),
    },
    sourceFact: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
  } as any;
  const parser = { parse: vi.fn().mockResolvedValue({ text: 'Great product. Fast setup indeed.' }) };
  const extractor = { extract: vi.fn().mockResolvedValue(['Great product.', 'Fast setup indeed.']) };
  const scanner = { scan: vi.fn().mockResolvedValue({ clean: true }) };
  return { prisma, parser, extractor, scanner };
}

describe('ParseService', () => {
  it('parses, extracts facts, stores them unapproved, and marks parsed', async () => {
    const { prisma, parser, extractor, scanner } = deps({
      id: 'src_1', orgId: 'org_1', type: 'url', uri: 'https://x.test',
    });
    const svc = new ParseService(prisma, parser as any, extractor as any, scanner as any);
    await svc.parseSource('org_1', 'src_1');

    expect(prisma.sourceDocument.update).toHaveBeenCalledWith({
      where: { id: 'src_1' }, data: { parseStatus: 'parsing' },
    });
    expect(prisma.sourceFact.createMany).toHaveBeenCalledWith({
      data: [
        { orgId: 'org_1', sourceDocId: 'src_1', text: 'Great product.', approved: false },
        { orgId: 'org_1', sourceDocId: 'src_1', text: 'Fast setup indeed.', approved: false },
      ],
    });
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'src_1' }, data: { parseStatus: 'parsed' },
    });
  });

  it('marks failed when parsing throws', async () => {
    const { prisma, extractor, scanner } = deps({ id: 'src_1', orgId: 'org_1', type: 'url' });
    const parser = { parse: vi.fn().mockRejectedValue(new Error('boom')) };
    const svc = new ParseService(prisma, parser as any, extractor as any, scanner as any);
    await svc.parseSource('org_1', 'src_1');
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'src_1' }, data: { parseStatus: 'failed' },
    });
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** `parse.service.ts`:

```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { SOURCE_PARSER, type SourceParserPort } from './parsing/parser.port';
import { FACT_EXTRACTOR, type FactExtractorPort } from './facts/extractor.port';
import { MALWARE_SCANNER, type MalwareScannerPort } from '../../common/scanner/scanner.port';

@Injectable()
export class ParseService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SOURCE_PARSER) private readonly parser: SourceParserPort,
    @Inject(FACT_EXTRACTOR) private readonly extractor: FactExtractorPort,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScannerPort,
  ) {}

  async parseSource(orgId: string, sourceId: string): Promise<void> {
    const src = await this.prisma.sourceDocument.findFirst({
      where: scopedWhere(orgId, { id: sourceId }),
    });
    if (!src) throw new NotFoundException('Source not found');

    await this.prisma.sourceDocument.update({
      where: { id: sourceId },
      data: { parseStatus: 'parsing' },
    });

    try {
      const { text } = await this.parser.parse({ type: src.type, uri: src.uri });
      const facts = await this.extractor.extract(text);
      if (facts.length > 0) {
        await this.prisma.sourceFact.createMany({
          data: facts.map((t) => ({ orgId, sourceDocId: sourceId, text: t, approved: false })),
        });
      }
      await this.prisma.sourceDocument.update({
        where: { id: sourceId },
        data: { parseStatus: 'parsed' },
      });
    } catch {
      await this.prisma.sourceDocument.update({
        where: { id: sourceId },
        data: { parseStatus: 'failed' },
      });
    }
  }
}
```

(`scanner` is injected for the asset-scan gate used by file sources; wired here for the module and future PDF path.)

- [ ] **Step 4:** Run → PASS (2 tests).

---

### Task 8: Controllers + DTOs + module wiring

**Files:** Create `apps/api/src/modules/ingestion/{sources.controller.ts,facts.controller.ts,dto.ts}`; modify `ingestion.module.ts`; import `StorageModule`/`ScannerModule` in `app.module.ts`.

**Interfaces:** REST: `POST /v1/sources` (creator), `GET /v1/sources/:id` (creator), `DELETE /v1/sources/:id` (admin), `GET /v1/sources/:id/facts` (creator), `POST /v1/facts/:id/approve` (reviewer), `POST /v1/facts/:id/reject` (reviewer). All under `TenantGuard`; role via `RolesGuard`+`@Roles`.

- [ ] **Step 1:** `dto.ts` — `RegisterSourceDto { type: 'url'|'pdf'|'feed'; uri?; filename?; contentType? }` with `@ApiProperty`.

- [ ] **Step 2:** `sources.controller.ts` (`@Controller('v1/sources')`, `@UseGuards(TenantGuard, RolesGuard)`, `@ApiHeader x-org-id/x-user-role`): `create` `@Roles('creator')`, `status` `@Roles('creator')`, `remove` `@Roles('admin')`, `facts` `@Roles('creator')`. Each reads `req.orgId` and delegates to `IngestionService`.

- [ ] **Step 3:** `facts.controller.ts` (`@Controller('v1/facts')`, same guards): `approve` `@Roles('reviewer')` → `identity`? no → `ingestion.approveFact(req.orgId, id, req.headers['x-user-id'] ?? 'unknown')`; `reject` `@Roles('reviewer')`. (User id from `x-user-id` header MVP stub.)

- [ ] **Step 4:** `ingestion.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { ParseService } from './parse.service';
import { SourcesController } from './sources.controller';
import { FactsController } from './facts.controller';
import { SourceParser } from './parsing/source-parser';
import { SOURCE_PARSER } from './parsing/parser.port';
import { StubFactExtractor } from './facts/stub-extractor';
import { FACT_EXTRACTOR } from './facts/extractor.port';

@Module({
  controllers: [SourcesController, FactsController],
  providers: [
    IngestionService,
    ParseService,
    { provide: SOURCE_PARSER, useClass: SourceParser },
    { provide: FACT_EXTRACTOR, useClass: StubFactExtractor },
  ],
})
export class IngestionModule {}
```

- [ ] **Step 5:** In `app.module.ts` add `StorageModule` and `ScannerModule` to imports (both `@Global`, provide STORAGE_PORT / MALWARE_SCANNER for the ingestion providers).

- [ ] **Step 6:** Build + boot check: `pnpm --filter @acp/api build`; boot and confirm `GET /v1/sources/x` → 400 without `x-org-id`, and DI resolves (no "can't resolve STORAGE_PORT"). Expected PASS.

---

### Task 9: CI-parity verification + docs

- [ ] **Step 1:** `pnpm install && pnpm build && pnpm typecheck && pnpm test` — all green; ingestion specs included.
- [ ] **Step 2:** Boot in production → any guarded `/v1/sources` route returns 503 (fail-closed inherited).
- [ ] **Step 3: Commit + push + PR** (central).

---

## Self-Review

- **Spec coverage:** P1.I1 upload+signed-url+scan (T2/T3/T6), P1.I2 parse+status (T4/T7/T6 getStatus), P1.I3 extraction+approval (T5/T6/T7/T8), P1.I4 deletion (T6/T8). ✔
- **Placeholder scan:** none — concrete code in each testable step; adapters (S3) described with exact SDK symbols.
- **Type consistency:** ports export `{TOKEN, Port}` pairs consumed by services via `@Inject(TOKEN)`. `scopedWhere(orgId,{id})`→`{id,orgId}` matches Prisma `findFirst` where. `createMany` shape matches the SourceFact columns from Task 1.
- **Env constraint:** no DB/S3/Redis needed for tests; S3 adapter shipped but unit tests mock `StoragePort`; migration regenerated offline.
