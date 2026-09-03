export const SOURCE_PARSER = Symbol('SOURCE_PARSER');

export interface ParseInput {
  type: string;
  uri?: string;
}

export interface SourceParserPort {
  parse(input: ParseInput): Promise<{ text: string }>;
}
