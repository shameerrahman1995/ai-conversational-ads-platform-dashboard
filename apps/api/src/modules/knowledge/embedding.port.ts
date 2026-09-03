export const EMBEDDING = Symbol('EMBEDDING');

export interface EmbeddingPort {
  readonly dim: number;
  embed(text: string): Promise<number[]>;
}
