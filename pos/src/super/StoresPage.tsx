// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Fragment, useCallback, useEffect, useState } from 'react';
import { remoteSummary, remoteUrlOf } from '../lib/moduleRemoteForm';
import { verticalTitle } from '../lib/vertical';
import { superApi, superErrorText, type SuperStoreRow } from './superApi';
import { StoreEditor } from './StoreEditor';
import { RepointPanel } from './RepointPanel';
import { NewStoreDialog } from './NewStoreDialog';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
}

export function StoresPage() {
  const [stores, setStores] = useState<SuperStoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  // What to hand the new owner: never the password, which only the super admin typed.
  const [handover, setHandover] = useState<{ store: SuperStoreRow; login: string } | null>(null);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-sq-secondary">
            {stores ? `${stores.length} магазин(ів)` : 'Завантаження…'} · зміни модулів підхоплюються
            касами після наступного входу (баннер «Перезавантажити»).
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary" onClick={() => void reload()}>
            Оновити
          </button>
          <button type="button" className="sq-btn-primary px-3 py-1.5 text-sm" disabled={!stores} onClick={() => setCreating(true)}>
            Новий магазин
          </button>
        </div>
      </div>

      {handover && (
        <div role="status" className="rounded-sq border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">Магазин «{handover.store.name}» відкрито.</p>
              <p>
                Передайте власнику: адреса <span className="font-mono">{window.location.host}</span>, код магазину{' '}
                <span className="font-mono">{handover.store.slug}</span>, логін <span className="font-mono">{handover.login}</span>.
                Пароль — той, що ви ввели: тут він не показується.
              </p>
            </div>
            <button type="button" className="text-emerald-800 underline" onClick={() => setHandover(null)}>
              Закрити
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {stores && stores.length > 0 && <RepointPanel stores={stores} onDone={reload} />}

      <div className="overflow-x-auto rounded-sq border border-sq-divider bg-sq-surface">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="text-left text-xs uppercase text-sq-secondary">
            <tr>
              <th className="px-3 py-2">Магазин</th>
              <th className="px-3 py-2">Тип</th>
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
                  <td className="px-3 py-2 text-xs text-sq-text">{verticalTitle(s.vertical)}</td>
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
                    <td colSpan={9} className="bg-sq-bg px-3 py-3">
                      <StoreEditor store={s} onSaved={replaceRow} onClose={() => setOpen(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {creating && stores && (
        <NewStoreDialog
          stores={stores}
          onClose={() => setCreating(false)}
          onCreated={(store, login) => {
            setStores((prev) => (prev ? [...prev, store] : [store]));
            setCreating(false);
            setHandover({ store, login });
          }}
        />
      )}
    </div>
  );
}
