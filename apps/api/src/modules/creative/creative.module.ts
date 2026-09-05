import { Module } from '@nestjs/common';
import { CreativeService } from './creative.service';
import { Html5CompilerService } from './html5-compiler.service';
import { CreativeController } from './creative.controller';
import { RENDERER } from './render.port';
import { StubRenderer } from './stub-renderer';
import { IMAGE_GENERATOR } from './image-gen.port';
import { StubImageGenerator } from './stub-image-generator';

// Creative rendering (blueprint §10/§14): multi-format render + HTML5/playable
// compiler + AI image generation.
@Module({
  controllers: [CreativeController],
  providers: [
    CreativeService,
    Html5CompilerService,
    { provide: RENDERER, useClass: StubRenderer },
    { provide: IMAGE_GENERATOR, useClass: StubImageGenerator },
  ],
})
export class CreativeModule {}
