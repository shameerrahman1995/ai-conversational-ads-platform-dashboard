export const FACT_EXTRACTOR = Symbol('FACT_EXTRACTOR');

export interface FactExtractorPort {
  extract(text: string): Promise<string[]>;
}
