# Browser Runtime & Permissions — Official Verification (2026-09-11)

Scope: feasibility of a "live conversational ad" with optional voice (mic capture + audio + streaming to an AI backend) inside a typical third-party cross-origin ad `<iframe>`. Sources: MDN, Chrome developer docs, W3C/WHATWG.

## Verified facts
- **getUserMedia** requires a **secure context (HTTPS)**; in an insecure context `navigator.mediaDevices` is `undefined`.
- The **`microphone`/`camera` Permissions-Policy default allowlist is `self`** → a cross-origin ad iframe is **excluded by default**.
- For a feature to work in an `<iframe>`, the origin must be allowlisted in **BOTH** the top-level page's `Permissions-Policy` header **AND** the iframe's `allow=` attribute (intersection, most-restrictive-wins). Both are controlled by the **publisher**, not the advertiser. Disabling is a one-way toggle.
- **Explicit user permission is always required**; silent/un-consented capture is not achievable (first-use prompt). A returning first-party visitor with a persisted grant is the only auto-open case — does not apply to a cross-origin ad frame.
- **Audible autoplay** needs user activation / media-engagement; **muted autoplay always allowed**. Cross-origin iframe autoplay **blocked by default** (needs `allow="autoplay"` delegation + activation).
- **`sandbox`** without `allow-scripts` → no JS runs at all (voice agent dead on arrival). Sandbox can only further restrict; it cannot grant mic/camera.
- Host **CSP `connect-src`** governs `fetch`/XHR/`WebSocket`/`EventSource`/`sendBeacon`; a backend origin not allowlisted is blocked. Delivered in the document response header (publisher-controlled).

## Verdict table (typical cross-origin ad iframe)
| Capability | Verdict |
|---|---|
| Microphone by default (no host action) | **Not possible** |
| Microphone after user gesture WITH host Permissions-Policy grant + user consent | **Requires explicit host grant** |
| Autoplay audio without a gesture | **Not possible** |
| Arbitrary external fetch/WebSocket under host CSP | **Requires explicit host grant** |

## Bottom line
Live in-ad voice needs FOUR independent host-controlled mechanisms to align (Permissions-Policy mic/camera, sandbox tokens, autoplay policy, CSP connect-src) — none self-grantable by an advertiser. Feasible only on first-party surfaces the vendor controls or a publisher who explicitly wires delegation per placement.

## Sources
- MDN getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN Permissions Policy guide: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy
- MDN Permissions-Policy: microphone: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/microphone
- MDN <iframe> (allow, sandbox): https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- Chrome autoplay policy: https://developer.chrome.com/blog/autoplay/
- MDN CSP connect-src: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src
