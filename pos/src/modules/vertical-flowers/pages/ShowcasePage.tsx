// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * «Вітрина» — the bouquets standing in the window right now.
 *
 * Two jobs, and the second is why the phase exists. It is where a florist sees
 * what is made up and for how much — and it is where a bouquet that did not
 * sell gets written off. Without that, every card the bench creates sits at
 * quantity 1 forever and the catalogue silts up; worse, the shrinkage that
 * every flower shop lives with (7–10% at a settled shop, 20–25% at a new one)
 * stays invisible.
 *
 * **What is written off is the bouquet, not its stems.** Production took those
 * off the shelf when it was assembled; crediting them back would invent
 * flowers that are in the bin. The server enforces that, and it also refuses
 * anything that is not a one-off card, so this screen cannot empty a stem line.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Flower2, Trash2 } from 'lucide-react';
import { api, assetUrl, cashierApi, formatUah, useVertical } from '@pos/platform';
import { BouquetPhoto } from '../bench/BouquetPhoto';
import type { CatalogItem } from '@pos/platform';

type Reason = 'damaged' | 'gift';

const REASONS: Array<{ code: Reason; label: string; hint: string }> = [
  { code: 'damaged', label: 'Завʼяв', hint: 'Втрата — піде у звіт про списання' },
  { code: 'gift', label: 'Віддали', hint: 'Подарували або віддали працівнику' },
];

export default function ShowcasePage() {
  const vertical = useVertical();
  const [rows, setRows] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CatalogItem | null>(null);
  const [shooting, setShooting] = useState<CatalogItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // Through `cashierApi`, so the list is whatever this shell can actually
      // see — the desktop till reads its own mirror.
      const catalog = await cashierApi.getCatalog({});
      setRows(catalog);
      setError(null);
    } catch {
      setError('Не вдалося прочитати вітрину');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A card made at the bench, still on the shelf. Both a window bouquet and a
  // catalogue one are composite+own; `one_off` is the only thing that tells
  // them apart, which is exactly why the column exists.
  const showcase = useMemo(
    () => (rows ?? []).filter((item) => item.one_off && item.quantity > 0),
    [rows]
  );

  async function attachPhoto(item: CatalogItem, imageUrl: string): Promise<void> {
    setBusy(true);
    try {
      await api.setShowcasePhoto({ variant_id: item.variant_id, image_url: imageUrl });
      setShooting(null);
      await load();
    } catch (err) {
      const sent = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(sent || 'Не вдалося зберегти фото');
    } finally {
      setBusy(false);
    }
  }

  async function writeOff(item: CatalogItem, reason: Reason): Promise<void> {
    setBusy(true);
    try {
      await api.writeOffShowcase({
        client_uuid: crypto.randomUUID(),
        variant_id: item.variant_id,
        reason_code: reason,
      });
      setConfirming(null);
      await load();
    } catch (err) {
      const sent = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(sent || 'Не вдалося списати букет');
    } finally {
      setBusy(false);
    }
  }

  if (vertical.id !== 'flowers') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-sq-text">Вітрина</h1>
        <p className="mt-2 text-sm text-amber-700">
          Магазин зараз не на квітковій вертикалі. Тип магазину змінює адміністратор
          платформи.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 text-sq-text">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold">Вітрина</h1>
        <p className="text-sm text-sq-secondary">
          {showcase.length > 0 ? `${showcase.length} готових` : ''}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600" data-testid="showcase-page-error">
          {error}
        </p>
      )}

      {rows === null && <p className="text-sm text-sq-muted">Завантаження…</p>}

      {rows !== null && showcase.length === 0 && (
        <div className="rounded-sq border border-dashed border-sq-divider p-8 text-center">
          <Flower2 size={28} className="mx-auto text-sq-muted" />
          <p className="mt-2 text-sm text-sq-secondary">На вітрині зараз порожньо</p>
          <p className="mt-1 text-xs text-sq-muted max-w-[34ch] mx-auto">
            Зберіть букет на екрані продажу й натисніть «На вітрину» — він зʼявиться тут.
          </p>
        </div>
      )}

      <ul className="space-y-2" data-testid="showcase-list">
        {showcase.map((item) => (
          <li
            key={item.variant_id}
            className="rounded-sq border border-sq-divider bg-sq-surface p-3 flex items-center gap-3"
            data-testid="showcase-row"
          >
            {/* The florist who tied one in a hurry comes back to it here — the
                photo is what lets a cashier pick it out of a window holding
                two similar bouquets when the tag has come unstuck. */}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setShooting(item);
              }}
              className="w-14 h-14 rounded-sq bg-sq-empty overflow-hidden shrink-0 grid place-items-center"
              aria-label={
                item.image_url ? `Змінити фото: ${item.product_name}` : `Додати фото: ${item.product_name}`
              }
              data-testid="showcase-photo"
            >
              {assetUrl(item.image_url) ? (
                <img
                  src={assetUrl(item.image_url) ?? ''}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <Camera size={18} className="text-sq-muted" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{item.product_name}</p>
              <p className="text-sm text-sq-secondary">{formatUah(item.price_cents)}</p>
              {item.components && item.components.length > 0 && (
                <p className="text-xs text-sq-muted truncate">
                  {item.components
                    .map((c) => `${c.product_name} × ${c.quantity}`)
                    .join(', ')}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirming(item);
              }}
              className="min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-muted hover:text-red-600 shrink-0"
              aria-label={`Списати: ${item.product_name}`}
              data-testid="showcase-writeoff"
            >
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ul>

      {shooting && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4">
          <div
            className="bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg"
            data-testid="photo-dialog"
          >
            <div className="px-4 py-3.5 border-b border-sq-divider">
              <h3 className="font-semibold">Фото букета</h3>
              <p className="text-sm text-sq-secondary truncate mt-0.5">
                {shooting.product_name}
              </p>
            </div>
            <div className="p-4 space-y-3">
              <BouquetPhoto
                value={shooting.image_url}
                onChange={(url) => {
                  if (url) void attachPhoto(shooting, url);
                  else setShooting(null);
                }}
                disabled={busy}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => setShooting(null)}
                className="w-full min-h-12 rounded-sq text-sq-secondary disabled:opacity-50"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4">
          <div
            className="bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg"
            data-testid="writeoff-dialog"
          >
            <div className="px-4 py-3.5 border-b border-sq-divider">
              <h3 className="font-semibold">Списати букет</h3>
              <p className="text-sm text-sq-secondary truncate mt-0.5">
                {confirming.product_name} · {formatUah(confirming.price_cents)}
              </p>
            </div>
            <div className="p-4 space-y-2">
              {/* Stated plainly, because it is the one thing a florist might
                  reasonably expect to work the other way. */}
              <p className="text-xs text-sq-muted">
                Стебла не повернуться на залишок — їх списав документ виробництва, коли
                букет зібрали.
              </p>
              {REASONS.map((reason) => (
                <button
                  key={reason.code}
                  type="button"
                  disabled={busy}
                  onClick={() => void writeOff(confirming, reason.code)}
                  className="w-full min-h-12 rounded-sq border border-sq-divider px-3 text-left disabled:opacity-50"
                  data-testid={`writeoff-${reason.code}`}
                >
                  <span className="font-medium">{reason.label}</span>
                  <span className="block text-xs text-sq-muted">{reason.hint}</span>
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(null)}
                className="w-full min-h-12 rounded-sq text-sq-secondary disabled:opacity-50"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
