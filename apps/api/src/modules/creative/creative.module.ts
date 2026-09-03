import { Module } from '@nestjs/common';
import { CreativeService } from './creative.service';
import { CreativeController } from './creative.controller';
import { RENDERER } from './render.port';
import { StubRenderer } from './stub-renderer';

// Creative rendering (blueprint §10): templates, multi-format render, validation manifest.
@Module({
  controllers: [CreativeController],
  providers: [CreativeService, { provide: RENDERER, useClass: StubRenderer }],
})
export class CreativeModule {}
