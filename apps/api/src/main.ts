import 'reflect-metadata';
// MUST be the first import after reflect-metadata: loads apps/api/.env into
// process.env before any module that reads config is imported (some call
// loadEnv() at import time).
import './bootstrap-env';

import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadEnv, createLogger } from '@acp/config';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({ name: 'api' });

  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Security headers.
  app.use(helmet());

  // Public-edge CORS (blueprint §4/§5). The in-ad creative's served app.js runs on
  // ARBITRARY publisher domains and calls the public edge (`/v1/ad-sessions*` and
  // `/v1/creatives/:id/bootstrap`) cross-origin. The dashboard's allowlist CORS
  // (below) would reject every one of those origins in production, so no session
  // could ever start. These edge routes are credential-less (the app.js fetches
  // with credentials:'omit') and carry only a signed creative token in the
  // Authorization header — never cookies — so reflecting the request Origin
  // WITHOUT Access-Control-Allow-Credentials is safe: it exposes no ambient
  // credentials and cannot be paired with `origin:'*' + credentials`. This narrow
  // middleware is scoped ONLY to those path prefixes and runs BEFORE enableCors so
  // the preflight (OPTIONS) is answered here, before the CreativeTokenGuard would
  // otherwise 401 a header-less preflight. Everything else falls through to the
  // dashboard allowlist unchanged.
  const EDGE_CORS_PREFIXES = ['/v1/ad-sessions', '/v1/creatives'];
  app.use(
    (
      req: {
        method?: string;
        url?: string;
        originalUrl?: string;
        headers: Record<string, string | string[] | undefined>;
      },
      res: { setHeader(name: string, value: string): void; statusCode: number; end(): void },
      next: () => void,
    ): void => {
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
      const isEdge = EDGE_CORS_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
      if (isEdge) {
        const origin = req.headers.origin;
        if (typeof origin === 'string' && origin.length > 0) {
          res.setHeader('Access-Control-Allow-Origin', origin); // reflect, no wildcard
          res.setHeader('Vary', 'Origin'); // cache-correctness for the reflected value
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
          res.setHeader('Access-Control-Max-Age', '600');
          // Deliberately NO Access-Control-Allow-Credentials — these routes need none.
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }
        }
      }
      next();
    },
  );

  // CORS: explicit allowlist in production; reflect origin in dev. (Dashboard API
  // only — the credential-less public-edge middleware above already handled the
  // ad-session/bootstrap routes and left everything else for this allowlist.)
  const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: env.NODE_ENV === 'production' ? origins : true,
    credentials: true,
  });

  // Validate + coerce request bodies against DTOs; strip unknown properties.
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Stable error shape + unhandled-error logging.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Drain in-flight work + close Prisma/Redis on SIGTERM (rolling deploys).
  app.enableShutdownHooks();

  // Swagger is opt-in and never in production.
  if (env.ENABLE_DOCS && env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ConvoAds AI API')
      .setVersion('0.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = env.API_PORT ?? 4000;
  await app.listen(port);
  logger.info(`API listening on http://localhost:${port}`, {
    docs: env.ENABLE_DOCS && env.NODE_ENV !== 'production' ? `/docs` : 'disabled',
    env: env.NODE_ENV,
  });
}

// Fail loudly on truly unexpected errors rather than dying silently.
process.on('unhandledRejection', (reason) => {
  createLogger({ name: 'api' }).error('unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

void bootstrap();
