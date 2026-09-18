'use client';

import { useState } from 'react';
import { ApiClientError } from '@acp/api-client';
import { Button, Chip, EmptyState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { SectionTitle } from '../atoms';
import { downloadJson } from '../model';
import type { TabProps } from './types';

/**
 * Versions — immutable history (V10 §9 / U4.3).
 *
 * Campaigns pin an immutable agent version; publishing mints a new version
 * rather than mutating live campaigns. Restore rolls a previous version back in
 * as the working config (a governed publish still applies before it goes live).
 */
export function VersionsTab({ agent, settings, notify, client, refetch }: TabProps) {
  const versions = agent.versions;
  const [restoring, setRestoring] = useState<string | null>(null);

  async function restore(versionId: string, versionNumber: number) {
    if (restoring) return;
    setRestoring(versionId);
    try {
      await client.agents.restoreVersion(agent.id, versionId);
      notify('Version restored', `v${versionNumber} is now the working configuration. Publish to make it live.`, 'success');
      refetch();
    } catch (e) {
      notify('Restore failed', e instanceof ApiClientError ? e.body.message : 'Try again.', 'danger');
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="agent-section">
      <SectionTitle
        title="Version history"
        subtitle="Campaigns pin immutable agent versions. Publishing creates a new version rather than mutating active campaigns."
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon="download"
            onClick={() =>
              downloadJson(
                `${settings.name.replace(/\s+/g, '-').toLowerCase()}-v${versions[0]?.version ?? 1}.json`,
                agent.settings,
              )
            }
          >
            Export config
          </Button>
        }
      />

      {versions.length === 0 ? (
        <EmptyState
          icon="clock"
          title="No published versions yet"
          hint="Publish a version to pin an immutable snapshot for campaigns."
        />
      ) : (
        <div className="agent-versions">
          {versions.map((v, i) => {
            const current = i === 0;
            const date = v.publishedAt
              ? new Date(v.publishedAt).toLocaleString()
              : new Date(v.createdAt).toLocaleDateString();
            return (
              <div key={v.version}>
                <span className={current ? 'current' : undefined}>v{v.version}</span>
                <div>
                  <strong>{current ? 'Current working version' : 'Published version'}</strong>
                  <p>
                    {current ? agent.status : 'Archived'} · —
                  </p>
                  <small>{date}</small>
                </div>
                <div>
                  {current ? (
                    <Chip tone="success">Current</Chip>
                  ) : (
                    <Button
                      size="sm"
                      disabled={restoring !== null}
                      title={`Restore v${v.version} as the working configuration`}
                      onClick={() => restore(v.id, v.version)}
                    >
                      {restoring === v.id ? 'Restoring…' : 'Restore'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="more"
                    aria-label={`Version ${v.version} actions`}
                    onClick={() =>
                      notify('Version actions', `Version ${v.version} can be compared, exported or archived.`, 'info')
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="row"
        style={{
          gap: '0.6rem',
          alignItems: 'flex-start',
          padding: '0.75rem 0.85rem',
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius-control)',
          background: 'var(--color-info-soft)',
        }}
      >
        <span style={{ color: 'var(--color-info)', flex: 'none' }}>
          <Icon name="lock" size={16} />
        </span>
        <div>
          <strong style={{ fontSize: 13 }}>Campaigns stay pinned</strong>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Existing campaigns remain pinned to their current version until an authorised user updates the campaign
            and completes review. Restoring a previous version rolls it back in as the working configuration; it does
            not go live until you publish it through the governance gate.
          </div>
        </div>
      </div>
    </div>
  );
}
