import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadEnv, createLogger } from '@acp/config';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({ name: 'api' });

  const app = await NestFactory.create(AppModule);

  app.enableCors();
  // Validate + coerce request bodies against DTOs; strip unknown properties.
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConvoAds AI API')
    .setVersion('0.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = env.API_PORT ?? 4000;
  await app.listen(port);

  logger.info(
    `API listening on http://localhost:${port} (docs at http://localhost:${port}/docs)`,
  );
}

void bootstrap();
