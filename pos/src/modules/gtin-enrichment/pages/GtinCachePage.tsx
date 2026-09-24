// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { displayGtin, gtinSourceLabel } from '@pos/platform';
import {
  Barcode,
  ChevronLeft,
  ChevronRight,
  PackageLine,
  PageHeader,
  Search,
  SectionHead,
} from '@pos/platform/ui';
import { gtinCacheApi, type GtinCacheEntry } from '../data/gtinCacheApi';
import { SupplierImportPanel } from '../components/SupplierImportPanel';

const PAGE_SIZE = 25;

// The white button beside a primary one is `.sq-btn-quiet` now; the destructive
// one is a red text button, as everywhere else in the owner's screens.
const BTN = 'sq-btn-quiet';
const BTN_PRIMARY = 'pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]';
const BTN_DANGER = 'min-h-11 px-3 rounded-sq text-[15px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50';

/** Brand · source · date, skipping whatever this row does not have. */
function metaLine(entry: GtinCacheEntry): string {
  return [
    entry.brand,
    entry.blocked ? 'заблоковано' : gtinSourceLabel(entry.best_source) || null,
    new Date(entry.updated_at).toLocaleDateString('uk-UA'),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function GtinCachePage() {
  const [query, setQuery] = useState('');
  // The applied query, not the input: typing must not re-fetch on every key.
  const [applied, setApplied] = useState('');
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<GtinCacheEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftBrand, setDraftBrand] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // Cache images are third-party URLs and some of them 404. Hiding the <img>
  // imperatively in onError would be undone by the next reload() re-render, so
  // the failures live in state.
  const [brokenImages, setBrokenImages] = useState<ReadonlySet<string>>(new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await gtinCacheApi.list({
        q: applied || undefined,
        limit: PAGE_SIZE,
        offset,
        blockedOnly,
      });
      setItems(page.items);
      setTotal(page.total);
    } catch {
      setError('Не вдалося завантажити довідник');
    } finally {
      setLoading(false);
    }
  }, [applied, blockedOnly, offset]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setOffset(0);
    setApplied(query.trim());
  }

  function startEdit(entry: GtinCacheEntry) {
    setEditing(entry.gtin);
    setDraftName(entry.name ?? '');
    setDraftBrand(entry.brand ?? '');
  }

  async function run(gtin: string, action: () => Promise<unknown>) {
    setBusy(gtin);
    setError(null);
    try {
      await action();
      await reload();
    } catch {
      setError('Не вдалося зберегти зміну');
    } finally {
      setBusy(null);
    }
  }

  async function onSave(entry: GtinCacheEntry) {
    if (!draftName.trim()) {
      setError('Назва не може бути порожньою');
      return;
    }
    await run(entry.gtin, () =>
      gtinCacheApi.save(entry.gtin, {
        name: draftName.trim(),
        brand: draftBrand.trim() || null,
      })
    );
    setEditing(null);
  }

  async function onEvict(entry: GtinCacheEntry) {
    const code = displayGtin(entry.gtin);
    if (
      !confirm(
        `Очистити запис ${code}?\n\nНазва зникне для всіх магазинів, і зовнішні джерела ` +
          'не зможуть заповнити її знову, доки ви не розблокуєте запис.'
      )
    ) {
      return;
    }
    await run(entry.gtin, () => gtinCacheApi.evict(entry.gtin));
  }

  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="animate-fade-up text-sq-text max-w-5xl">
      <PageHeader
        glyph={Barcode}
        title="GTIN-довідник"
        subtitle={
          <>
            Назви, які каса підтягує за штрихкодом під час приймання товару. Довідник спільний —
            виправлення бачать усі магазини. Пріоритет: ручна правка касира → прайс постачальника →
            автоматичний пошук.
          </>
        }
      />

      <div className="space-y-8">
        <SupplierImportPanel onImported={() => void reload()} />

        <section className="space-y-4">
          <SectionHead title="Довідник" count={total} />

          <form onSubmit={onSearch} className="flex flex-wrap items-center gap-3">
            <label className="flex-1 min-w-[220px] h-11 rounded-sq bg-sq-empty flex items-center gap-2.5 px-3.5 transition-colors focus-within:bg-sq-surface focus-within:ring-2 focus-within:ring-sq-blue">
              <Search size={20} className="text-sq-muted shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Штрихкод або назва"
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-sq-text placeholder:text-sq-muted"
              />
            </label>
            <button type="submit" className={BTN_PRIMARY}>
              Знайти
            </button>
            <label className="inline-flex items-center gap-2 min-h-11 text-[15px] text-sq-secondary cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-[rgb(var(--sq-blue-rgb))]"
                checked={blockedOnly}
                onChange={(e) => {
                  setOffset(0);
                  setBlockedOnly(e.target.checked);
                }}
              />
              Лише очищені
            </label>
          </form>

          {error && <div className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

          <ul>
            {items.map((entry) => {
              const isEditing = editing === entry.gtin;
              const working = busy === entry.gtin;
              const showImage = entry.image_url && !entry.blocked && !brokenImages.has(entry.image_url);
              return (
                <li key={entry.gtin} className="sq-row py-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-sq-empty overflow-hidden shrink-0 grid place-items-center">
                      {showImage ? (
                        <img
                          src={entry.image_url!}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImages((prev) => new Set(prev).add(entry.image_url!))
                          }
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <PackageLine size={20} className="text-sq-muted" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-sq-muted tabular-nums">{displayGtin(entry.gtin)}</p>
                      {entry.blocked ? (
                        <p className="text-base font-semibold text-amber-700">Очищено власником</p>
                      ) : (
                        <p className="text-base font-semibold text-sq-text truncate">
                          {entry.name ?? 'Без назви'}
                        </p>
                      )}
                      <p className="text-[13px] text-sq-muted">{metaLine(entry)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.blocked ? (
                        <button
                          type="button"
                          disabled={working}
                          className={BTN}
                          onClick={() => void run(entry.gtin, () => gtinCacheApi.unblock(entry.gtin))}
                        >
                          Розблокувати
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={working}
                            className={BTN}
                            onClick={() => (isEditing ? setEditing(null) : startEdit(entry))}
                          >
                            {isEditing ? 'Скасувати' : 'Виправити'}
                          </button>
                          <button
                            type="button"
                            disabled={working}
                            className={BTN_DANGER}
                            onClick={() => void onEvict(entry)}
                          >
                            Очистити
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 pl-[52px]">
                      <input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        placeholder="Назва"
                        className="sq-input"
                      />
                      <input
                        value={draftBrand}
                        onChange={(e) => setDraftBrand(e.target.value)}
                        placeholder="Бренд"
                        className="sq-input"
                      />
                      <button
                        type="button"
                        disabled={working}
                        className={BTN_PRIMARY}
                        onClick={() => void onSave(entry)}
                      >
                        Зберегти
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {items.length === 0 && (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              {!loading && <Barcode size={48} />}
              <p className="text-[15px] text-sq-secondary max-w-md">
                {loading
                  ? 'Завантаження…'
                  : applied
                    ? 'Нічого не знайдено.'
                    : 'Довідник поки порожній — він наповнюється під час приймання товару.'}
              </p>
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 text-[15px] text-sq-secondary">
              <button
                type="button"
                className={BTN}
                disabled={offset === 0}
                onClick={() => setOffset((prev) => Math.max(prev - PAGE_SIZE, 0))}
              >
                <ChevronLeft size={20} />
                Назад
              </button>
              <span className="tabular-nums">
                {page} / {pages} · всього {total}
              </span>
              <button
                type="button"
                className={BTN}
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
              >
                Далі
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
