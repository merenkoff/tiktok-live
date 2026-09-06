// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { CloudOff } from 'lucide-react';
import { syncModuleRemote } from '../lib/moduleRemotes';

interface Props {
  moduleId: string;
  title: string;
  /** The store's `module_remotes` URL for this module — passed to the Rust sync. */
  url: string;
}

/**
 * Shown for an online-only feature module (roadmap #13 Part C) that a store has
 * enabled via `module_remotes` but the desktop cashier hasn't downloaded yet
 * (cold offline first run). "Спробувати зараз" re-runs the Rust
 * download/verify/cache (`sync_module_remote`, Part B) and reloads on success.
 */
export function RemoteModuleUnavailablePage({ moduleId, title, url }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function retry() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await syncModuleRemote(moduleId, url);
      if (res.active != null) {
        window.location.reload();
        return;
      }
    } catch {
      /* fall through to the failure note */
    }
    setFailed(true);
    setBusy(false);
  }

  return (
    <div className="min-h-screen grid place-items-center px-6 text-center">
      <div className="max-w-sm">
        <CloudOff size={44} strokeWidth={1.5} className="mx-auto text-sq-secondary" />
        <h1 className="mt-4 text-lg font-semibold text-sq-text">
          Модуль «{title}» ще не завантажено
        </h1>
        <p className="mt-2 text-sm text-sq-secondary">
          Підключіться до інтернету — модуль завантажиться автоматично при наступному вході.
        </p>
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="mt-5 min-h-10 px-4 rounded-sq bg-sq-blue text-white font-semibold text-sm disabled:opacity-50"
        >
          {busy ? 'Завантаження…' : 'Спробувати зараз'}
        </button>
        {failed && (
          <p className="mt-3 text-sm text-red-600">Все ще немає з'єднання. Спробуйте пізніше.</p>
        )}
      </div>
    </div>
  );
}
