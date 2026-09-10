# Google Ads — Official Verification (2026-09-11)

Sources: developers.google.com/google-ads, support.google.com, Google Advertising Policies.

## Verified facts
- **API version:** latest GA **v25** (2026-07-22), minor **v25.1** (2026-08-19); v24/v23 still maintained. Target v25.x.
- **Uploaded HTML5 display: SUPPORTED** via `MediaBundleAsset` (`MEDIA_BUNDLE`) referenced by `DisplayUploadAdInfo` with `display_upload_product_type = HTML5_UPLOAD_AD` (a Display Upload Ad / AdGroupAd). First-class documented capability.
- **Creative constraints (native uploaded-display spec):** ≤**600 KB**, ≤**40 files**, **relative paths only**, **no external references** except a small Google-hosted allowlist (Google Fonts, CreateJS, GSAP, jQuery). `clickTag` mandatory + readable. `<meta name="ad.size">` required. No auto audio; user-initiated effects; CPU ~40% cap; no pop-ups.
- **Microphone/getUserMedia/WebRTC:** not documented as permitted anywhere → **Unsupported**.
- **Live/streaming AI inside the served creative:** **not feasible** (self-contained, no outbound calls). DV360 third-party-served path allows ≤100 HTTP calls / ≤5 MB but still not mic/live-stream — do not conflate with native uploaded-display limits.
- **OAuth scope:** `https://www.googleapis.com/auth/adwords` (single scope), `access_type=offline` for refresh token.
- **Developer token tiers:** Test (auto, 15k ops/day, test accounts) → Basic (brand verification + app, prod) → Standard (RMF audit, unlimited). **HONESTY FLAG:** official Developer Token policy page states developer tokens were **sunset 2026-09-09**, access now Cloud-project-managed ("Cloud-managed access levels"), MCC only needed for multi-account. This landed 2 days before audit date — **re-verify live onboarding at build time**.
- **Paused-by-default: SUPPORTED** — `CampaignStatus`/`AdGroupStatus` include `PAUSED` at creation (recommended staging pattern).

## Eligibility gates
- HTML5 uploaded-display access: AMPHTML **or** account >90 days + >$9,000 lifetime spend + clean policy **or** allowlist form (support.google.com/google-ads/contact/html_5_access). Not guaranteed even when met; per-creative policy review.
- API level ≥ Basic for production; Standard for scale.

## Verdict table
| Capability | Verdict |
|---|---|
| Uploaded HTML5 display creative | **Supported (capability-gated)** |
| External network requests inside served creative | **Unsupported** (native); capped-gated only on DV360 3p-served path |
| Microphone inside creative | **Unsupported** |
| Live-AI streaming inside creative | **Unsupported / not feasible per policy** |
| Paused-by-default objects | **Supported** |

## Bottom line
Advertiser-uploaded HTML5 display is officially supported but **sandboxed, self-contained, no-outbound-network, no-microphone**. A live conversational AI **cannot run inside the served Google creative** — it must live on a **post-click destination**.

## Key sources
- Release notes/versioning: https://developers.google.com/google-ads/api/docs/release-notes ; .../concepts/versioning
- HTML5 upload ads: https://developers.google.com/google-ads/api/docs/display-upload-ads/html5-upload-ads ; .../create-display-upload-ad
- Uploaded display specs: https://support.google.com/google-ads/answer/1722096
- 3p ad-serving limits: https://support.google.com/adspolicy/answer/94230
- OAuth: https://developers.google.com/google-ads/api/docs/oauth/internals
- Access levels: https://developers.google.com/google-ads/api/docs/access-levels
- Developer-token sunset: https://developers.google.com/google-ads/api/docs/api-policy/developer-token ; .../concepts/no-developer-token
