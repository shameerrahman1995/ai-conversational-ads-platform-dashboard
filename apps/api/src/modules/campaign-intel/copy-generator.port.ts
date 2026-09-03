export const COPY_GENERATOR = Symbol('COPY_GENERATOR');

export interface CampaignCopy {
  headline: string;
  offer: string;
  cta: string;
  proofPoints: string[];
}

export type CopyField = 'headline' | 'offer' | 'cta';

export interface CopyGeneratorPort {
  generate(facts: string[]): CampaignCopy;
}
