'use client';

import { useState } from 'react';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Drawer, Chip, DataState, DefinitionList, Notice, StatusChip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import type {
  PublishPlan,
  RemoteObjectTreeCampaign,
  ReconciliationDrift,
} from '@acp/api-client';

const PLATFORM_LABEL: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  microsoft: 'Microsoft Ads',
  amazon_dsp: 'Amazon DSP',
  linkedin: 'LinkedIn',
  generic_export: 'Generic export',
};
const platformLabel = (p: string) =>
  PLATFORM_LABEL[p] ?? p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Small review-state chip for a remote node. */
function ReviewChip({ state }: { state: string | null }) {
  if (!state) return <span className="cell-muted">—</span>;
  const tone =
    state === 'approved' ? 'success' : state === 'rejected' ? 'danger' : 'warning';
  return <Chip tone={tone}>{state.replace(/_/g, ' ')}</Chip>;
}

/** The campaign → adGroup → ad structure deployed on the platform. */
function RemoteObjectTree({ tree }: { tree: RemoteObjectTreeCampaign[] }) {
  if (tree.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        No remote objects mapped for this account yet.
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: '0.6rem' }}>
      {tree.map((campaign, ci) => (
        <div
          key={campaign.campaignRemoteId ?? `c-${ci}`}
          style={{
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-control, 8px)',
            padding: '0.6rem 0.75rem',
            background: 'var(--color-surface-2)',
          }}
        >
          <div className="spread" style={{ alignItems: 'center' }}>
            <span className="row" style={{ gap: '0.45rem' }}>
              <Icon name="globe" size={14} />
              <span className="cell-strong tnum" style={{ wordBreak: 'break-all' }}>
                {campaign.campaignRemoteId ?? '(no campaign id)'}
              </span>
            </span>
            <ReviewChip state={campaign.reviewStatus} />
          </div>
          <div className="stack" style={{ gap: '0.35rem', marginTop: '0.5rem' }}>
            {campaign.adGroups.map((group, gi) => (
              <div
                key={group.adGroupRemoteId ?? `g-${gi}`}
                style={{ marginLeft: '0.75rem', paddingLeft: '0.6rem', borderLeft: '2px solid var(--color-line)' }}
              >
                <span className="row" style={{ gap: '0.4rem', fontSize: 12.5 }}>
                  <Icon name="layers" size={13} />
                  <span className="tnum" style={{ wordBreak: 'break-all' }}>
                    {group.adGroupRemoteId ?? '(no ad group)'}
                  </span>
                </span>
                <div className="stack" style={{ gap: '0.25rem', marginTop: '0.3rem' }}>
                  {group.ads.length === 0 ? (
                    <span className="cell-muted" style={{ marginLeft: '1.1rem', fontSize: 12 }}>
                      No ads
                    </span>
                  ) : (
                    group.ads.map((ad, ai) => (
                      <div
                        key={ad.adRemoteId ?? `a-${ai}`}
                        className="spread"
                        style={{ marginLeft: '1.1rem', paddingLeft: '0.6rem', borderLeft: '2px solid var(--color-line)' }}
                      >
                        <span className="row" style={{ gap: '0.4rem', fontSize: 12 }}>
                          <Icon name="bolt" size={12} />
                          <span className="tnum" style={{ wordBreak: 'break-all' }}>{ad.adRemoteId}</span>
                          <span className="cell-muted">rev {ad.revision}</span>
                        </span>
                        <ReviewChip state={ad.reviewStatus} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DriftList({ drift }: { drift: ReconciliationDrift[] }) {
  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      {drift.map((d, i) => (
        <div
          key={`${d.field}-${i}`}
          style={{
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-control, 8px)',
            padding: '0.55rem 0.7rem',
          }}
        >
          <div className="spread">
            <span className="cell-strong">{d.field}</span>
            <span className="row" style={{ gap: '0.4rem', fontSize: 12.5 }}>
              <Chip tone="neutral">desired: {d.desired}</Chip>
              <Chip tone="warning">remote: {d.remote}</Chip>
            </span>
          </div>
          {d.note ? (
            <div className="muted" style={{ fontSize: 12, marginTop: '0.3rem' }}>
              {d.note}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Governance view (V10 U5.3): desired-vs-remote reconciliation for one publish
 * plan plus the campaign → adGroup → ad remote-object tree. Read-only — fetching
 * it never mutates the plan (the server records who inspected drift).
 */
export function ReconciliationDrawer({
  plan,
  onClose,
}: {
  plan: PublishPlan | null;
  onClose: () => void;
}) {
  const client = useApiClient();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAsync(
    () => (plan ? client.publishing.reconciliation(plan.id) : Promise.resolve(null)),
    [client, plan?.id, reload],
  );

  return (
    <Drawer
      open={plan !== null}
      onClose={onClose}
      title="Deployment reconciliation"
      width={580}
    >
      {plan ? (
        <div className="stack" style={{ gap: '1rem' }}>
          <DataState
            loading={loading}
            error={error}
            onRetry={() => setReload((n) => n + 1)}
            loadingLabel="Reconciling with the platform…"
          >
            {data ? (
              <>
                <div className="spread" style={{ alignItems: 'center' }}>
                  <span className="cell-muted" style={{ fontSize: 13 }}>
                    {platformLabel(data.platform)} · {data.accountId ?? '—'}
                  </span>
                  {data.inSync ? (
                    <Chip tone="success" icon="check">In sync</Chip>
                  ) : (
                    <Chip tone="warning" icon="alert">
                      {data.drift.length} drift{data.drift.length === 1 ? '' : 's'}
                    </Chip>
                  )}
                </div>

                {data.inSync ? (
                  <Notice variant="success" title="No drift detected">
                    The local plan matches the platform&apos;s current view of this deployment.
                  </Notice>
                ) : (
                  <div className="stack" style={{ gap: '0.5rem' }}>
                    <div className="panel-title">Drift</div>
                    <DriftList drift={data.drift} />
                  </div>
                )}

                <div className="stack" style={{ gap: '0.5rem' }}>
                  <div className="panel-title">Desired vs remote</div>
                  <DefinitionList
                    items={[
                      { label: 'Plan status (desired)', value: <StatusChip status={data.desired.planStatus} /> },
                      {
                        label: 'Campaign status',
                        value: data.desired.campaignStatus ? (
                          <StatusChip status={data.desired.campaignStatus} />
                        ) : (
                          <span className="cell-muted">—</span>
                        ),
                      },
                      {
                        label: 'Remote review state',
                        value: <ReviewChip state={data.remote?.state ?? null} />,
                      },
                      {
                        label: 'Remote → mapped status',
                        value: data.remoteMappedStatus ? (
                          <StatusChip status={data.remoteMappedStatus} />
                        ) : (
                          <span className="cell-muted">Not published</span>
                        ),
                      },
                      {
                        label: 'Remote id',
                        value: data.desired.remoteId ? (
                          <span className="tnum" style={{ wordBreak: 'break-all' }}>{data.desired.remoteId}</span>
                        ) : (
                          <span className="cell-muted">—</span>
                        ),
                      },
                      ...(data.remote?.reason
                        ? [{ label: 'Remote reason', value: data.remote.reason }]
                        : []),
                    ]}
                  />
                </div>

                <div className="stack" style={{ gap: '0.5rem' }}>
                  <div className="panel-title">Remote-object tree</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Campaign → ad group → ad, as deployed on this account.
                  </div>
                  <RemoteObjectTree tree={data.tree} />
                </div>
              </>
            ) : null}
          </DataState>
        </div>
      ) : null}
    </Drawer>
  );
}
