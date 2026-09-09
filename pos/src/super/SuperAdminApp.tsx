// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useState } from 'react';
import { getSuperToken, superApi, superErrorText } from './superApi';
import { StoresPage } from './StoresPage';

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
    <StoresPage
      onLogout={() => {
        superApi.logout();
        setAuthed(false);
      }}
    />
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
