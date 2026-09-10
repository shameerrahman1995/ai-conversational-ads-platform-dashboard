import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

/**
 * Injection token for the ioredis connection backing the ad-session store.
 * Kept private to the edge plane so it never collides with the BullMQ
 * connection (JOBS_REDIS), which is tuned for blocking queue reads.
 */
export const AD_SESSION_REDIS = Symbol('AD_SESSION_REDIS');

/** Live-session TTL. Refreshed on every visitor activity (blueprint §4). */
export const AD_SESSION_TTL_SECONDS = 900;

const keyFor = (id: string): string => `adsession:${id}`;

/** Lightweight, in-flight qualification signal maintained per ad session. */
export interface AdSessionQualification {
  turns: number;
  /** 0-100 heuristic intent score derived from turns + captured fields. */
  score: number;
  intent: string;
  /** Lead fields already observed in the conversation (never the values). */
  capturedFields: string[];
  /** Lead fields still outstanding, surfaced to the creative as UI hints. */
  missingFields: string[];
}

/**
 * Volatile ad-session state (blueprint §4/§5). The durable spine is the
 * `AdSession` Prisma row; this Redis entry holds the short-lived working state
 * the edge endpoints read on every turn. It carries NO PII — only ids, feature
 * flags and aggregate qualification signals.
 */
export interface AdSessionState {
  id: string;
  orgId: string;
  creativeId: string;
  platform?: string;
  /** Resolved hosted-agent id, when the creative maps to a configured agent. */
  agentId: string | null;
  /** Lightweight Conversation created lazily on the first message. */
  conversationId: string | null;
  /** Structural AI disclosure to show the visitor (compliance control). */
  disclosure: string;
  conversationEnabled: boolean;
  voiceEnabled: boolean;
  placementContext?: Record<string, unknown>;
  qualification: AdSessionQualification;
  status: 'open' | 'converted' | 'closed';
  startedAt: string;
}

/**
 * Redis-backed live store for ad sessions. Every write (re)sets a 900s TTL so an
 * abandoned session self-expires; an active one is kept warm by `touch`/`save`.
 */
@Injectable()
export class AdSessionStore {
  constructor(@Inject(AD_SESSION_REDIS) private readonly redis: Redis) {}

  /** Persist a new session with a fresh TTL. */
  async create(state: AdSessionState): Promise<void> {
    await this.redis.set(keyFor(state.id), JSON.stringify(state), 'EX', AD_SESSION_TTL_SECONDS);
  }

  /** Read a session; returns null when missing or expired. */
  async get(id: string): Promise<AdSessionState | null> {
    const raw = await this.redis.get(keyFor(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdSessionState;
    } catch {
      return null;
    }
  }

  /** Overwrite a session and refresh its TTL (called on activity). */
  async save(state: AdSessionState): Promise<void> {
    await this.redis.set(keyFor(state.id), JSON.stringify(state), 'EX', AD_SESSION_TTL_SECONDS);
  }

  /** Refresh the TTL without rewriting the value; no-op if the key is gone. */
  async touch(id: string): Promise<void> {
    await this.redis.expire(keyFor(id), AD_SESSION_TTL_SECONDS);
  }

  /** Remove a session (called on close). */
  async delete(id: string): Promise<void> {
    await this.redis.del(keyFor(id));
  }
}
