import { Injectable } from '@nestjs/common';
import type { RenderPort } from './render.port';
import type { RenderOutput } from './format-spec';

/**
 * DEV STUB renderer: emits the standard compliant output set (1:1 / 4:5 / 9:16
 * images, a video storyboard, and a Google display HTML5 bundle) with correct
 * dimensions and within size limits, so the render + validation pipeline is
 * testable without an image/video pipeline. A real renderer swaps in behind
 * RenderPort later.
 */
@Injectable()
export class StubRenderer implements RenderPort {
  render(_spec: unknown): RenderOutput[] {
    return [
      { format: 'image_1_1', width: 1080, height: 1080, bytes: 120_000, storageKey: 'render/1_1.png' },
      { format: 'image_4_5', width: 1080, height: 1350, bytes: 140_000, storageKey: 'render/4_5.png' },
      { format: 'image_9_16', width: 1080, height: 1920, bytes: 160_000, storageKey: 'render/9_16.png' },
      { format: 'video', bytes: 2_000_000, storageKey: 'render/storyboard.mp4' },
      { format: 'html5', bytes: 550_000, storageKey: 'render/google_display.zip' },
    ];
  }
}
