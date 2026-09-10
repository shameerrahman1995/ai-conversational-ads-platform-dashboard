/**
 * Real HTML5 ad-bundle builder (blueprint §3).
 *
 * Produces a THIN, SECRET-FREE creative that renders from a `CreativeManifest`
 * and talks to the Platform Edge API. The ZIP layout is exactly:
 *
 *   creative.zip
 *     index.html      the ad shell (300x250 by default, from manifest.size)
 *     app.js          the tiny vanilla-JS creative runtime (no deps, no secrets)
 *     styles.css      minimal styling within the ad size
 *     manifest.json   the CreativeManifest, serialized (NO secrets)
 *
 * The bundle references ONLY local assets (no external/CDN JS or CSS) so it is
 * valid for Google's uploaded-HTML5 requirements, and it degrades gracefully:
 * if the edge API is unreachable the ad still works as a normal interactive
 * creative (Explore CTA opens the final URL).
 *
 * Output is deterministic (fixed timestamps + stable file order) so identical
 * inputs reproduce byte-identical ZIPs.
 */
import JSZip from 'jszip';
import type { CreativeManifest } from '@acp/shared-types';

/** Minimal copy/product fields the template needs (kept separate from the
 * secret-free manifest — none of this is sensitive). */
export interface BundleCopy {
  /** Product/brand name shown in the ad. */
  productName: string;
  /** Primary hook headline. */
  hook: string;
  /** Optional sub-line under the hook. */
  subhead?: string;
  /** Label for the primary CTA button (default "Explore"). */
  ctaLabel?: string;
  /** Label for the AI button (default "Ask AI"). */
  askAiLabel?: string;
  /** Clickthrough / fallback URL opened on Explore or on edge failure. */
  finalUrl: string;
  /** Optional privacy-policy URL surfaced next to the consent checkbox. */
  privacyUrl?: string;
}

export interface BundleBuildInput {
  manifest: CreativeManifest;
  copy: BundleCopy;
}

export interface BundleFileInfo {
  name: string;
  bytes: number;
}

export interface CreativeBundle {
  /** name -> UTF-8 source, in stable order. */
  files: Record<string, string>;
  /** Per-file sizes, in stable order. */
  fileList: BundleFileInfo[];
  /** The generated ZIP bytes. */
  zip: Buffer;
  /** Size of the ZIP in bytes. */
  zipBytes: number;
}

/** Stable file order inside the ZIP (also the order of the returned map). */
export const BUNDLE_FILE_ORDER = ['index.html', 'styles.css', 'app.js', 'manifest.json'] as const;

/** Fixed epoch so the ZIP central directory is timestamp-stable (JSZip uses
 * getUTC* internally, so this is timezone-independent). */
const FIXED_DATE = new Date(Date.UTC(2020, 0, 1, 0, 0, 0));

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Serialize the manifest with a stable key order and no extra fields. */
export function renderManifestJson(manifest: CreativeManifest): string {
  const ordered = {
    creativeId: manifest.creativeId,
    tenantId: manifest.tenantId,
    productId: manifest.productId,
    agentId: manifest.agentId,
    size: { width: manifest.size.width, height: manifest.size.height },
    mode: manifest.mode,
    features: {
      textChat: manifest.features.textChat,
      voice: manifest.features.voice,
      gallery: manifest.features.gallery,
      leadCapture: manifest.features.leadCapture,
    },
    allowedActions: [...manifest.allowedActions],
    edgeApiBase: manifest.edgeApiBase,
    signedCreativeToken: manifest.signedCreativeToken,
  };
  return JSON.stringify(ordered, null, 2) + '\n';
}

/** Inline the manifest JSON safely inside a <script type="application/json">. */
function inlineManifest(manifest: CreativeManifest): string {
  // Escape "<" so the JSON can never terminate the script element early.
  return renderManifestJson(manifest).trim().replace(/</g, '\\u003c');
}

export function renderIndexHtml(manifest: CreativeManifest, copy: BundleCopy): string {
  const w = manifest.size.width;
  const h = manifest.size.height;
  const ctaLabel = copy.ctaLabel || 'Explore';
  const askLabel = copy.askAiLabel || 'Ask AI';
  const showAsk = manifest.mode === 'interactive_ai' && manifest.features.textChat;
  const askButton = showAsk
    ? `      <button id="acp-ask" class="acp-btn acp-btn-ghost" type="button">${escapeHtml(askLabel)}</button>\n`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${w},initial-scale=1">
<meta name="ad.size" content="width=${w},height=${h}">
<title>${escapeHtml(copy.productName)}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div id="acp-ad" class="acp-ad" style="width:${w}px;height:${h}px" data-final-url="${escapeHtml(copy.finalUrl)}">
  <div class="acp-hero">
    <span class="acp-badge">AI</span>
    <h1 class="acp-hook">${escapeHtml(copy.hook)}</h1>
    ${copy.subhead ? `<p class="acp-sub">${escapeHtml(copy.subhead)}</p>` : ''}
    <div class="acp-cta-row">
      <button id="acp-explore" class="acp-btn acp-btn-primary" type="button">${escapeHtml(ctaLabel)}</button>
${askButton}    </div>
  </div>
  <section id="acp-chat" class="acp-chat" hidden aria-label="Ask AI">
    <div id="acp-transcript" class="acp-transcript" aria-live="polite"></div>
    <div id="acp-suggested" class="acp-suggested"></div>
    <form id="acp-form" class="acp-input-row" autocomplete="off">
      <input id="acp-input" class="acp-input" type="text" placeholder="Ask a question..." maxlength="500" aria-label="Your question">
      <button id="acp-send" class="acp-btn acp-btn-primary acp-send" type="submit">Send</button>
    </form>
    <form id="acp-lead" class="acp-lead" hidden>
      <p class="acp-lead-copy">Want a callback? Leave your number.</p>
      <input id="acp-phone" class="acp-input" type="tel" placeholder="Phone number" maxlength="32" aria-label="Phone number">
      <label class="acp-consent"><input id="acp-consent" type="checkbox"> I agree to be contacted${
        copy.privacyUrl
          ? ` <button type="button" class="acp-link" id="acp-privacy" data-privacy-url="${escapeHtml(copy.privacyUrl)}">Privacy</button>`
          : ''
      }.</label>
      <button id="acp-lead-submit" class="acp-btn acp-btn-primary" type="submit">Request callback</button>
    </form>
  </section>
  <p id="acp-status" class="acp-status" hidden></p>
</div>
<script type="application/json" id="acp-manifest">${inlineManifest(manifest)}</script>
<script src="app.js"></script>
</body>
</html>
`;
}

export function renderStyles(manifest: CreativeManifest): string {
  const w = manifest.size.width;
  const h = manifest.size.height;
  return `/* Thin creative styles — sized to ${w}x${h}, no external assets. */
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.acp-ad {
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: #0f1729;
  color: #ffffff;
  border: 1px solid rgba(255,255,255,0.08);
}
.acp-hero { padding: 14px; display: flex; flex-direction: column; height: 100%; }
.acp-badge {
  align-self: flex-start;
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  padding: 2px 6px; border-radius: 4px;
  background: #4f46e5; color: #fff;
}
.acp-hook { font-size: 18px; line-height: 1.2; margin: 10px 0 6px; font-weight: 700; }
.acp-sub { font-size: 12px; line-height: 1.35; margin: 0; opacity: 0.85; }
.acp-cta-row { margin-top: auto; display: flex; gap: 8px; }
.acp-btn {
  font: inherit; font-size: 12px; font-weight: 600;
  border: 0; border-radius: 6px; padding: 8px 12px;
  cursor: pointer; flex: 1 1 auto;
}
.acp-btn-primary { background: #4f46e5; color: #fff; }
.acp-btn-ghost { background: rgba(255,255,255,0.1); color: #fff; }
.acp-btn:disabled { opacity: 0.5; cursor: default; }
.acp-send { flex: 0 0 auto; }
.acp-chat {
  position: absolute; inset: 0; background: #0f1729;
  display: flex; flex-direction: column; padding: 12px;
}
.acp-transcript { flex: 1 1 auto; overflow-y: auto; font-size: 12px; line-height: 1.35; }
.acp-msg { margin: 0 0 8px; padding: 6px 8px; border-radius: 8px; max-width: 90%; }
.acp-msg-user { background: #4f46e5; margin-left: auto; }
.acp-msg-ai { background: rgba(255,255,255,0.08); }
.acp-suggested { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; }
.acp-chip {
  font: inherit; font-size: 11px; border: 1px solid rgba(255,255,255,0.2);
  background: transparent; color: #fff; border-radius: 12px; padding: 4px 8px; cursor: pointer;
}
.acp-input-row, .acp-lead { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.acp-input-row { flex-direction: row; }
.acp-input {
  font: inherit; font-size: 12px; flex: 1 1 auto;
  border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);
  padding: 8px; background: #1b2540; color: #fff;
}
.acp-consent { font-size: 11px; opacity: 0.85; display: flex; align-items: center; gap: 6px; }
.acp-lead-copy { font-size: 12px; margin: 0; }
.acp-link { background: none; border: 0; color: #93c5fd; text-decoration: underline; cursor: pointer; font: inherit; padding: 0; }
.acp-status { position: absolute; left: 12px; right: 12px; bottom: 12px; margin: 0; font-size: 11px; opacity: 0.9; }
`;
}

/**
 * The tiny creative runtime. Vanilla JS, no deps, no secrets. It:
 *  - reads the inlined manifest.json (falls back to fetching it relatively),
 *  - on "Ask AI" opens a chat panel and lazily POSTs a session to the edge API,
 *  - sends messages and renders the {answer, ui, lead} reply,
 *  - on lead intent shows a consented phone capture that POSTs /lead,
 *  - degrades gracefully: on any edge failure the ad still works and Explore
 *    opens the final URL.
 *
 * NOTE: kept as plain string concatenation (no template literals, no eval, no
 * dynamic HTML writes) so it passes the static-analysis gate unchanged.
 */
export function renderAppJs(): string {
  return `(function () {
  'use strict';
  var EDGE_TIMEOUT_MS = 8000;

  function byId(id) { return document.getElementById(id); }

  function readManifest() {
    try {
      var el = byId('acp-manifest');
      if (el && el.textContent) return JSON.parse(el.textContent);
    } catch (e) { /* fall through */ }
    return null;
  }

  function loadManifest() {
    var inline = readManifest();
    if (inline) return Promise.resolve(inline);
    // Same-bundle relative fetch; still tolerant of failure.
    return fetch('manifest.json', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function setStatus(text) {
    var el = byId('acp-status');
    if (!el) return;
    if (text) { el.textContent = text; el.hidden = false; }
    else { el.hidden = true; }
  }

  function openFinalUrl() {
    var ad = byId('acp-ad');
    var url = ad && ad.getAttribute('data-final-url');
    if (url) { try { window.open(url, '_blank'); } catch (e) { /* noop */ } }
  }

  function edgeFetch(url, opts) {
    opts = opts || {};
    var controller = null;
    var timer = null;
    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      opts.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, EDGE_TIMEOUT_MS);
    }
    return fetch(url, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('edge_status_' + r.status);
      return r.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function authHeaders(manifest) {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Creative ' + manifest.signedCreativeToken
    };
  }

  function createSession(manifest) {
    return edgeFetch(manifest.edgeApiBase + '/v1/ad-sessions', {
      method: 'POST',
      credentials: 'omit',
      headers: authHeaders(manifest),
      body: JSON.stringify({ creativeId: manifest.creativeId, mode: manifest.mode })
    });
  }

  function postMessage(manifest, sessionId, text) {
    return edgeFetch(manifest.edgeApiBase + '/v1/ad-sessions/' + encodeURIComponent(sessionId) + '/messages', {
      method: 'POST',
      credentials: 'omit',
      headers: authHeaders(manifest),
      body: JSON.stringify({ message: text })
    });
  }

  function postLead(manifest, sessionId, phone) {
    return edgeFetch(manifest.edgeApiBase + '/v1/ad-sessions/' + encodeURIComponent(sessionId) + '/lead', {
      method: 'POST',
      credentials: 'omit',
      headers: authHeaders(manifest),
      body: JSON.stringify({ phone: phone, consent: true })
    });
  }

  function addMessage(role, text) {
    var t = byId('acp-transcript');
    if (!t) return;
    var div = document.createElement('div');
    div.className = 'acp-msg ' + (role === 'user' ? 'acp-msg-user' : 'acp-msg-ai');
    div.textContent = text;
    t.appendChild(div);
    t.scrollTop = t.scrollHeight;
  }

  function renderSuggested(replies, onPick) {
    var box = byId('acp-suggested');
    if (!box) return;
    box.textContent = '';
    if (!replies || !replies.length) return;
    for (var i = 0; i < replies.length; i++) {
      (function (label) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'acp-chip';
        chip.textContent = label;
        chip.addEventListener('click', function () { onPick(label); });
        box.appendChild(chip);
      })(replies[i]);
    }
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else { fn(); }
  }

  ready(function () {
    var explore = byId('acp-explore');
    if (explore) explore.addEventListener('click', openFinalUrl);

    var privacy = byId('acp-privacy');
    if (privacy) privacy.addEventListener('click', function () {
      var url = privacy.getAttribute('data-privacy-url');
      if (url) { try { window.open(url, '_blank'); } catch (e) { /* noop */ } }
    });

    var ask = byId('acp-ask');
    var chat = byId('acp-chat');
    var form = byId('acp-form');
    var input = byId('acp-input');
    var leadForm = byId('acp-lead');

    // No AI button (static mode / textChat off): nothing else to wire.
    if (!ask || !chat) return;

    var manifest = null;
    var sessionId = null;
    var starting = false;

    function degrade() {
      setStatus('Chat is unavailable right now. Tap Explore to learn more.');
    }

    function ensureSession() {
      if (sessionId) return Promise.resolve(sessionId);
      if (!manifest || !manifest.edgeApiBase || !manifest.signedCreativeToken) {
        return Promise.reject(new Error('no_manifest'));
      }
      if (starting) return Promise.reject(new Error('starting'));
      starting = true;
      return createSession(manifest).then(function (res) {
        starting = false;
        sessionId = (res && (res.id || res.sessionId)) || null;
        if (!sessionId) throw new Error('no_session');
        return sessionId;
      }, function (err) { starting = false; throw err; });
    }

    function maybeShowLead(lead) {
      if (!leadForm) return;
      if (lead && lead.intent) leadForm.hidden = false;
    }

    function renderReply(res) {
      if (!res) { degrade(); return; }
      if (res.answer) addMessage('ai', res.answer);
      var ui = res.ui || {};
      renderSuggested(ui.suggestedReplies, function (label) { submitText(label); });
      maybeShowLead(res.lead);
    }

    function submitText(text) {
      text = (text || '').trim();
      if (!text) return;
      addMessage('user', text);
      if (input) input.value = '';
      setStatus('');
      ensureSession()
        .then(function (id) { return postMessage(manifest, id, text); })
        .then(function (res) { renderReply(res); })
        .catch(function () { degrade(); });
    }

    ask.addEventListener('click', function () {
      chat.hidden = false;
      setStatus('');
      loadManifest().then(function (m) {
        manifest = m;
        if (!manifest || !manifest.edgeApiBase) { degrade(); return; }
        ensureSession()
          .then(function () { addMessage('ai', 'Hi! Ask me anything about ' + (manifest.productId || 'this') + '.'); })
          .catch(function () { degrade(); });
      });
    });

    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitText(input ? input.value : '');
    });

    if (leadForm) leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var phone = byId('acp-phone');
      var consent = byId('acp-consent');
      if (!phone || !phone.value.trim()) { setStatus('Please enter a phone number.'); return; }
      if (!consent || !consent.checked) { setStatus('Please agree to be contacted.'); return; }
      if (!sessionId) { degrade(); return; }
      setStatus('Sending...');
      postLead(manifest, sessionId, phone.value.trim())
        .then(function () { leadForm.hidden = true; setStatus('Thanks! We will be in touch.'); })
        .catch(function () { degrade(); });
    });
  });
})();
`;
}

/**
 * Build the full creative bundle: the four source files plus a deterministic
 * ZIP (fixed timestamps + stable file order => reproducible bytes).
 */
export async function buildCreativeBundle(input: BundleBuildInput): Promise<CreativeBundle> {
  const { manifest, copy } = input;
  const sources: Record<string, string> = {
    'index.html': renderIndexHtml(manifest, copy),
    'styles.css': renderStyles(manifest),
    'app.js': renderAppJs(),
    'manifest.json': renderManifestJson(manifest),
  };

  // Stable order for both the returned map and the ZIP central directory.
  const files: Record<string, string> = {};
  const fileList: BundleFileInfo[] = [];
  const zip = new JSZip();
  for (const name of BUNDLE_FILE_ORDER) {
    const content = sources[name];
    files[name] = content;
    fileList.push({ name, bytes: Buffer.byteLength(content, 'utf8') });
    zip.file(name, content, { date: FIXED_DATE });
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
  });

  return { files, fileList, zip: buffer, zipBytes: buffer.length };
}

/** Concatenate the creative's HTML/JS/CSS for the static-analysis gate. */
export function combinedSource(files: Record<string, string>): string {
  return [files['index.html'], files['app.js'], files['styles.css']]
    .filter(Boolean)
    .join('\n');
}
