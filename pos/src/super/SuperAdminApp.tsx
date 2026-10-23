// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getSuperToken, superApi, superErrorText } from './superApi';
import { StoresPage } from './StoresPage';
import { LeadsPage } from './LeadsPage';

/**
 * `/super` — the cross-store admin (TechDocs/POS_SUPER_ADMIN.md). Web shell
 * only, mounted outside the store-session guard: it is opened by whoever holds
 * `POS_SUPER_PASSWORD`, not by an owner of any one store.
 */
export function SuperAdminApp() {
  const [authed, setAuthed] = useState(() => Boolean(getSuperToken()));

  useEffect(() => superApi.onUnauthorized(() => setAuthed(false)), []);

  if (!authed) return <SuperLoginForm onDone={() => setAuthed(true)} />;
  return (
    <SuperShell
      onLogout={() => {
        superApi.logout();
        setAuthed(false);
      }}
    >
      <Routes>
        <Route index element={<StoresPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="*" element={<Navigate to="/super" replace />} />
      </Routes>
    </SuperShell>
  );
}

/**
 * Two tabs, each its own address so a link or a reload lands on the same one:
 * «Магазини» (`/super`) and «Ліди» (`/super/leads`, TechDocs/CRM_LEADS.md).
 */
const TABS = [
  { to: '/super', label: 'Магазини' },
  { to: '/super/leads', label: 'Ліди' },
] as const;

function SuperShell({ onLogout, children }: { onLogout: () => void; children: ReactNode }) {
  const { pathname } = useLocation();
  const current = pathname.replace(/\/+$/, '').startsWith('/super/leads') ? '/super/leads' : '/super';
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-lg font-semibold text-sq-text">Супер-адмін</h1>
          {/* Tab roles, as on «Вигляд меню»: what the tests and screen readers use. */}
          <nav role="tablist" aria-label="Розділ" className="inline-flex gap-1 p-[3px] rounded-xl bg-sq-empty">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                role="tab"
                aria-selected={current === t.to}
                className={`min-h-[34px] inline-flex items-center px-3.5 rounded-[9px] text-[15px] transition-colors ${
                  current === t.to
                    ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                    : 'font-medium text-sq-secondary hover:text-sq-text'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        <button type="button" className="rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary" onClick={onLogout}>
          Вийти
        </button>
      </div>
      {children}
    </div>
  );
}

function SuperLoginForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await superApi.login(password);
      setPassword('');
      onDone();
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-sq-bg px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-sq border border-sq-divider bg-sq-surface p-6">
        <div>
          <h1 className="text-lg font-semibold text-sq-text">Супер-адмін</h1>
          <p className="mt-1 text-sm text-sq-secondary">
            Усі магазини: модулі та їхні джерела. Пароль — <code>POS_SUPER_PASSWORD</code> сервера.
          </p>
        </div>
        <label className="block text-sm">
          <span className="text-sq-secondary">Пароль</span>
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text"
          />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" disabled={busy || !password} className="sq-btn-primary w-full py-2 disabled:opacity-50">
          {busy ? 'Вхід…' : 'Увійти'}
        </button>
      </form>
    </div>
  );
}
