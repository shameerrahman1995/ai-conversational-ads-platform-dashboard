import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';

/**
 * Boot-level integration harness.
 *
 * Wires the *real* AppModule through Nest's testing module and boots a full
 * HTTP application with the same global ValidationPipe as production
 * (src/main.ts). External services (Postgres/Redis/S3) connect lazily, so the
 * app boots without them — we only need dummy connection strings so the env
 * schema (@acp/config) validates. We assert the process comes up and the
 * liveness probe answers, without touching authed routes (auth is being
 * rebuilt in parallel).
 */
describe('App bootstrap (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Satisfy the env schema; these are never actually dialed during the test.
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/convoads_test';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror the production global pipe from src/main.ts.
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('boots the full AppModule and exposes an HTTP server', () => {
    expect(app).toBeDefined();
    expect(app.getHttpServer()).toBeDefined();
  });

  it('GET /health returns 200 with an ok payload', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'api' });
    expect(typeof res.body.time).toBe('string');
  });
});
