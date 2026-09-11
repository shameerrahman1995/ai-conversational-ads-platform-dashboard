import { BadRequestException, Logger } from '@nestjs/common';
import { loadEnv } from '@acp/config';

/**
 * Live Google Ads REST client (API v25). This is the productized form of the
 * validated end-to-end smoke test: OAuth refresh-token exchange, account
 * listing, HTML5 media-bundle upload, display campaign/ad-group/ad create,
 * ad-level status + policy/review read, and metrics — all against
 * `https://googleads.googleapis.com`.
 *
 * The publishing unit is a **DISPLAY upload (HTML5) ad** (blueprint §6): a
 * MEDIA_BUNDLE asset (the compiled creative ZIP) referenced by a
 * DisplayUploadAd inside a DISPLAY campaign → ad group. Draft creates the ad
 * PAUSED; publish enables it; pause/resume/review all act on the ad.
 *
 * Credentials come from the environment (blueprint §12/§17: provider tokens are
 * server-side only and never reach the browser). The client is single-tenant for
 * now: one OAuth client + refresh token + manager (login-customer-id). Per-org
 * OAuth is a later enhancement layered on the same call surface.
 */

export interface GoogleAdsConfig {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  refreshToken: string;
  /** Manager (MCC) id, digits only — sent as login-customer-id. */
  loginCustomerId: string;
  /** Default operating customer id (digits only) when a plan carries none. */
  defaultCustomerId?: string;
  apiVersion: string;
}

export interface GoogleAccount {
  customerId: string;
  name: string;
  currencyCode?: string;
  isManager: boolean;
}

export interface CreatedCampaign {
  customerId: string;
  campaignId: string;
  budgetResourceName: string;
  campaignResourceName: string;
}

export interface CreatedAdGroup {
  adGroupId: string;
  adGroupResourceName: string;
}

export interface CreatedDisplayAd {
  /** `customers/{cid}/adGroupAds/{adGroupId}~{adId}` */
  adGroupAdResourceName: string;
  adId: string;
}

/** Ad-level review signal, mapped from the ad_group_ad policy summary. */
export interface AdReviewSignal {
  status: string | null;
  reviewStatus: string | null;
  approvalStatus: string | null;
}

/** Digits-only customer id: strips dashes/whitespace from "735-179-4807". */
export function normalizeCustomerId(id: string | undefined | null): string {
  return (id ?? '').replace(/[^0-9]/g, '');
}

/**
 * Strictly reject any id that is not digits-only before it reaches a GAQL query
 * or resource name. GAQL has no parameter binding, so every interpolated value
 * MUST be validated here to prevent query injection (ids are always numeric).
 */
export function assertNumericId(value: string | undefined | null, label = 'id'): string {
  const v = String(value ?? '');
  if (!/^\d+$/.test(v)) throw new Error(`Google Ads: invalid ${label} "${v}"`);
  return v;
}

/** GAQL date literals must be strict YYYY-MM-DD (no injection surface). */
function assertGaqlDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(
      `Google Ads: invalid ${label} date "${value}" (expected YYYY-MM-DD)`,
    );
  }
  return value;
}

/**
 * Read + validate Google Ads config from the environment. Returns null unless
 * PROVIDERS_MODE=live AND every required credential is present — so the connector
 * transparently falls back to the deterministic stub in dev/test.
 */
export function readGoogleAdsConfig(): GoogleAdsConfig | null {
  const env = loadEnv();
  if (env.PROVIDERS_MODE !== 'live') return null;
  const clientId = env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const refreshToken = env.GOOGLE_ADS_REFRESH_TOKEN;
  const loginCustomerId = normalizeCustomerId(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  if (!clientId || !clientSecret || !developerToken || !refreshToken || !loginCustomerId) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    developerToken,
    refreshToken,
    loginCustomerId,
    defaultCustomerId: normalizeCustomerId(env.GOOGLE_ADS_CUSTOMER_ID) || undefined,
    apiVersion: env.GOOGLE_ADS_API_VERSION,
  };
}

export class GoogleAdsLiveClient {
  private readonly logger = new Logger('GoogleAdsLiveClient');
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(private readonly config: GoogleAdsConfig) {}

  private get base(): string {
    return `https://googleads.googleapis.com/${this.config.apiVersion}`;
  }

  /** Exchange the refresh token for an access token, cached until ~1 min before expiry. */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.accessTokenExpiresAt) return this.accessToken;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      throw new Error(
        `Google Ads token refresh failed (${res.status}): ${json.error ?? ''} ${json.error_description ?? ''}`.trim(),
      );
    }
    this.accessToken = json.access_token;
    this.accessTokenExpiresAt = now + (json.expires_in ?? 3600) * 1000 - 60_000;
    return this.accessToken;
  }

  private async headers(): Promise<Record<string, string>> {
    return {
      authorization: `Bearer ${await this.getAccessToken()}`,
      'developer-token': this.config.developerToken,
      'login-customer-id': this.config.loginCustomerId,
      'content-type': 'application/json',
    };
  }

  /** Low-level request with uniform error surfacing (never fakes success). */
  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { ...(await this.headers()), ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    if (!res.ok) {
      const detail =
        (json as { error?: { message?: string } } | undefined)?.error?.message ??
        (typeof json === 'string' ? json : JSON.stringify(json))?.slice(0, 500);
      throw new Error(`Google Ads API ${res.status} on ${path}: ${detail}`);
    }
    return json as T;
  }

  private search<T = unknown>(customerId: string, query: string): Promise<{ results?: T[] }> {
    return this.call(`/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  /** Verify credentials by listing the accounts the token can reach. */
  async listAccessibleCustomerIds(): Promise<string[]> {
    const json = await this.call<{ resourceNames?: string[] }>(
      '/customers:listAccessibleCustomers',
    );
    return (json.resourceNames ?? []).map((rn) => rn.replace('customers/', ''));
  }

  /** Accessible accounts enriched (best-effort) with name/currency. */
  async listAccounts(): Promise<GoogleAccount[]> {
    const ids = await this.listAccessibleCustomerIds();
    const accounts: GoogleAccount[] = [];
    for (const customerId of ids) {
      try {
        const res = await this.search<{
          customer?: {
            id?: string;
            descriptiveName?: string;
            currencyCode?: string;
            manager?: boolean;
          };
        }>(
          customerId,
          'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1',
        );
        const c = res.results?.[0]?.customer;
        accounts.push({
          customerId,
          name: c?.descriptiveName || `Customer ${customerId}`,
          currencyCode: c?.currencyCode,
          isManager: Boolean(c?.manager),
        });
      } catch {
        // A customer we can enumerate but not query (e.g. a peer manager) still
        // counts as a reachable account; surface it with a fallback name.
        accounts.push({ customerId, name: `Customer ${customerId}`, isManager: false });
      }
    }
    return accounts;
  }

  /**
   * Upload the compiled HTML5 creative ZIP as a MEDIA_BUNDLE asset (call #1).
   * `zipBase64` is the base64-encoded ZIP bytes. Returns the asset resourceName
   * (`customers/{cid}/assets/{assetId}`) referenced by the display upload ad.
   * REST field names confirmed against the display-upload-ads docs:
   * `type:"MEDIA_BUNDLE"` + `mediaBundleAsset.data` (base64 ZIP).
   */
  async uploadMediaBundleAsset(input: {
    customerId: string;
    zipBase64: string;
    name?: string;
  }): Promise<string> {
    const customerId = normalizeCustomerId(input.customerId);
    if (!input.zipBase64) throw new Error('Google Ads: media bundle upload requires ZIP bytes');
    const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const name = `${input.name ?? 'ConvoAds HTML5 bundle'} ${uniqueSuffix}`.slice(0, 120);
    const res = await this.call<{ results?: Array<{ resourceName: string }> }>(
      `/customers/${customerId}/assets:mutate`,
      {
        method: 'POST',
        body: JSON.stringify({
          operations: [
            { create: { name, type: 'MEDIA_BUNDLE', mediaBundleAsset: { data: input.zipBase64 } } },
          ],
        }),
      },
    );
    const assetResourceName = res.results?.[0]?.resourceName;
    if (!assetResourceName) throw new Error('Google Ads: media bundle asset create returned no resourceName');
    return assetResourceName;
  }

  /**
   * Create a fresh budget + a PAUSED DISPLAY campaign to contain the upload ad
   * (call #2, campaign half). Named `ensure*` for the create-if-needed contract;
   * it currently creates a new container per draft (safe + injection-free — a
   * reuse-by-label lookup would interpolate free-text names into GAQL, so it is
   * deferred: TODO reuse an existing display campaign by a numeric label id).
   */
  async ensureDisplayCampaign(input: {
    customerId: string;
    name: string;
    dailyBudgetMicros?: string;
  }): Promise<CreatedCampaign> {
    const customerId = normalizeCustomerId(input.customerId);
    // Google requires campaign/budget names to be unique among enabled/paused
    // campaigns, so append a compact unique token (ms + random) to the base name.
    const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const campaignName = `${input.name} · ${uniqueSuffix}`.slice(0, 128);
    const budgetRes = await this.call<{ results?: Array<{ resourceName: string }> }>(
      `/customers/${customerId}/campaignBudgets:mutate`,
      {
        method: 'POST',
        body: JSON.stringify({
          operations: [
            {
              create: {
                name: `${input.name} budget ${uniqueSuffix}`.slice(0, 128),
                amountMicros: input.dailyBudgetMicros ?? '1000000',
                deliveryMethod: 'STANDARD',
              },
            },
          ],
        }),
      },
    );
    const budgetResourceName = budgetRes.results?.[0]?.resourceName;
    if (!budgetResourceName) throw new Error('Google Ads: budget create returned no resourceName');

    const campaignRes = await this.call<{ results?: Array<{ resourceName: string }> }>(
      `/customers/${customerId}/campaigns:mutate`,
      {
        method: 'POST',
        body: JSON.stringify({
          operations: [
            {
              create: {
                name: campaignName,
                status: 'PAUSED',
                advertisingChannelType: 'DISPLAY',
                manualCpc: {},
                // Required by v25: declare EU political-advertising status.
                containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
                campaignBudget: budgetResourceName,
              },
            },
          ],
        }),
      },
    );
    const campaignResourceName = campaignRes.results?.[0]?.resourceName;
    if (!campaignResourceName) throw new Error('Google Ads: campaign create returned no resourceName');
    const campaignId = campaignResourceName.split('/').pop() as string;
    return { customerId, campaignId, budgetResourceName, campaignResourceName };
  }

  /**
   * Create an ENABLED DISPLAY_STANDARD ad group in the given campaign (call #2,
   * ad-group half). Named `ensure*` for parity with ensureDisplayCampaign; it
   * currently creates a fresh ad group per draft (see the TODO above).
   */
  async ensureDisplayAdGroup(input: {
    customerId: string;
    campaignResourceName: string;
    name: string;
  }): Promise<CreatedAdGroup> {
    const customerId = normalizeCustomerId(input.customerId);
    const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const res = await this.call<{ results?: Array<{ resourceName: string }> }>(
      `/customers/${customerId}/adGroups:mutate`,
      {
        method: 'POST',
        body: JSON.stringify({
          operations: [
            {
              create: {
                name: `${input.name} ad group ${uniqueSuffix}`.slice(0, 128),
                campaign: input.campaignResourceName,
                status: 'ENABLED',
                type: 'DISPLAY_STANDARD',
              },
            },
          ],
        }),
      },
    );
    const adGroupResourceName = res.results?.[0]?.resourceName;
    if (!adGroupResourceName) throw new Error('Google Ads: ad group create returned no resourceName');
    const adGroupId = adGroupResourceName.split('/').pop() as string;
    return { adGroupId, adGroupResourceName };
  }

  /**
   * Create a PAUSED HTML5 display upload ad in the ad group (call #3).
   * REST field names confirmed against the display-upload-ads docs:
   * `displayUploadAd.displayUploadProductType:"HTML5_UPLOAD_AD"` +
   * `displayUploadAd.mediaBundle.asset` referencing the MEDIA_BUNDLE asset RN.
   * The returned adGroupAd RN is `.../adGroupAds/{adGroupId}~{adId}`.
   */
  async createDisplayUploadAd(input: {
    customerId: string;
    adGroupResourceName: string;
    assetResourceName: string;
    finalUrl: string;
    name: string;
  }): Promise<CreatedDisplayAd> {
    const customerId = normalizeCustomerId(input.customerId);
    const res = await this.call<{ results?: Array<{ resourceName: string }> }>(
      `/customers/${customerId}/adGroupAds:mutate`,
      {
        method: 'POST',
        body: JSON.stringify({
          operations: [
            {
              create: {
                status: 'PAUSED',
                adGroup: input.adGroupResourceName,
                ad: {
                  name: input.name.slice(0, 255),
                  finalUrls: [input.finalUrl],
                  displayUploadAd: {
                    displayUploadProductType: 'HTML5_UPLOAD_AD',
                    mediaBundle: { asset: input.assetResourceName },
                  },
                },
              },
            },
          ],
        }),
      },
    );
    const adGroupAdResourceName = res.results?.[0]?.resourceName;
    if (!adGroupAdResourceName) throw new Error('Google Ads: display upload ad create returned no resourceName');
    // adGroupAd RN tail is `{adGroupId}~{adId}`.
    const adId = adGroupAdResourceName.split('~').pop() ?? '';
    return { adGroupAdResourceName, adId };
  }

  /**
   * Set an ad's status (ENABLED | PAUSED | REMOVED) via adGroupAds:mutate (call
   * #4). `adGroupAdResourceName` is the packed `.../adGroupAds/{adGroupId}~{adId}`.
   */
  async setAdGroupAdStatus(
    customerId: string,
    adGroupAdResourceName: string,
    status: 'ENABLED' | 'PAUSED' | 'REMOVED',
  ): Promise<void> {
    const cid = normalizeCustomerId(customerId);
    await this.call(`/customers/${cid}/adGroupAds:mutate`, {
      method: 'POST',
      body: JSON.stringify({
        operations: [
          {
            update: { resourceName: adGroupAdResourceName, status },
            updateMask: 'status',
          },
        ],
      }),
    });
  }

  /**
   * Read an ad's status + policy summary (call #5) to derive review state. The
   * adId is validated numeric before interpolation (GAQL has no param binding).
   */
  async getAdReviewStatus(customerId: string, adId: string): Promise<AdReviewSignal | null> {
    const cid = normalizeCustomerId(customerId);
    const id = assertNumericId(adId, 'adId');
    const res = await this.search<{
      adGroupAd?: {
        status?: string;
        policySummary?: { reviewStatus?: string; approvalStatus?: string };
      };
    }>(
      cid,
      `SELECT ad_group_ad.status, ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.approval_status ` +
        `FROM ad_group_ad WHERE ad_group_ad.ad.id = ${id} LIMIT 1`,
    );
    const row = res.results?.[0]?.adGroupAd;
    if (!row) return null;
    return {
      status: row.status ?? null,
      reviewStatus: row.policySummary?.reviewStatus ?? null,
      approvalStatus: row.policySummary?.approvalStatus ?? null,
    };
  }

  /**
   * Best-effort display-eligibility probe: reads the operating customer's
   * manager flag + status. A manager (MCC) account genuinely cannot host ads —
   * a clear negative signal. There is NO reliable API signal for HTML5-upload
   * allowlisting itself (a per-account allowlist granted by Google), so the
   * connector treats a non-manager account as best-effort eligible.
   */
  async probeDisplayEligibility(
    customerId: string,
  ): Promise<{ isManager: boolean; status: string | null }> {
    const cid = normalizeCustomerId(customerId);
    const res = await this.search<{ customer?: { manager?: boolean; status?: string } }>(
      cid,
      'SELECT customer.id, customer.manager, customer.status FROM customer LIMIT 1',
    );
    const c = res.results?.[0]?.customer;
    return { isManager: Boolean(c?.manager), status: c?.status ?? null };
  }

  /** Daily metrics rows for a customer over [since, until] (YYYY-MM-DD). */
  async fetchMetrics(
    customerId: string,
    since: string,
    until: string,
  ): Promise<
    Array<{
      campaignId: string;
      impressions: number;
      clicks: number;
      costMicros: number;
      currencyCode: string;
      date: string;
    }>
  > {
    const cid = normalizeCustomerId(customerId);
    const from = assertGaqlDate(since, 'since');
    const to = assertGaqlDate(until, 'until');
    const res = await this.search<{
      campaign?: { id?: string };
      metrics?: { impressions?: string; clicks?: string; costMicros?: string };
      customer?: { currencyCode?: string };
      segments?: { date?: string };
    }>(
      cid,
      `SELECT campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, customer.currency_code, segments.date ` +
        `FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' ORDER BY segments.date`,
    );
    return (res.results ?? []).map((r) => ({
      campaignId: r.campaign?.id ?? '',
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      costMicros: Number(r.metrics?.costMicros ?? 0),
      currencyCode: r.customer?.currencyCode ?? 'USD',
      date: r.segments?.date ?? since,
    }));
  }

  /** Revoke the refresh token at Google's endpoint (best-effort). */
  async revoke(): Promise<void> {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: this.config.refreshToken }),
    }).catch((e) => this.logger.warn(`token revoke failed: ${(e as Error).message}`));
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }
}
