'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * Dev tenant/role context. The MVP API auth stub is header-based
 * (`x-org-id` + `x-user-role`); this provider holds the currently selected
 * values so any client component can build a scoped API client via `useApiClient`.
 */
export interface OrgContextValue {
  orgId: string;
  role: string;
  token: string | null;
  /** True when the signed-in user is a cross-org platform super-admin (from the JWT). */
  platformAdmin: boolean;
  /** True once localStorage has been read on the client (so guards don't act pre-hydration). */
  ready: boolean;
  setOrg: (orgId: string) => void;
  setRole: (role: string) => void;
  /** Store a login JWT and adopt its org/role (and platform-admin flag). */
  signIn: (token: string, orgId: string, role: string, platformAdmin?: boolean) => void;
  signOut: () => void;
  /** Non-null while a platform admin is viewing a tenant via impersonation. */
  impersonating: { orgId: string; orgName: string } | null;
  /** Enter a tenant with a scoped token (stashes the super-admin session). */
  startImpersonation: (token: string, org: { id: string; name: string }) => void;
  /** Leave impersonation and restore the super-admin session. */
  exitImpersonation: () => void;
}

const ORG_KEY = 'acp-org';
const ROLE_KEY = 'acp-role';
const TOKEN_KEY = 'acp-token';
const PLATFORM_KEY = 'acp-platform-admin';
const IMP_KEY = 'acp-imp-org'; // { orgId, orgName } while impersonating
const IMPERSONATOR_KEY = 'acp-impersonator'; // stashed super-admin session for restore-on-exit
const DEFAULT_ORG = 'org_demo';
const DEFAULT_ROLE = 'admin';

const OrgContext = createContext<OrgContextValue | null>(null);

function readStored(key: string, fallback: string): string {
  try {
    if (typeof window === 'undefined') return fallback;
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  } catch {
    /* localStorage unavailable (private mode, disabled, etc.) — ignore. */
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  // Start from defaults so server and first client render agree, then hydrate
  // from localStorage after mount to avoid an SSR/client mismatch.
  const [orgId, setOrgState] = useState<string>(DEFAULT_ORG);
  const [role, setRoleState] = useState<string>(DEFAULT_ROLE);
  const [token, setTokenState] = useState<string | null>(null);
  const [platformAdmin, setPlatformAdminState] = useState(false);
  const [impersonating, setImpersonating] = useState<{ orgId: string; orgName: string } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOrgState(readStored(ORG_KEY, DEFAULT_ORG));
    setRoleState(readStored(ROLE_KEY, DEFAULT_ROLE));
    setPlatformAdminState(readStored(PLATFORM_KEY, '') === 'true');
    const t = readStored(TOKEN_KEY, '');
    if (t) setTokenState(t);
    const imp = readStored(IMP_KEY, '');
    if (imp) {
      try {
        setImpersonating(JSON.parse(imp));
      } catch {
        /* corrupt marker — ignore */
      }
    }
    setReady(true);
  }, []);

  const setOrg = (next: string) => {
    setOrgState(next);
    writeStored(ORG_KEY, next);
  };

  const setRole = (next: string) => {
    setRoleState(next);
    writeStored(ROLE_KEY, next);
  };

  const signIn = (nextToken: string, nextOrg: string, nextRole: string, nextPlatformAdmin = false) => {
    setTokenState(nextToken);
    writeStored(TOKEN_KEY, nextToken);
    setPlatformAdminState(nextPlatformAdmin);
    writeStored(PLATFORM_KEY, nextPlatformAdmin ? 'true' : 'false');
    setOrg(nextOrg);
    setRole(nextRole);
  };

  const startImpersonation = (impToken: string, org: { id: string; name: string }) => {
    // Stash the current super-admin session so exit can restore it.
    writeStored(IMPERSONATOR_KEY, JSON.stringify({ token, orgId, role, platformAdmin }));
    // Adopt the scoped tenant token — while impersonating we are NOT a platform admin.
    setTokenState(impToken);
    writeStored(TOKEN_KEY, impToken);
    setPlatformAdminState(false);
    writeStored(PLATFORM_KEY, 'false');
    setOrg(org.id);
    setRole('admin');
    const marker = { orgId: org.id, orgName: org.name };
    setImpersonating(marker);
    writeStored(IMP_KEY, JSON.stringify(marker));
  };

  const exitImpersonation = () => {
    const raw = readStored(IMPERSONATOR_KEY, '');
    if (raw) {
      try {
        const s = JSON.parse(raw) as { token: string | null; orgId: string; role: string; platformAdmin: boolean };
        setTokenState(s.token);
        writeStored(TOKEN_KEY, s.token ?? '');
        setPlatformAdminState(!!s.platformAdmin);
        writeStored(PLATFORM_KEY, s.platformAdmin ? 'true' : 'false');
        setOrg(s.orgId);
        setRole(s.role);
      } catch {
        /* corrupt stash — fall through to clearing */
      }
    }
    writeStored(IMPERSONATOR_KEY, '');
    writeStored(IMP_KEY, '');
    setImpersonating(null);
  };

  const signOut = () => {
    setTokenState(null);
    writeStored(TOKEN_KEY, '');
    setPlatformAdminState(false);
    writeStored(PLATFORM_KEY, 'false');
    setImpersonating(null);
    writeStored(IMP_KEY, '');
    writeStored(IMPERSONATOR_KEY, '');
  };

  return (
    <OrgContext.Provider
      value={{
        orgId,
        role,
        token,
        platformAdmin,
        ready,
        setOrg,
        setRole,
        signIn,
        signOut,
        impersonating,
        startImpersonation,
        exitImpersonation,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error('useOrg must be used within an <OrgProvider>');
  }
  return ctx;
}
