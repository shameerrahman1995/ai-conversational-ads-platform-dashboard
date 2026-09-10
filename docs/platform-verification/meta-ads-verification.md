# Meta Ads — Official Verification (2026-09-11)

Sources: developers.facebook.com (Marketing/Graph API), Meta Business Help Center, Meta ad policies. Current GA API version: **v26.0** (released 2026-07-29; shared Graph/Marketing version).

## Verified facts
- **Access tiers:** `ads_management` **Standard Access** = dev tier (default); **Advanced Access** = production, requires **App Review** per permission. Eligibility to apply: ≥1,500 Marketing API calls / 15 days and <15% error rate. Production also needs **Business Verification**.
- **No arbitrary HTML/JS creative** in Feed/Reels/Stories. Creatives are structured formats via `object_story_spec`/`asset_feed_spec`: image, video, carousel, collection, **Instant Experience** (formerly Canvas — component-assembled, not free-form scripted HTML). Ad policy independently forbids deceptive/scripted creative.
- **Playable Ads** exist but are narrow: **App Installs objective only**; specific placements (FB Feed/Stories, IG Feed/Stories, Audience Network interstitial/rewarded); **self-contained HTML5, no external HTTP**, assets inlined; single HTML ≤2MB, ZIP ≤5MB / ≤100 files; must call `FbPlayableAd.onCTAClick()`; AV-scanned.
- **Native Lead Ads / instant forms via API: supported** (create form → associate to ad → retrieve via API + `leadgen` webhooks). Needs `leads_retrieval` + `pages_manage_ads`, App Review, Business Verification, Page access.
- **Click-to-Message (Messenger/WhatsApp/IG): supported** — `OUTCOME_ENGAGEMENT` + ad set `destination_type` MESSENGER/WHATSAPP; messaging permissions + linked WABA for WhatsApp.
- **Hierarchy:** Campaign → Ad Set → Ad (+ Ad Creative). Only `ACTIVE`/`PAUSED` valid at creation → objects **creatable as PAUSED** (standard build-paused-then-publish). Whether omitted `status` *defaults* to PAUSED = **unknown/undocumented**.
- **Special Ad Category** (`special_ad_categories`) is **required** at campaign creation (HOUSING/EMPLOYMENT/CREDIT/ISSUES_ELECTIONS_POLITICS or NONE); restricts targeting. Special Ad Audiences **removed 2022-09-15**.
- **Identity:** Facebook Page required; Instagram professional account required for IG placements (`page_id` + `instagram_actor_id`), IG claimed in Business Manager.

## Verdict table
| Capability | Verdict |
|---|---|
| Arbitrary-HTML/JS creative in Feed/Reels | **Unsupported** |
| Playable ads | **Capability-gated** (App Installs only, self-contained, size/file limits) |
| Native Lead forms | **Supported (gated: App Review + Biz Verification)** |
| Click-to-message | **Supported (gated: messaging perms + identity)** |
| Paused objects at creation | **Supported (as an option)**; paused-by-default-when-omitted = unknown |

## Key sources
- Changelog/versions: https://developers.facebook.com/docs/graph-api/changelog
- Standard/Advanced access: https://developers.facebook.com/docs/features-reference/ads-management-standard-access/
- Playable format + specs: https://developers.facebook.com/docs/app-ads/formats/playable-ad/ ; https://www.facebook.com/business/help/412951382532338
- Lead ads: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/
- Click-to-message: https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/messaging-ads/
- Special ad category: https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category/
- Ad status best practices: https://developers.facebook.com/documentation/ads-commerce/marketing-api/best-practices/manage-your-ad-object-status
