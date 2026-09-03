import { BadRequestException, Injectable } from '@nestjs/common';
import type { CrmAdapter } from '@acp/crm';
import { HubspotCrmAdapter, WebhookCrmAdapter, ZohoCrmAdapter } from './crm-adapters';

@Injectable()
export class CrmRegistry {
  private readonly adapters = new Map<string, CrmAdapter>();

  constructor(webhook: WebhookCrmAdapter, hubspot: HubspotCrmAdapter, zoho: ZohoCrmAdapter) {
    for (const a of [webhook, hubspot, zoho]) this.adapters.set(a.provider, a);
  }

  get(provider: string): CrmAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new BadRequestException(`Unknown CRM provider: ${provider}`);
    return adapter;
  }
}
