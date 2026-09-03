import * as React from 'react';
import type { CampaignStatus, ConnectorStatus } from '@acp/shared-types';
import { cn } from './cn';

/**
 * Persistent Draft / In review / Approved / Live / Paused status primitive used
 * across campaigns, creatives and agents (blueprint §3 global navigation rules).
 */
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'acp-badge--neutral',
  info: 'acp-badge--info',
  success: 'acp-badge--success',
  warning: 'acp-badge--warning',
  danger: 'acp-badge--danger',
};

const CAMPAIGN_TONE: Record<CampaignStatus, Tone> = {
  DRAFT: 'neutral',
  GENERATED: 'info',
  VALIDATION_FAILED: 'danger',
  READY_FOR_REVIEW: 'info',
  APPROVED: 'success',
  SCHEDULED: 'info',
  PUBLISHING: 'warning',
  IN_REVIEW: 'warning',
  LIVE: 'success',
  PAUSED: 'warning',
  REJECTED: 'danger',
  ARCHIVED: 'neutral',
};

const CONNECTOR_TONE: Record<ConnectorStatus, Tone> = {
  DISCONNECTED: 'neutral',
  AUTHORIZING: 'info',
  CONNECTED: 'success',
  DEGRADED: 'warning',
  REAUTH_REQUIRED: 'danger',
  REVOKED: 'danger',
};

export interface StatusBadgeProps {
  kind?: 'campaign' | 'connector';
  status: CampaignStatus | ConnectorStatus;
  className?: string;
}

export function StatusBadge({ kind = 'campaign', status, className }: StatusBadgeProps) {
  const tone: Tone =
    kind === 'connector'
      ? (CONNECTOR_TONE[status as ConnectorStatus] ?? 'neutral')
      : (CAMPAIGN_TONE[status as CampaignStatus] ?? 'neutral');

  const label = status.replace(/_/g, ' ').toLowerCase();

  return (
    <span className={cn('acp-badge', TONE_CLASS[tone], className)} data-status={status}>
      {label}
    </span>
  );
}
