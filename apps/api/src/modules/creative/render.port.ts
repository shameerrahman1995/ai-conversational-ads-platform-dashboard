import type { RenderOutput } from './format-spec';

export const RENDERER = Symbol('RENDERER');

export interface RenderPort {
  /** Produce the standard multi-format output set for a creative spec. */
  render(spec: unknown): RenderOutput[];
}
