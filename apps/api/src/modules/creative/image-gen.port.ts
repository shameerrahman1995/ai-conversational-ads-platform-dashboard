/**
 * Provider-neutral image generation (blueprint §10 AI plane). The creative
 * service never binds an image-model SDK directly — a DALL·E / Stable Diffusion
 * adapter implements this port; the stub renders a deterministic on-brand poster
 * so the flow works without a provider or credentials.
 */
export const IMAGE_GENERATOR = Symbol('IMAGE_GENERATOR');

export interface ImagePalette {
  bg: string;
  accent: string;
  text: string;
}

export interface ImageGenOptions {
  width: number;
  height: number;
  palette?: ImagePalette;
  subhead?: string;
}

export interface ImageGenResult {
  /** A directly-usable image URL (a data: URI from the stub; an https URL from a real provider). */
  url: string;
  provider: string;
}

export interface ImageGeneratorPort {
  generate(prompt: string, opts: ImageGenOptions): Promise<ImageGenResult>;
}
