'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AgentSummary, CampaignSummary, LeadSummary } from '@acp/api-client';
import { Icon, type IconName } from './Icon';
import { useApiClient } from '@/lib/api';

/**
 * Global top-bar search. Lazily loads campaigns, leads and agents on first
 * focus, then filters them client-side as the user types (debounced) and shows
 * a grouped results dropdown. Selecting a result navigates to it. Fetches that
 * fail degrade to an empty category, so the worst case is simply "No results".
 */

interface Result {
  key: string;
  kind: 'Campaign' | 'Lead' | 'Agent';
  label: string;
  sub?: string;
  href: string;
  icon: IconName;
}

interface Loaded {
  campaigns: CampaignSummary[];
  leads: LeadSummary[];
  agents: AgentSummary[];
}

const EMPTY: Loaded = { campaigns: [], leads: [], agents: [] };
const MAX_PER_GROUP = 5;

function matches(query: string, fields: (string | null | undefined)[]): boolean {
  return fields.some((f) => !!f && f.toLowerCase().includes(query));
}

export function SearchBar() {
  const api = useApiClient();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<Loaded>(EMPTY);
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the query — filtering runs over already-loaded lists in memory.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 160);
    return () => clearTimeout(t);
  }, [query]);

  // Invalidate the cache if the tenant/role context (and thus the client) changes.
  useEffect(() => {
    setLoaded(false);
    setData(EMPTY);
  }, [api]);

  // Close when focus/click leaves the component.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  async function ensureLoaded() {
    if (loaded || loading) return;
    setLoading(true);
    const [c, l, a] = await Promise.allSettled([
      api.campaigns.list(),
      api.leads.list(),
      api.agents.list(),
    ]);
    setData({
      campaigns: c.status === 'fulfilled' ? c.value : [],
      leads: l.status === 'fulfilled' ? l.value : [],
      agents: a.status === 'fulfilled' ? a.value : [],
    });
    setLoaded(true);
    setLoading(false);
  }

  const results = useMemo<Result[]>(() => {
    const q = debounced;
    if (!q) return [];

    const campaigns = data.campaigns
      .filter((c) => matches(q, [c.name, c.objective, c.vertical, c.id]))
      .slice(0, MAX_PER_GROUP)
      .map<Result>((c) => ({
        key: `campaign-${c.id}`,
        kind: 'Campaign',
        label: c.name || c.objective || c.id,
        sub: c.vertical || c.objective || undefined,
        href: `/campaigns/${c.id}`,
        icon: 'campaigns',
      }));

    const agents = data.agents
      .filter((a) => matches(q, [a.name, a.campaignName, a.vertical, a.model]))
      .slice(0, MAX_PER_GROUP)
      .map<Result>((a) => ({
        key: `agent-${a.id}`,
        kind: 'Agent',
        label: a.name,
        sub: a.campaignName || undefined,
        href: '/agents',
        icon: 'agents',
      }));

    const leads = data.leads
      .filter((l) =>
        matches(q, [
          l.id,
          l.agentSummary,
          l.crmId,
          l.conversationId,
          l.lifecycleStage,
          l.qualificationLevel,
        ]),
      )
      .slice(0, MAX_PER_GROUP)
      .map<Result>((l) => ({
        key: `lead-${l.id}`,
        kind: 'Lead',
        label: l.agentSummary?.trim() || `Lead ${l.id.slice(0, 8)}`,
        sub: l.qualificationLevel || l.lifecycleStage || undefined,
        href: '/leads',
        icon: 'leads',
      }));

    return [...campaigns, ...agents, ...leads];
  }, [debounced, data]);

  // Keep the active row in range whenever the result set changes.
  useEffect(() => {
    setActive(0);
  }, [debounced, results.length]);

  const showPanel = open && query.trim().length > 0;

  function close(clear = false) {
    setOpen(false);
    if (clear) setQuery('');
  }

  function select(href: string) {
    close(true);
    inputRef.current?.blur();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      close();
      inputRef.current?.blur();
      return;
    }
    if (!showPanel || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const r = results[active];
      if (r) {
        e.preventDefault();
        select(r.href);
      }
    }
  }

  return (
    <div className="searchbar" ref={rootRef}>
      <div className="searchbar-field">
        <Icon name="search" size={15} />
        <input
          ref={inputRef}
          className="searchbar-input"
          type="search"
          value={query}
          placeholder="Search campaigns, leads, agents…"
          aria-label="Search campaigns, leads and agents"
          aria-expanded={showPanel}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => {
            setOpen(true);
            void ensureLoaded();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="searchbar-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <Icon name="x" size={14} />
          </button>
        ) : null}
      </div>

      {showPanel ? (
        <div className="search-panel" role="listbox" aria-label="Search results">
          {loading && !loaded ? (
            <div className="search-msg">
              <span className="spin" aria-hidden="true" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="search-msg">No results</div>
          ) : (
            results.map((r, i) => {
              const showHeader = i === 0 || results[i - 1].kind !== r.kind;
              return (
                <div key={r.key}>
                  {showHeader ? <div className="search-group">{r.kind}s</div> : null}
                  <Link
                    href={r.href}
                    role="option"
                    aria-selected={i === active}
                    className={`search-item ${i === active ? 'search-item--active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => close(true)}
                  >
                    <span className="search-item-ic">
                      <Icon name={r.icon} size={15} />
                    </span>
                    <span className="search-item-main">
                      <span className="search-item-label">{r.label}</span>
                      {r.sub ? <span className="search-item-sub">{r.sub}</span> : null}
                    </span>
                    <span className="search-item-kind">{r.kind}</span>
                  </Link>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
