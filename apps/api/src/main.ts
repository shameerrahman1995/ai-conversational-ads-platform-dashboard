import 'reflect-metadata';

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

  // CORS: explicit allowlist in production; reflect origin in dev.
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
