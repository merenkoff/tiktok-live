// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { displayGtin, gtinSourceLabel } from '@pos/platform';
import { gtinCacheApi, type GtinCacheEntry } from '../data/gtinCacheApi';
import { SupplierImportPanel } from '../components/SupplierImportPanel';

const PAGE_SIZE = 25;

// No neutral button primitive in the `.sq-*` layer yet — the admin pages spell
// this combination out. Kept in one place rather than repeated six times.
const BTN = 'rounded-sq border border-sq-divider bg-sq-surface px-3 py-2 text-sm disabled:opacity-50';
const BTN_PRIMARY = 'sq-btn-primary px-4 py-2 text-sm';

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
    <div className="space-y-6 animate-fade-up text-sq-text">
      <div>
        <h2 className="text-2xl font-semibold">GTIN-довідник</h2>
        <p className="text-sq-secondary mt-1 text-sm">
          Назви, які каса підтягує за штрихкодом під час приймання товару. Довідник спільний —
          виправлення бачать усі магазини. Пріоритет: ручна правка касира → прайс постачальника →
          автоматичний пошук.
        </p>
      </div>

      <SupplierImportPanel onImported={() => void reload()} />

      <form onSubmit={onSearch} className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Штрихкод або назва"
          className="flex-1 min-w-[220px] rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
        />
        <button type="submit" className={BTN_PRIMARY}>
          Знайти
        </button>
        <label className="flex items-center gap-2 text-sm text-sq-secondary">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={blockedOnly}
            onChange={(e) => {
              setOffset(0);
              setBlockedOnly(e.target.checked);
            }}
          />
          Лише очищені
        </label>
      </form>

      {error && <div className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <section className="bg-sq-surface border border-sq-divider rounded-sq divide-y divide-sq-divider overflow-hidden shadow-sm">
        {items.map((entry) => {
          const isEditing = editing === entry.gtin;
          const working = busy === entry.gtin;
          return (
            <div key={entry.gtin} className="px-4 py-3 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                {entry.image_url && !entry.blocked && !brokenImages.has(entry.image_url) && (
                  <img
                    src={entry.image_url}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setBrokenImages((prev) => new Set(prev).add(entry.image_url!))
                    }
                    className="w-12 h-12 rounded-sq object-cover bg-sq-bg border border-sq-divider shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-sq-secondary">{displayGtin(entry.gtin)}</p>
                  {entry.blocked ? (
                    <p className="font-semibold text-amber-600">Очищено власником</p>
                  ) : (
                    <p className="font-semibold text-sq-text truncate">
                      {entry.name ?? 'Без назви'}
                    </p>
                  )}
                  <p className="text-xs text-sq-secondary">{metaLine(entry)}</p>
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
                        className={`${BTN} text-red-600`}
                        onClick={() => void onEvict(entry)}
                      >
                        Очистити
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 border-t border-sq-divider pt-3">
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Назва"
                    className="rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sq-text"
                  />
                  <input
                    value={draftBrand}
                    onChange={(e) => setDraftBrand(e.target.value)}
                    placeholder="Бренд"
                    className="rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sq-text"
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
            </div>
          );
        })}

        {items.length === 0 && (
          <p className="p-4 text-sq-secondary text-sm">
            {loading
              ? 'Завантаження…'
              : applied
                ? 'Нічого не знайдено.'
                : 'Довідник поки порожній — він наповнюється під час приймання товару.'}
          </p>
        )}
      </section>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-sq-secondary">
          <button
            type="button"
            className={BTN}
            disabled={offset === 0}
            onClick={() => setOffset((prev) => Math.max(prev - PAGE_SIZE, 0))}
          >
            Назад
          </button>
          <span>
            {page} / {pages} · всього {total}
          </span>
          <button
            type="button"
            className={BTN}
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
          >
            Далі
          </button>
        </div>
      )}
    </div>
  );
}
