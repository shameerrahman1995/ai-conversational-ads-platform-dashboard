'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentStructuredReply } from '@acp/shared-types';

/**
 * Live edge ad-session client (V10 U3.9).
 *
 * The in-ad InteractiveAd talks to the PUBLIC visitor edge API — the same
 * surface a served HTML5 creative uses — not the dashboard api-client:
 *
 *   GET  {API}/v1/creatives/:creativeId/bootstrap   → { …config, signedCreativeToken }
 *   POST {API}/v1/ad-sessions                        (Authorization: Creative <token>)
 *   POST {API}/v1/ad-sessions/:id/messages           → AgentStructuredReply
 *   POST {API}/v1/ad-sessions/:id/lead               → { leadId, status }
 *   POST {API}/v1/ad-sessions/:id/close
 *
 * Every call fails soft: any error (no creativeId, not live, network down,
 * timeout) flips the session to `fallback` so the ad stays fully usable on the
 * deterministic offline path. Nothing here ever throws to the component.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export type EdgeStatus = 'idle' | 'connecting' | 'live' | 'fallback';

interface BootstrapConfig {
  creativeId: string;
  edgeApiBase: string;
  signedCreativeToken: string;
  disclosure?: string;
  features?: { voice?: string; textChat?: boolean; leadCapture?: boolean };
}

interface SessionInfo {
  sessionId: string;
  edgeApiBase: string;
  token: string;
  conversationEnabled: boolean;
  voiceEnabled: boolean;
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`edge ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Pre-token public bootstrap → mints a short-lived creative token. */
async function bootstrap(creativeId: string): Promise<BootstrapConfig> {
  const config = await fetchJson<BootstrapConfig>(
    `${API_BASE}/v1/creatives/${encodeURIComponent(creativeId)}/bootstrap`,
    { method: 'GET' },
  );
  const edgeApiBase = config.edgeApiBase || `${API_BASE}/v1`;
  return { ...config, edgeApiBase };
}

/** Open an ad session with the minted creative token. */
async function openSession(config: BootstrapConfig, platform: string, canMic: boolean): Promise<SessionInfo> {
  const created = await fetchJson<{
    sessionId: string;
    conversationEnabled: boolean;
    voiceEnabled: boolean;
  }>(`${config.edgeApiBase}/ad-sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Creative ${config.signedCreativeToken}`,
    },
    body: JSON.stringify({
      creativeId: config.creativeId,
      platform,
      capabilities: { fetch: true, mic: canMic },
    }),
  });
  return {
    sessionId: created.sessionId,
    edgeApiBase: config.edgeApiBase,
    token: config.signedCreativeToken,
    conversationEnabled: created.conversationEnabled,
    voiceEnabled: created.voiceEnabled,
  };
}

export interface AdSessionApi {
  status: EdgeStatus;
  /** True once a live session is (or has been) established this render cycle. */
  live: boolean;
  /**
   * Ask the live agent. Resolves to the structured reply, or `null` when the
   * edge is unavailable (caller should fall back to the deterministic answer).
   */
  send: (text: string) => Promise<AgentStructuredReply | null>;
  /**
   * Submit a consented lead. Resolves to `{ leadId }` on a real capture, or
   * `null` when the edge is unavailable (caller records a sandbox lead).
   */
  submitLead: (fields: Record<string, string>) => Promise<{ leadId: string } | null>;
  /** Best-effort session close (fire-and-forget). */
  close: () => void;
}

interface UseAdSessionOptions {
  /** Served CreativeVariant id. Absent → pure sandbox (never touches the edge). */
  creativeId?: string | null;
  platform?: string;
  /** Force the offline sandbox path (e.g. an offline simulation condition). */
  sandbox?: boolean;
  canMic?: boolean;
}

/**
 * React hook that lazily connects to the edge on the first message and then
 * reuses the session. Degrades to `fallback` on any failure and stays there so
 * a dead edge is not hammered on every turn.
 */
export function useAdSession(opts: UseAdSessionOptions): AdSessionApi {
  const { creativeId, platform = 'preview', sandbox = false, canMic = false } = opts;
  const [status, setStatus] = useState<EdgeStatus>('idle');
  const sessionRef = useRef<SessionInfo | null>(null);
  const connectingRef = useRef<Promise<SessionInfo | null> | null>(null);
  const deadRef = useRef(false);

  // A new creative / a switch into sandbox resets the connection state.
  useEffect(() => {
    sessionRef.current = null;
    connectingRef.current = null;
    deadRef.current = false;
    setStatus('idle');
  }, [creativeId, sandbox]);

  const connect = useCallback(async (): Promise<SessionInfo | null> => {
    if (sandbox || !creativeId || deadRef.current) return null;
    if (sessionRef.current) return sessionRef.current;
    if (connectingRef.current) return connectingRef.current;
    setStatus('connecting');
    const attempt = (async () => {
      try {
        const config = await bootstrap(creativeId);
        const session = await openSession(config, platform, canMic);
        sessionRef.current = session;
        setStatus('live');
        return session;
      } catch {
        deadRef.current = true;
        setStatus('fallback');
        return null;
      } finally {
        connectingRef.current = null;
      }
    })();
    connectingRef.current = attempt;
    return attempt;
  }, [sandbox, creativeId, platform, canMic]);

  const send = useCallback(
    async (text: string): Promise<AgentStructuredReply | null> => {
      const session = await connect();
      if (!session) {
        if (!deadRef.current) setStatus('fallback');
        return null;
      }
      try {
        return await fetchJson<AgentStructuredReply>(
          `${session.edgeApiBase}/ad-sessions/${session.sessionId}/messages`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Creative ${session.token}`,
            },
            body: JSON.stringify({ text }),
          },
        );
      } catch {
        deadRef.current = true;
        setStatus('fallback');
        return null;
      }
    },
    [connect],
  );

  const submitLead = useCallback(
    async (fields: Record<string, string>): Promise<{ leadId: string } | null> => {
      const session = sessionRef.current ?? (await connect());
      if (!session) return null;
      try {
        const res = await fetchJson<{ leadId: string; status: string }>(
          `${session.edgeApiBase}/ad-sessions/${session.sessionId}/lead`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Creative ${session.token}`,
            },
            body: JSON.stringify({ fields, consent: true }),
          },
        );
        return { leadId: res.leadId };
      } catch {
        return null;
      }
    },
    [connect],
  );

  const close = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    setStatus('idle');
    void fetch(`${session.edgeApiBase}/ad-sessions/${session.sessionId}/close`, {
      method: 'POST',
      headers: { authorization: `Creative ${session.token}` },
      keepalive: true,
    }).catch(() => {
      /* best-effort */
    });
  }, []);

  return { status, live: status === 'live', send, submitLead, close };
}
