// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Fragment, useCallback, useEffect, useState } from 'react';
import { remoteSummary, remoteUrlOf } from '../lib/moduleRemoteForm';
import { superApi, superErrorText, type SuperStoreRow } from './superApi';
import { StoreEditor } from './StoreEditor';
import { RepointPanel } from './RepointPanel';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
}

export function StoresPage({ onLogout }: { onLogout: () => void }) {
  const [stores, setStores] = useState<SuperStoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setStores(await superApi.listStores());
    } catch (err) {
      setError(superErrorText(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function replaceRow(row: SuperStoreRow) {
    setStores((prev) => (prev ? prev.map((s) => (s.id === row.id ? row : s)) : prev));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-sq-text">Супер-адмін · магазини</h1>
          <p className="text-sm text-sq-secondary">
            {stores ? `${stores.length} магазин(ів)` : 'Завантаження…'} · зміни модулів підхоплюються
            касами після наступного входу (баннер «Перезавантажити»).
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary" onClick={() => void reload()}>
            Оновити
          </button>
          <button type="button" className="rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary" onClick={onLogout}>
            Вийти
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {stores && stores.length > 0 && <RepointPanel stores={stores} onDone={reload} />}

      <div className="overflow-x-auto rounded-sq border border-sq-divider bg-sq-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs uppercase text-sq-secondary">
            <tr>
              <th className="px-3 py-2">Магазин</th>
              <th className="px-3 py-2">Модулі</th>
              <th className="px-3 py-2">Remote-модулі</th>
              <th className="px-3 py-2">ПРРО</th>
              <th className="px-3 py-2">TikTok</th>
              <th className="px-3 py-2 text-right">Продавці</th>
              <th className="px-3 py-2">Останній продаж</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sq-divider">
            {stores?.map((s) => (
              <Fragment key={s.id}>
                <tr className="align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-sq-text">{s.name}</div>
                    <div className="text-xs text-sq-secondary">
                      {s.slug} · #{s.id}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {s.enabled_modules.map((m) => (
                        <span key={m} className="rounded-sq bg-sq-bg px-1.5 py-0.5 text-xs text-sq-secondary">
                          {m}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {Object.keys(s.module_remotes).length === 0 ? (
                      <span className="text-xs text-sq-secondary">—</span>
                    ) : (
                      <ul className="space-y-0.5 text-xs">
                        {Object.entries(s.module_remotes).map(([id, value]) => (
                          <li key={id} className="text-sq-text" title={remoteUrlOf(value)}>
                            {remoteSummary(id, value)}
                            {typeof value === 'string' && <span className="text-sq-secondary"> (override)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.fiscal.enabled ? `увімк. · ${s.fiscal.provider ?? '?'}` : s.fiscal.provider ? `вимк. · ${s.fiscal.provider}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{s.live_tiktok_username ? `@${s.live_tiktok_username}` : '—'}</td>
                  <td className="px-3 py-2 text-right">{s.staff_count}</td>
                  <td className="px-3 py-2 text-xs">{formatDate(s.last_sale_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="rounded-sq border border-sq-divider px-2.5 py-1 text-xs text-sq-secondary hover:bg-sq-bg"
                      onClick={() => setOpen(open === s.id ? null : s.id)}
                    >
                      {open === s.id ? 'Згорнути' : 'Редагувати'}
                    </button>
                  </td>
                </tr>
                {open === s.id && (
                  <tr>
                    <td colSpan={8} className="bg-sq-bg px-3 py-3">
                      <StoreEditor store={s} onSaved={replaceRow} onClose={() => setOpen(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
