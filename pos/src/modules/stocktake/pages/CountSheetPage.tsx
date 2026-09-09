// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isOfflinePosEnabled, useOfflineStatus } from '@pos/platform';
import type { CatalogItem } from '@pos/platform';

// Loaded only when the camera is opened: `html5-qrcode` behind `BarcodeScanner`
// is ~650 KB, and a USB scanner (a keyboard, as far as the page knows) is the
// common case on a till — the scan input above needs none of it.
const BarcodeScanner = lazy(() =>
  import('@pos/platform/ui').then((m) => ({ default: m.BarcodeScanner }))
);
import type { LineRow, SheetRow } from '../data/db';
import {
  addCount,
  finishSheet,
  getSheet,
  listLines,
  lookupByBarcode,
  removeLine,
  searchCatalog,
  setCount,
} from '../data/repository';
import { syncSheets } from '../data/sync';
import { SheetStatusBadge } from '../components/SheetStatusBadge';

/** One count sheet: scan, search, adjust, finish. Read-only once it left the till. */
export function CountSheetPage() {
  const { id = '' } = useParams();
  const online = useOfflineStatus((s) => s.online);
  const [sheet, setSheet] = useState<SheetRow | null | undefined>(undefined);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [scan, setScan] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [camera, setCamera] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const [s, l] = await Promise.all([getSheet(id), listLines(id)]);
    setSheet(s ?? null);
    setLines(l);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Once the sheet is out of our hands, follow its status as the sync writes it.
  useEffect(() => {
    if (!sheet || sheet.status === 'counting' || sheet.status === 'synced' || sheet.status === 'dead') return;
    const timer = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(timer);
  }, [sheet, reload]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchCatalog(q).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const counting = sheet?.status === 'counting';

  async function add(item: CatalogItem, delta = 1) {
    setError(null);
    try {
      await addCount(id, item, delta);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScan('');
    setNotice(null);
    try {
      const item = await lookupByBarcode(trimmed);
      if (!item) {
        setNotice(`Штрихкод ${trimmed} не знайдено в каталозі`);
        return;
      }
      await add(item);
      setNotice(`+1 · ${item.product_name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      scanRef.current?.focus();
    }
  }

  async function adjust(line: LineRow, delta: number) {
    setError(null);
    try {
      await setCount(id, line.variantId, line.countedQty + delta);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function typed(line: LineRow, value: string) {
    const qty = Number(value);
    if (!Number.isFinite(qty)) return;
    await setCount(id, line.variantId, qty).catch(() => undefined);
    await reload();
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await finishSheet(id);
      // The web shell has no offline runtime to pick the sheet up — ship it now.
      // On the till the shell's next tick does it; `syncSheets` is re-entrant
      // safe either way, so calling it here too just shortens the wait.
      await syncSheets();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  if (sheet === undefined) {
    return <div className="px-4 py-6 text-sm text-sq-secondary">Завантаження…</div>;
  }
  if (sheet === null) {
    return (
      <div className="px-4 py-6 text-sm text-sq-secondary">
        Лист не знайдено. <Link to="/stocktake" className="underline">До списку</Link>
      </div>
    );
  }

  const total = lines.reduce((sum, l) => sum + l.countedQty, 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/stocktake" className="text-sm text-sq-secondary hover:text-sq-text">
            ← Листи
          </Link>
          <SheetStatusBadge sheet={sheet} />
        </div>
        <span className="text-sm text-sq-secondary">
          {lines.length} поз. · {total} шт.
        </span>
      </div>

      {sheet.status === 'synced' && (
        <p className="mt-3 rounded-sq bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Надіслано як чернетку інвентаризації {sheet.serverDocNumber ?? ''}. Провести її може
          власник у розділі «Склад».
        </p>
      )}
      {(sheet.status === 'queued' || sheet.status === 'error') && (
        <p className="mt-3 rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {isOfflinePosEnabled() && !online
            ? 'Офлайн. Лист у черзі — відправиться автоматично, щойно з’явиться мережа.'
            : 'Лист у черзі на відправлення.'}
          {sheet.lastError && ` (${sheet.lastError})`}
        </p>
      )}
      {sheet.status === 'dead' && (
        <p className="mt-3 rounded-sq bg-red-50 px-3 py-2 text-sm text-red-800">
          Сервер відхилив лист: {sheet.lastError ?? 'невідома помилка'}. Видаліть його і порахуйте
          знову.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {counting && (
        <div className="mt-4 space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleScan(scan);
            }}
          >
            <input
              ref={scanRef}
              autoFocus
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder="Скануйте штрихкод або введіть його"
              inputMode="numeric"
              aria-label="Штрихкод"
              className="min-w-0 flex-1 rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text"
            />
            <button type="submit" className="sq-btn-primary px-3 py-2">
              +1
            </button>
            <button
              type="button"
              className="rounded-sq border border-sq-divider px-3 py-2 text-sm text-sq-secondary"
              onClick={() => setCamera((v) => !v)}
            >
              {camera ? 'Закрити камеру' : 'Камера'}
            </button>
          </form>
          {camera && (
            <Suspense fallback={<p className="text-sm text-sq-secondary">Вмикаю камеру…</p>}>
              <BarcodeScanner
                onScan={(code) => void handleScan(code)}
                onClose={() => setCamera(false)}
              />
            </Suspense>
          )}
          {notice && <p className="text-sm text-sq-secondary">{notice}</p>}

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Або знайдіть за назвою / артикулом"
            aria-label="Пошук товару"
            className="w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text"
          />
          {results.length > 0 && (
            <ul className="divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface">
              {results.map((item) => (
                <li key={item.variant_id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                    onClick={() => {
                      void add(item);
                      setQuery('');
                    }}
                  >
                    <span className="text-sq-text">
                      {item.product_name} · {item.size} · {item.color}
                    </span>
                    <span className="text-sq-secondary">+1</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="mt-4 divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface">
        {lines.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-sq-secondary">
            {counting ? 'Відскануйте перший товар.' : 'Порожній лист.'}
          </li>
        )}
        {lines.map((line) => (
          <li key={line.variantId} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-sq-text">{line.label}</div>
              {line.barcode && <div className="text-xs text-sq-secondary">{line.barcode}</div>}
            </div>
            {counting ? (
              <>
                <button
                  type="button"
                  aria-label="Менше"
                  className="h-9 w-9 rounded-sq border border-sq-divider text-sq-text"
                  onClick={() => adjust(line, -1)}
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={line.countedQty}
                  aria-label={`Кількість: ${line.label}`}
                  onChange={(e) => void typed(line, e.target.value)}
                  className="h-9 w-16 rounded-sq border border-sq-divider bg-sq-bg text-center text-sm text-sq-text"
                />
                <button
                  type="button"
                  aria-label="Більше"
                  className="h-9 w-9 rounded-sq border border-sq-divider text-sq-text"
                  onClick={() => adjust(line, 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label="Прибрати"
                  className="px-2 text-xs text-sq-secondary hover:text-red-600"
                  onClick={() => void removeLine(id, line.variantId).then(reload)}
                >
                  ✕
                </button>
              </>
            ) : (
              <span className="w-16 text-right text-sm font-medium text-sq-text">{line.countedQty}</span>
            )}
          </li>
        ))}
      </ul>

      {counting && (
        <button
          type="button"
          disabled={busy || lines.length === 0}
          className="sq-btn-primary mt-4 w-full py-3 disabled:opacity-50"
          onClick={finish}
        >
          {busy ? 'Відправляю…' : 'Завершити і відправити'}
        </button>
      )}
    </div>
  );
}
