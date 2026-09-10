# TikTok Ads — Official Verification (2026-09-11)

Sources: business-api.tiktok.com portal docs, ads.tiktok.com/help, official tiktok/tiktok-business-api-sdk (mirror of portal field defs). Portal SPA returned 403 to automated fetch; facts cross-confirmed via Help Center + official SDK docs (not blogs).

## Verified facts
- **API version:** Marketing API **v1.3**. Base: `https://business-api.tiktok.com/open_api/v1.3/`.
- **Auth:** OAuth 2.0 advertiser authorization → `auth_code` → `POST /oauth2/access_token/` → long-term token (dies on revocation). Scope-gated per advertiser.
- **Playable:** documented format. Rules: `.zip` **< 5 MB**; first-level `index.html` + `config.json` (`playable_orientation`); integrate TikTok/Pangle `playable-sdk.js`; store via `window.openAppStore()`; **not** `mraid.js`. **Self-contained CONFIRMED — "Playable Ad materials must not make any HTTP requests"; "loading dynamic materials via external networks is not permitted"; no JS redirects.** → No live LLM/CRM/analytics from inside a playable.
- **Playable eligibility:** Smart+ experience, **App Promotion objective only**, MAI/AEO/VBO goal, iOS/Android app, **TikTok feed** placement only.
- **Native Lead Gen (Instant Form): supported** — create Lead Generation campaigns/ad groups/ads via API + retrieve via Lead Generation API + real-time lead webhooks (HTTPS callback, 200 ack, retries ≤72h). Full programmatic form *authoring* not clearly documented (partial).
- **Hierarchy:** Advertiser → Campaign → Ad Group → Ad. Spark Ads need a TikTok **Identity**. Video/image via Creative/File APIs; catalogs supported.
- **Born-paused:** `operation_status` enum `ENABLE`/`DISABLE`, **default ENABLE**, but **allowlist-only** — "if you pass this field without applying for allowlisting first, the field will be ignored and no error." Universal path = create (ENABLE) then `/campaign|adgroup|ad/status/update/` → DISABLE (two calls). R&F campaigns can't be DISABLE.

## Verdict table
| Capability | Verdict |
|---|---|
| Self-contained playable | **Supported** (Smart+/App-Promotion/feed, ≤5 MB, no mraid.js) |
| External HTTP inside a playable | **Unsupported (prohibited)** |
| Native lead form (Instant Form) | **Supported** (programmatic form authoring: partial) |
| Paused/disabled-by-default objects | **Capability-gated** (`operation_status` allowlist-only; else create-then-status-update) |

## Bottom line
A playable creative **cannot hold a live server-side conversation** (explicit hard rule). Real-time dialogue/lead capture must occur outside the playable sandbox (post-click app/website, or Instant Form + Lead Gen webhooks). Design **create-then-pause** unless allowlisted for `operation_status`.

## Key sources
- Marketing API v1.3: https://business-api.tiktok.com/portal/docs/marketing-api/v1.3
- SDK field defs (operation_status): https://github.com/tiktok/tiktok-business-api-sdk
- Playable spec: https://ads.tiktok.com/help/article/how-to-create-tiktok-pangle-playable-ads ; https://ads.tiktok.com/help/article/playable-ads?lang=en
- Instant Form / Lead Gen: https://ads.tiktok.com/help/article/set-up-lead-generation-with-instant-form?lang=en ; Lead Gen API: https://business-api.tiktok.com/portal/docs?id=1739289524101122
- Spark/Identity: https://ads.tiktok.com/help/article/identity
