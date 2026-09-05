'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useToast } from '@/components/feedback';
import { ApiClientError } from '@acp/api-client';
import { Icon } from '@/components/Icon';
import {
  PageHeader,
  Button,
  StatCard,
  Panel,
  Card,
  Chip,
  StatusChip,
  DataState,
  EmptyState,
} from '@/components/ui';

/* Shape of a campaign version snapshot (JSON blob typed as `unknown` by the API). */
interface CopySnapshot {
  copy?: {
    headline?: string;
    offer?: string;
    cta?: string;
    proofPoints?: string[];
  };
  claims?: { text: string; supported: boolean }[];
  generation?: { model?: string; brandVoice?: string };
}

const objectiveLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

/* "image_9_16" → "Image · 9:16" */
const formatLabel = (f: string) => {
  const parts = f.split('_');
  const kind = parts[0] ? objectiveLabel(parts[0]) : f;
  const ratio = parts.slice(1).join(':');
  return ratio ? `${kind} · ${ratio}` : kind;
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const client = useApiClient();
  const toast = useToast();

  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);

  const { data, error, loading } = useAsync(
    () =>
      Promise.all([
        client.campaigns.list(),
        client.campaigns.versions(id),
        client.creative.variants(id),
        client.publishing.plans(),
      ]),
    [client, id, reload],
  );

  const [campaigns, versions, variants, allPlans] = data ?? [];
  const campaign = useMemo(
    () => (campaigns ?? []).find((c) => c.id === id),
    [campaigns, id],
  );

  // Latest version = the current, canonical copy.
  const ordered = useMemo(
    () => [...(versions ?? [])].sort((a, b) => b.version - a.version),
    [versions],
  );
  const latest = ordered[0];
  const snap = latest?.snapshot as CopySnapshot | undefined;
  const copy = snap?.copy;
  const claims = snap?.claims ?? [];
  const supported = claims.filter((c) => c.supported).length;

  // Publish plans belonging to this campaign's variants = the launch surface.
  const variantIds = useMemo(() => new Set((variants ?? []).map((v) => v.id)), [variants]);
  const plans = useMemo(
    () => (allPlans ?? []).filter((p) => variantIds.has(p.variantId)),
    [allPlans, variantIds],
  );
  const liveCount = plans.filter((p) => p.status === 'LIVE').length;
  const readyCount = plans.filter((p) => p.status === 'READY_FOR_REVIEW').length;

  async function approveAndPublish(planId: string) {
    setBusy(true);
    try {
      await client.publishing.approve(planId);
      await client.publishing.execute(planId);
      await client.publishing.sync(planId);
      toast.success('Approved & published — live');
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.body.message : "Couldn't publish this plan");
    } finally {
      setBusy(false);
    }
  }

  async function launchAll() {
    const ready = plans.filter((p) => p.status === 'READY_FOR_REVIEW');
    if (ready.length === 0) return;
    setBusy(true);
    let ok = 0;
    for (const p of ready) {
      try {
        await client.publishing.approve(p.id);
        await client.publishing.execute(p.id);
        await client.publishing.sync(p.id);
        ok++;
      } catch {
        /* keep going; a failed channel stays in review */
      }
    }
    toast.success(ok > 0 ? `Launched ${ok} channel${ok === 1 ? '' : 's'}` : 'Nothing could be launched');
    setBusy(false);
    setReload((n) => n + 1);
  }

  async function generate() {
    setBusy(true);
    try {
      const res = await client.campaigns.generate(id);
      toast.success(`Copy generated — version ${res.version}`);
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.body.message : "Couldn't generate copy",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Link
        href="/campaigns"
        className="row muted"
        style={{
          gap: '0.3rem',
          fontSize: 13,
          textDecoration: 'none',
          marginBottom: '0.6rem',
        }}
      >
        <Icon name="chevron-right" size={14} style={{ transform: 'scaleX(-1)' }} />
        Back to campaigns
      </Link>

      <DataState
        loading={loading}
        error={error}
        loadingLabel="Loading campaign…"
      >
        {!campaign ? (
          <EmptyState
            icon="search"
            title="Campaign not found"
            hint="It may have been archived or the link is out of date."
            action={
              <Link href="/campaigns" className="btn btn-primary">
                Back to campaigns
              </Link>
            }
          />
        ) : (
          <>
            <PageHeader
              title={campaign.name ?? objectiveLabel(campaign.objective)}
              subtitle={`${objectiveLabel(campaign.objective)} campaign for Demo Advertiser Co.`}
              actions={
                <>
                  <Button
                    variant="primary"
                    icon="sparkles"
                    onClick={generate}
                    disabled={busy}
                  >
                    {busy
                      ? 'Generating…'
                      : latest
                        ? 'Regenerate copy'
                        : 'Generate copy'}
                  </Button>
                  <Link href="/publishing" className="btn btn-ghost">
                    <Icon name="publishing" size={16} />
                    Go to Publishing
                  </Link>
                </>
              }
            />

            {/* Meta chips: status, version, restricted vertical */}
            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <StatusChip status={campaign.status} />
              <Chip tone="neutral" icon="doc">
                Version {campaign.version}
              </Chip>
              {campaign.vertical ? (
                <Chip tone="warning" icon="shield">
                  Restricted: {campaign.vertical}
                </Chip>
              ) : null}
              <span className="muted tnum" style={{ fontSize: 12.5 }}>
                Created {dateLabel(campaign.createdAt)}
              </span>
            </div>

            {/* Restricted-vertical warning */}
            {campaign.vertical ? (
              <Card
                className="card-pad row"
                style={{
                  marginTop: '1rem',
                  gap: '0.75rem',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  className="stat-ic"
                  style={{
                    background: 'var(--color-warning-soft)',
                    color: 'var(--color-warning)',
                  }}
                >
                  <Icon name="shield" size={16} />
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {objectiveLabel(campaign.vertical)} is a restricted vertical
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Every claim must link to an approved source and clear human review
                    before this campaign can publish. Generated copy stays in review
                    until then.
                  </div>
                </div>
              </Card>
            ) : null}

            {/* KPI strip */}
            <div className="grid grid-kpi" style={{ marginTop: '1rem' }}>
              <StatCard
                label="Status"
                value={
                  campaign.status
                    .toLowerCase()
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())
                }
                icon="shield"
                footNote="Draft → Review → Approved → Live"
              />
              <StatCard
                label="Current version"
                value={`v${latest?.version ?? campaign.version}`}
                icon="doc"
                footNote={
                  ordered.length > 1
                    ? `${ordered.length} versions generated`
                    : 'Latest generated copy'
                }
              />
              <StatCard
                label="Creative variants"
                value={variants?.length ?? 0}
                icon="creative"
                footNote={`${(variants ?? []).filter((v) => v.status === 'approved').length} approved`}
              />
              <StatCard
                label="Channels live"
                value={plans.length ? `${liveCount}/${plans.length}` : '—'}
                icon="globe"
                footNote={
                  plans.length ? `${readyCount} awaiting approval` : 'No publish plans yet'
                }
              />
            </div>

            {/* Launch cockpit — approve each channel to go live */}
            <div style={{ marginTop: '1rem' }}>
              <Panel
                title="Launch"
                note="approve a channel to push it live"
                actions={
                  readyCount > 0 ? (
                    <Button variant="primary" icon="publishing" onClick={launchAll} disabled={busy}>
                      {busy ? 'Launching…' : `Approve & launch all (${readyCount})`}
                    </Button>
                  ) : plans.length === 0 ? (
                    <Link href="/campaigns/new" className="btn btn-ghost">
                      <Icon name="plus" size={16} /> Set up channels
                    </Link>
                  ) : undefined
                }
              >
                {plans.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Channel</th>
                          <th>Account</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plans.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <Chip tone="brand" icon="globe">
                                {p.platform.replace(/_/g, ' ')}
                              </Chip>
                            </td>
                            <td className="cell-muted">{p.accountId ?? '—'}</td>
                            <td>
                              <StatusChip status={p.status} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {p.status === 'READY_FOR_REVIEW' ? (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  icon="check"
                                  onClick={() => approveAndPublish(p.id)}
                                  disabled={busy}
                                >
                                  Approve &amp; publish
                                </Button>
                              ) : p.status === 'IN_REVIEW' ? (
                                <span className="muted" style={{ fontSize: 12.5 }}>
                                  Awaiting platform review
                                </span>
                              ) : p.status === 'LIVE' ? (
                                <Chip tone="success" dot>
                                  Live
                                </Chip>
                              ) : (
                                <span className="cell-muted">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon="publishing"
                    title="No channels set up yet"
                    hint="Create the campaign through the setup wizard to draft a publish plan per platform, or add one in Publishing."
                    action={
                      <Link href="/publishing" className="btn btn-primary">
                        <Icon name="publishing" size={16} /> Go to Publishing
                      </Link>
                    }
                  />
                )}
              </Panel>
            </div>

            {/* Copy + creative */}
            <div className="grid grid-hero" style={{ marginTop: '1rem' }}>
              <Panel
                title="Generated ad copy"
                note={
                  snap?.generation?.model
                    ? `${snap.generation.model}${snap.generation.brandVoice ? ` · ${snap.generation.brandVoice}` : ''}`
                    : undefined
                }
                actions={<Chip tone="brand" icon="sparkles">AI-written</Chip>}
              >
                {copy ? (
                  <div className="card-pad stack" style={{ gap: '1rem' }}>
                    <CopyBlock label="Headline" value={copy.headline} />
                    <CopyBlock label="Offer" value={copy.offer} />
                    <CopyBlock label="Call to action" value={copy.cta} />

                    <hr className="divider" />
                    <div>
                      <div
                        className="field-label"
                        style={{ marginBottom: '0.5rem' }}
                      >
                        Claim verification
                      </div>
                      <div className="stack" style={{ gap: '0.5rem' }}>
                        {claims.length ? (
                          claims.map((cl, i) => (
                            <div
                              key={i}
                              className="spread"
                              style={{ gap: '0.75rem', alignItems: 'flex-start' }}
                            >
                              <span style={{ fontSize: 13 }}>{cl.text}</span>
                              {cl.supported ? (
                                <Chip tone="success" icon="check-circle">
                                  Verified
                                </Chip>
                              ) : (
                                <Chip tone="warning" icon="alert">
                                  Needs verification
                                </Chip>
                              )}
                            </div>
                          ))
                        ) : (
                          <span className="muted" style={{ fontSize: 13 }}>
                            No claims to verify yet.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon="sparkles"
                    title="No copy generated yet"
                    hint="Generate cross-platform ad copy from your product sources — every claim is checked against an approved source."
                    action={
                      <Button
                        variant="primary"
                        icon="sparkles"
                        onClick={generate}
                        disabled={busy}
                      >
                        {busy ? 'Generating…' : 'Generate copy'}
                      </Button>
                    }
                  />
                )}
              </Panel>

              <Panel
                title="Creative variants"
                note="one per placement"
                actions={
                  variants && variants.length ? (
                    <Chip tone="neutral">{variants.length}</Chip>
                  ) : undefined
                }
              >
                {variants && variants.length ? (
                  <div className="card-pad stack" style={{ gap: '0.75rem' }}>
                    {variants.map((v) => (
                      <div
                        key={v.id}
                        className="card card-pad spread"
                        style={{ gap: '0.75rem', alignItems: 'flex-start' }}
                      >
                        <div>
                          <div className="cell-strong" style={{ fontSize: 13.5 }}>
                            {typeof v.spec.headline === 'string'
                              ? v.spec.headline
                              : 'Untitled variant'}
                          </div>
                          <div
                            className="cell-muted"
                            style={{ fontSize: 12, marginTop: '0.15rem' }}
                          >
                            {formatLabel(v.format)}
                            {typeof v.spec.cta === 'string' ? ` · ${v.spec.cta}` : ''}
                          </div>
                        </div>
                        <StatusChip status={v.status} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon="creative"
                    title="No creative yet"
                    hint="Creative variants are built from approved copy — one per platform placement."
                  />
                )}
              </Panel>
            </div>

            {/* Version history */}
            <div style={{ marginTop: '1rem' }}>
              <Panel
                title="Version history"
                note="every generation is snapshotted"
              >
                {ordered.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="cell-num">Version</th>
                          <th>Model</th>
                          <th>Verified claims</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordered.map((ver) => {
                          const vs = ver.snapshot as CopySnapshot | undefined;
                          const vc = vs?.claims ?? [];
                          const vSup = vc.filter((c) => c.supported).length;
                          return (
                            <tr key={ver.id}>
                              <td className="cell-num cell-strong">
                                v{ver.version}
                              </td>
                              <td className="cell-muted">
                                {vs?.generation?.model ?? '—'}
                              </td>
                              <td className="cell-muted tnum">
                                {vc.length ? `${vSup}/${vc.length}` : '—'}
                              </td>
                              <td className="cell-muted tnum">
                                {dateLabel(ver.createdAt)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon="clock"
                    title="No versions yet"
                    hint="Generate copy to create the first snapshot."
                  />
                )}
              </Panel>
            </div>
          </>
        )}
      </DataState>
    </div>
  );
}

function CopyBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="field-label" style={{ marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>
        {value ? value : <span className="muted">—</span>}
      </div>
    </div>
  );
}
