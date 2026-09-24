// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useOfflineStatus, isOfflinePosEnabled } from '@pos/platform';
import { ClipboardCheck, Plus } from '@pos/platform/ui';
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
    <div className="flex-1 min-h-0 overflow-auto bg-sq-bg text-sq-text">
      <div className="mx-auto max-w-2xl px-4 md:px-7 pb-6">
        <div className="flex flex-wrap items-center gap-3 py-4 md:min-h-[72px]">
          <ClipboardCheck size={24} className="shrink-0" />
          <h1 className="text-2xl font-bold text-sq-heading">Інвентаризація</h1>
          <button
            type="button"
            className="pos-btn-primary ml-auto min-h-11 px-4 rounded-xl text-[15px] gap-1.5"
            onClick={create}
          >
            <Plus size={20} />
            Новий підрахунок
          </button>
        </div>
        <p className="text-[15px] text-sq-secondary leading-relaxed">
          Порахуйте товар сканером; завершений лист стане чернеткою інвентаризації, яку проведе
          власник.
          {isOfflinePosEnabled() && !online && ' Зараз офлайн — листи відправляться, щойно з’явиться мережа.'}
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {sheets.length === 0 ? (
          <div className="py-14 text-center">
            <ClipboardCheck size={48} className="mx-auto" />
            <p className="mt-3 text-[15px] text-sq-secondary">Ще немає жодного листа.</p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-sq-divider rounded-card bg-white shadow-card overflow-hidden">
            {sheets.map((sheet) => (
              <li key={sheet.id} className="flex items-center gap-3 pl-4 pr-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 min-h-[60px] py-2.5 text-left flex items-center gap-3"
                  onClick={() => navigate(`/stocktake/${sheet.id}`)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base text-sq-text tabular-nums">
                      {formatDate(sheet.createdAt)}
                    </span>
                    <span className="block text-[13px] text-sq-muted tabular-nums">
                      Рядків: {lineCounts[sheet.id] ?? 0}
                      {sheet.lastError && sheet.status !== 'synced' && (
                        <span className="ml-2 text-red-600">{sheet.lastError}</span>
                      )}
                    </span>
                  </span>
                  <SheetStatusBadge sheet={sheet} />
                </button>
                {sheet.status !== 'synced' && (
                  <button
                    type="button"
                    className="min-h-11 px-2.5 rounded-sq text-[15px] font-semibold text-red-600 hover:bg-sq-empty"
                    onClick={() => remove(sheet)}
                  >
                    Видалити
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
