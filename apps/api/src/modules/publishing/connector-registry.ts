import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdConnector } from '@acp/connectors';
import {
  AmazonDspConnector,
  GenericExportConnector,
  GoogleAdsConnector,
  LinkedInConnector,
  MetaConnector,
  MicrosoftConnector,
  TikTokConnector,
} from './connectors/adapters';

@Injectable()
export class ConnectorRegistry {
  private readonly connectors = new Map<string, AdConnector>();

  constructor(
    google: GoogleAdsConnector,
    meta: MetaConnector,
    generic: GenericExportConnector,
    tiktok: TikTokConnector,
    microsoft: MicrosoftConnector,
    amazon: AmazonDspConnector,
    linkedin: LinkedInConnector,
  ) {
    for (const c of [google, meta, generic, tiktok, microsoft, amazon, linkedin]) {
      this.connectors.set(c.platform, c);
    }
  }

  get(platform: string): AdConnector {
    const connector = this.connectors.get(platform);
    if (!connector) throw new BadRequestException(`Unsupported ad platform: ${platform}`);
    return connector;
  }
}
