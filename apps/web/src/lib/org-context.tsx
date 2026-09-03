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
  setOrg: (orgId: string) => void;
  setRole: (role: string) => void;
}

const ORG_KEY = 'acp-org';
const ROLE_KEY = 'acp-role';
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

  useEffect(() => {
    setOrgState(readStored(ORG_KEY, DEFAULT_ORG));
    setRoleState(readStored(ROLE_KEY, DEFAULT_ROLE));
  }, []);

  const setOrg = (next: string) => {
    setOrgState(next);
    writeStored(ORG_KEY, next);
  };

  const setRole = (next: string) => {
    setRoleState(next);
    writeStored(ROLE_KEY, next);
  };

  return (
    <OrgContext.Provider value={{ orgId, role, setOrg, setRole }}>
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
