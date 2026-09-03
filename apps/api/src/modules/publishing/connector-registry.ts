import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdConnector } from '@acp/connectors';
import { GenericExportConnector, GoogleAdsConnector, MetaConnector } from './connectors/adapters';

@Injectable()
export class ConnectorRegistry {
  private readonly connectors = new Map<string, AdConnector>();

  constructor(google: GoogleAdsConnector, meta: MetaConnector, generic: GenericExportConnector) {
    for (const c of [google, meta, generic]) this.connectors.set(c.platform, c);
  }

  get(platform: string): AdConnector {
    const connector = this.connectors.get(platform);
    if (!connector) throw new BadRequestException(`Unsupported ad platform: ${platform}`);
    return connector;
  }
}
