// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  isOfflinePosEnabled,
  packOf,
  QuantityUnitToggle,
  quantityToBase,
  useOfflineStatus,
} from '@pos/platform';
import type { CatalogItem, PackMode } from '@pos/platform';

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
  lineLabel,
  listLines,
  lookupByBarcode,
  removeLine,
  searchCatalog,
  setCount,
} from '../data/repository';
import { syncSheets } from '../data/sync';
import { SheetStatusBadge } from '../components/SheetStatusBadge';
import { ArrowLeft, Camera, Minus, Plus, ScanLine, X } from '@pos/platform/ui';

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
  // Which rows are being counted in packs. Base units is the start here —
  // what is counted on a shelf is 200 ml, not 0.2 of a bottle — and the row
  // only offers the switch when the variant has a pack at all.
  const [packModes, setPackModes] = useState<Record<number, PackMode>>({});
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
  const packModeOf = (variantId: number): PackMode => packModes[variantId] ?? 'base';
  const linePack = (line: LineRow) =>
    packOf({ pack_qty: line.packQty, pack_label: line.packLabel });

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
      // One tap is one PACK when the row counts packs — «+1» next to a bottle
      // that meant one millilitre would be useless.
      const pack = linePack(line);
      const step = packModeOf(line.variantId) === 'pack' && pack ? delta * pack.qty : delta;
      await setCount(id, line.variantId, line.countedQty + step);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function typed(line: LineRow, value: string) {
    const typedQty = Number(value);
    if (!Number.isFinite(typedQty)) return;
    // Base units are what is stored and what is sent; the box is only how it
    // was typed.
    const qty = quantityToBase(typedQty, packModeOf(line.variantId), linePack(line));
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
    return <div className="px-4 md:px-7 py-6 text-sm text-sq-secondary">Завантаження…</div>;
  }
  if (sheet === null) {
    return (
      <div className="px-4 md:px-7 py-6 text-[15px] text-sq-secondary">
        Лист не знайдено.{' '}
        <Link to="/stocktake" className="font-semibold text-sq-blue">
          До списку
        </Link>
      </div>
    );
  }

  const total = lines.reduce((sum, l) => sum + l.countedQty, 0);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-sq-bg text-sq-text">
      <div className="mx-auto max-w-2xl px-4 md:px-7 pb-6">
        <div className="flex flex-wrap items-center gap-3 py-4 md:min-h-[72px]">
          <Link
            to="/stocktake"
            className="-ml-1 inline-flex items-center gap-1 min-h-11 pr-1 text-[15px] font-semibold text-sq-blue"
          >
            <ArrowLeft size={20} aria-hidden />
            Листи
          </Link>
          <SheetStatusBadge sheet={sheet} />
          <span className="ml-auto text-[15px] text-sq-muted tabular-nums">
            {lines.length} поз. · {total} шт.
          </span>
        </div>

        {sheet.status === 'synced' && (
          <p className="mb-3 rounded-xl bg-sq-success/10 px-4 py-3 text-sm text-sq-success-ink">
            Надіслано як чернетку інвентаризації {sheet.serverDocNumber ?? ''}. Провести її може
            власник у розділі «Склад».
          </p>
        )}
        {(sheet.status === 'queued' || sheet.status === 'error') && (
          <p className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {isOfflinePosEnabled() && !online
              ? 'Офлайн. Лист у черзі — відправиться автоматично, щойно з’явиться мережа.'
              : 'Лист у черзі на відправлення.'}
            {sheet.lastError && ` (${sheet.lastError})`}
          </p>
        )}
        {sheet.status === 'dead' && (
          <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Сервер відхилив лист: {sheet.lastError ?? 'невідома помилка'}. Видаліть його і порахуйте
            знову.
          </p>
        )}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {counting && (
          <div className="mb-4 space-y-3">
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
                className="pos-field min-w-0 flex-1"
              />
              <button type="submit" className="pos-btn-primary min-h-12 px-5 rounded-sq text-[17px] tabular-nums">
                +1
              </button>
              <button
                type="button"
                className="sq-btn-quiet min-h-12"
                onClick={() => setCamera((v) => !v)}
              >
                <Camera size={20} />
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
            {notice && <p className="text-[15px] text-sq-secondary">{notice}</p>}

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Або знайдіть за назвою / артикулом"
              aria-label="Пошук товару"
              className="pos-field"
            />
            {results.length > 0 && (
              <ul className="divide-y divide-sq-divider rounded-card bg-white shadow-card overflow-hidden">
                {results.map((item) => (
                  <li key={item.variant_id}>
                    <button
                      type="button"
                      className="flex w-full min-h-12 items-center justify-between gap-3 px-4 py-2 text-left hover:bg-sq-sidebar"
                      onClick={() => {
                        void add(item);
                        setQuery('');
                      }}
                    >
                      <span className="min-w-0 truncate text-base text-sq-text">
                        {lineLabel(item)}
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold text-sq-blue tabular-nums">+1</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {lines.length === 0 ? (
          <div className="py-12 text-center">
            {counting && <ScanLine size={48} className="mx-auto mb-3" />}
            <p className="text-[15px] text-sq-secondary">
              {counting ? 'Відскануйте перший товар.' : 'Порожній лист.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-sq-divider rounded-card bg-white shadow-card overflow-hidden">
            {lines.map((line) => {
              const pack = linePack(line);
              const mode = packModeOf(line.variantId);
              const shown =
                mode === 'pack' && pack
                  ? Math.round((line.countedQty / pack.qty) * 10000) / 10000
                  : line.countedQty;
              return (
                <li key={line.variantId} className="pl-4 pr-2 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base text-sq-text">{line.label}</div>
                      {line.barcode && (
                        <div className="text-[13px] text-sq-muted tabular-nums">{line.barcode}</div>
                      )}
                    </div>
                    {counting ? (
                      <>
                        <button
                          type="button"
                          aria-label="Менше"
                          className="w-11 h-11 grid place-items-center rounded-sq bg-sq-empty text-sq-text hover:bg-sq-selected"
                          onClick={() => adjust(line, -1)}
                        >
                          <Minus size={20} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          // Packs may be fractional on screen; `setCount` is what
                          // floors the base units that come out.
                          step="any"
                          value={shown}
                          aria-label={`Кількість: ${line.label}`}
                          onChange={(e) => void typed(line, e.target.value)}
                          className="h-11 w-20 rounded-sq border-0 bg-sq-empty text-center text-[17px] font-semibold tabular-nums text-sq-text outline-none focus:bg-white focus:ring-2 focus:ring-sq-blue"
                        />
                        <button
                          type="button"
                          aria-label="Більше"
                          className="w-11 h-11 grid place-items-center rounded-sq bg-sq-empty text-sq-text hover:bg-sq-selected"
                          onClick={() => adjust(line, 1)}
                        >
                          <Plus size={20} />
                        </button>
                        <button
                          type="button"
                          aria-label="Прибрати"
                          className="w-11 h-11 grid place-items-center rounded-full text-sq-muted hover:bg-sq-empty hover:text-red-600"
                          onClick={() => void removeLine(id, line.variantId).then(reload)}
                        >
                          <X size={20} />
                        </button>
                      </>
                    ) : (
                      <span className="w-16 pr-2 text-right text-[17px] font-semibold text-sq-text tabular-nums">
                        {line.countedQty}
                      </span>
                    )}
                  </div>
                  {counting && (
                    <QuantityUnitToggle
                      className="mt-1 w-40 ml-auto"
                      pack={pack}
                      unit={line.unit ?? ''}
                      mode={mode}
                      value={shown}
                      onModeChange={(next) =>
                        setPackModes((prev) => ({ ...prev, [line.variantId]: next }))
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {counting && (
          <button
            type="button"
            disabled={busy || lines.length === 0}
            className="pos-btn-primary mt-4 w-full min-h-[52px] rounded-xl text-[17px]"
            onClick={finish}
          >
            {busy ? 'Відправляю…' : 'Завершити і відправити'}
          </button>
        )}
      </div>
    </div>
  );
}
