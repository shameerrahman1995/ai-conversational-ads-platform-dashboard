'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginRequest } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { Icon } from '@/components/Icon';

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useOrg();
  const [email, setEmail] = useState('srahman@hodos360.ai');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await loginRequest(email.trim(), password);
      signIn(token, user.orgId, user.role);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--color-canvas)',
        padding: '1.5rem',
      }}
    >
      <div className="card card-pad" style={{ width: 380, maxWidth: '100%' }}>
        <div className="row" style={{ gap: '0.6rem', marginBottom: '1.25rem' }}>
          <span className="rail-brand-mark">
            <Icon name="message" size={17} />
          </span>
          <span>
            <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              ConvoAds
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              Sign in to your workspace
            </span>
          </span>
        </div>

        <form onSubmit={submit} className="stack" style={{ gap: '0.85rem' }}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </label>

          {error ? (
            <div className="chip chip-danger" style={{ alignSelf: 'stretch', justifyContent: 'center' }}>
              <Icon name="alert" size={12} /> {error}
            </div>
          ) : null}

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="muted" style={{ fontSize: 12, marginTop: '1rem', textAlign: 'center' }}>
          Demo: <strong>srahman@hodos360.ai</strong> / <strong>demo1234</strong>
        </div>
      </div>
    </div>
  );
}
