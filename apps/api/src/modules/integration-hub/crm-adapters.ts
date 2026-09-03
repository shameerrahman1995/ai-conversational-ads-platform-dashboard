import { Injectable } from '@nestjs/common';
import type { CrmAdapter, DeliveryResult, FieldMapping, CanonicalLead } from '@acp/crm';
import type { CrmProvider } from '@acp/shared-types';

/**
 * CRM adapters (blueprint §15). MVP ships deterministic stubs behind the
 * @acp/crm CrmAdapter contract so the delivery pipeline (outbox, idempotency,
 * mapping validation, retry) is testable; real HubSpot/Zoho/webhook I/O swaps in
 * behind this contract without changing DeliveryService.
 */
abstract class BaseStubAdapter implements CrmAdapter {
  abstract readonly provider: CrmProvider;

  async validateMapping(input: {
    secretRef: string;
    mappings: FieldMapping[];
  }): Promise<{ ok: boolean; issues: string[] }> {
    const issues = input.mappings
      .filter((m) => !m.from || !m.to)
      .map((m) => `mapping ${m.from || '?'} -> ${m.to || '?'} is incomplete`);
    return { ok: issues.length === 0, issues };
  }

  async upsertLead(input: {
    secretRef: string;
    lead: CanonicalLead;
    mappings: FieldMapping[];
    idempotencyKey: string;
  }): Promise<DeliveryResult> {
    return { ok: true, remoteId: `${this.provider}_${input.idempotencyKey}` };
  }

  async fetchStageChanges(): Promise<
    Array<{ remoteId: string; stage: string; revenue?: number; at: string }>
  > {
    return [];
  }
}

@Injectable()
export class WebhookCrmAdapter extends BaseStubAdapter {
  readonly provider: CrmProvider = 'webhook';
}

@Injectable()
export class HubspotCrmAdapter extends BaseStubAdapter {
  readonly provider: CrmProvider = 'hubspot';
}

@Injectable()
export class ZohoCrmAdapter extends BaseStubAdapter {
  readonly provider: CrmProvider = 'zoho';
}
