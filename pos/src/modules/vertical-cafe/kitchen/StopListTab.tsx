// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Стоп-лист» — what the kitchen is not making today (К3b/К3c). One row per
// product with a switch; the day's list forgets itself at the store's
// midnight, on the server. The stock-driven «немає» is shown as its own
// reason beside the switch, so the barista sees both and confuses neither.

import { useCallback, useEffect, useState } from 'react';
import { assetUrl } from '@pos/platform';
import { refreshCatalog } from '../lib/hostPlatform';
import * as kitchenApi from './kitchenApi';
import { groupStopList, serverMessage, type StopListEntry } from './lib/kitchen';

export function StopListTab({ onCount }: { onCount?: (stopped: number) => void } = {}) {
  const [rows, setRows] = useState<StopListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(groupStopList(await kitchenApi.menu()));
      setError(null);
    } catch (err) {
      setError(serverMessage(err, 'Не вдалося прочитати меню'));
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The header's «Стоп-лист · 2» follows every switch made here.
  useEffect(() => {
    if (rows) onCount?.(rows.filter((r) => r.stop_listed).length);
  }, [rows, onCount]);

  async function toggle(row: StopListEntry): Promise<void> {
    setBusy(row.product_id);
    try {
      const next = await kitchenApi.setStopListed(row.product_id, !row.stop_listed);
      setRows((prev) =>
        (prev ?? []).map((r) =>
          r.product_id === row.product_id ? { ...r, stop_listed: next.stop_listed } : r
        )
      );
      setError(null);
      // The sell screen draws from the host's catalog — on the desktop, its
      // mirror. Ask for a re-read so the tile greys now, not at the next one.
      await refreshCatalog();
    } catch (err) {
      setError(serverMessage(err, 'Не вдалося змінити стоп-лист'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto px-4 md:px-7 pb-6 space-y-3 max-w-3xl" data-testid="kitchen-stop-list">
      <p className="text-sm text-sq-secondary">
        Чого сьогодні не робимо. Знімається само опівночі; плитка на касі сіріє з підписом «стоп».
      </p>
      {error && (
        <p className="text-sm text-red-600" data-testid="stop-list-error">
          {error}
        </p>
      )}
      {rows === null && <p className="text-sm text-sq-muted">Завантаження…</p>}
      {rows !== null && rows.length === 0 && (
        <p className="rounded-card bg-white/60 p-6 text-center text-sm text-sq-muted">Меню порожнє</p>
      )}
      <ul className="divide-y divide-sq-divider rounded-card bg-white shadow-card overflow-hidden">
        {(rows ?? []).map((row) => {
          const src = assetUrl(row.image_url);
          return (
            <li
              key={row.product_id}
              className="flex items-center gap-3 px-4 py-2.5"
              data-testid={`stop-list-${row.product_id}`}
            >
              <div className="w-11 h-11 rounded-xl bg-sq-empty overflow-hidden shrink-0">
                {src && <img src={src} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-base font-semibold truncate ${row.stop_listed ? 'text-sq-muted line-through' : 'text-sq-text'}`}>
                  {row.name}
                </p>
                {row.stock <= 0 && <p className="text-[13px] text-sq-muted">немає — закінчилось</p>}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={row.stop_listed}
                aria-label={`Стоп-лист: ${row.name}`}
                disabled={busy === row.product_id}
                onClick={() => void toggle(row)}
                data-testid={`stop-list-toggle-${row.product_id}`}
                className={`min-h-11 min-w-24 rounded-sq px-3 text-[15px] font-semibold ${
                  row.stop_listed ? 'bg-sq-danger text-white' : 'bg-sq-empty text-sq-text hover:bg-sq-selected'
                }`}
              >
                {row.stop_listed ? 'Стоп' : 'Робимо'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
