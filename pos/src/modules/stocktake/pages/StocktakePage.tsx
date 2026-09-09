// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useOfflineStatus, isOfflinePosEnabled } from '@pos/platform';
import type { SheetRow } from '../data/db';
import { discardSheet, listSheets, startSheet } from '../data/repository';
import { db } from '../data/db';
import { SheetStatusBadge } from '../components/SheetStatusBadge';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
}

/** The list of this store's count sheets on this device, newest first. */
export function StocktakePage() {
  const auth = useAuthStore((s) => s.auth);
  const online = useOfflineStatus((s) => s.online);
  const navigate = useNavigate();
  const [sheets, setSheets] = useState<SheetRow[]>([]);
  const [lineCounts, setLineCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const storeId = auth?.store.id ?? null;

  const reload = useCallback(async () => {
    if (storeId == null) return;
    const rows = await listSheets(storeId);
    const counts: Record<string, number> = {};
    await Promise.all(
      rows.map(async (r) => {
        counts[r.id] = await db.lines.where('sheetId').equals(r.id).count();
      })
    );
    setSheets(rows);
    setLineCounts(counts);
  }, [storeId]);

  // Sync writes status changes from the shell's tick, not from this page —
  // a light poll keeps the badges honest without a live-query dependency.
  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(timer);
  }, [reload]);

  async function create() {
    if (!auth) return;
    setError(null);
    try {
      const sheet = await startSheet({ storeId: auth.store.id, staffId: auth.staff.id });
      navigate(`/stocktake/${sheet.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function remove(sheet: SheetRow) {
    setError(null);
    try {
      await discardSheet(sheet.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-sq-text">Інвентаризація</h1>
        <button type="button" className="sq-btn-primary px-4 py-2" onClick={create}>
          Новий підрахунок
        </button>
      </div>
      <p className="mt-1 text-sm text-sq-secondary">
        Порахуйте товар сканером; завершений лист стане чернеткою інвентаризації, яку проведе
        власник.
        {isOfflinePosEnabled() && !online && ' Зараз офлайн — листи відправляться, щойно з’явиться мережа.'}
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <ul className="mt-4 divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface">
        {sheets.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-sq-secondary">Ще немає жодного листа.</li>
        )}
        {sheets.map((sheet) => (
          <li key={sheet.id} className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => navigate(`/stocktake/${sheet.id}`)}
            >
              <div className="flex items-center gap-2">
                <SheetStatusBadge sheet={sheet} />
                <span className="text-sm text-sq-secondary">{formatDate(sheet.createdAt)}</span>
              </div>
              <div className="mt-1 text-sm text-sq-text">
                Рядків: {lineCounts[sheet.id] ?? 0}
                {sheet.lastError && sheet.status !== 'synced' && (
                  <span className="ml-2 text-xs text-red-600">{sheet.lastError}</span>
                )}
              </div>
            </button>
            {sheet.status !== 'synced' && (
              <button
                type="button"
                className="px-2 py-1 text-xs text-sq-secondary hover:text-red-600"
                onClick={() => remove(sheet)}
              >
                Видалити
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
