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
import { Camera, Flower2, Trash2, X } from '@pos/platform/ui';
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
      <div className="px-4 md:px-7 py-4 text-sq-text">
        <div className="flex items-center gap-3">
          <Flower2 size={24} />
          <h1 className="text-2xl font-bold text-sq-heading">Вітрина</h1>
        </div>
        <p className="mt-3 text-[15px] text-amber-800">
          Магазин зараз не на квітковій вертикалі. Тип магазину змінює адміністратор
          платформи.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-sq-bg text-sq-text">
      <div className="flex items-center gap-3 px-4 md:px-7 py-4 md:min-h-[72px]">
        <Flower2 size={24} className="shrink-0" />
        <h1 className="text-2xl font-bold text-sq-heading">Вітрина</h1>
        <p className="ml-auto text-[15px] text-sq-muted tabular-nums">
          {showcase.length > 0 ? `${showcase.length} готових` : ''}
        </p>
      </div>

      <div className="px-4 md:px-7 pb-6 space-y-4">
        {error && (
          <p className="text-sm text-red-600" data-testid="showcase-page-error">
            {error}
          </p>
        )}

        {rows === null && <p className="text-sm text-sq-muted">Завантаження…</p>}

        {rows !== null && showcase.length === 0 && (
          <div className="py-16 text-center">
            <Flower2 size={48} className="mx-auto" />
            <p className="mt-3 text-[15px] text-sq-secondary">На вітрині зараз порожньо</p>
            <p className="mt-1 text-[13px] text-sq-muted max-w-[34ch] mx-auto">
              Зберіть букет на екрані продажу й натисніть «На вітрину» — він зʼявиться тут.
            </p>
          </div>
        )}

        <ul
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3.5"
          data-testid="showcase-list"
        >
          {showcase.map((item) => {
            const photo = assetUrl(item.image_url);
            return (
              <li
                key={item.variant_id}
                className="rounded-card bg-white shadow-card overflow-hidden flex flex-col"
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
                  className="aspect-[4/3] w-full bg-sq-empty overflow-hidden grid place-items-center hover:opacity-90"
                  aria-label={
                    item.image_url ? `Змінити фото: ${item.product_name}` : `Додати фото: ${item.product_name}`
                  }
                  data-testid="showcase-photo"
                >
                  {photo ? (
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={40} className="text-sq-muted" />
                  )}
                </button>
                <div className="flex-1 min-w-0 px-4 pt-3 pb-1">
                  <p className="text-[17px] font-semibold text-sq-text truncate">{item.product_name}</p>
                  {item.components && item.components.length > 0 && (
                    <p className="mt-0.5 text-[13px] text-sq-muted line-clamp-2">
                      {item.components
                        .map((c) => `${c.product_name} × ${c.quantity}`)
                        .join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 pl-4 pr-2 pb-2">
                  <p className="flex-1 text-[17px] font-bold text-sq-heading tabular-nums">
                    {formatUah(item.price_cents)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirming(item);
                    }}
                    className="w-11 h-11 grid place-items-center rounded-sq text-sq-secondary hover:bg-sq-empty hover:text-red-600 shrink-0"
                    aria-label={`Списати: ${item.product_name}`}
                    data-testid="showcase-writeoff"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {shooting && (
        <div className="fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4">
          <div
            className="bg-white rounded-card w-full max-w-sm overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]"
            data-testid="photo-dialog"
          >
            <div className="px-5 pt-[18px] pb-3.5 flex items-start gap-2.5">
              <div className="flex-1 min-w-0">
                <h3 className="text-[19px] font-bold text-sq-heading">Фото букета</h3>
                <p className="text-[15px] text-sq-secondary truncate mt-0.5">
                  {shooting.product_name}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setShooting(null)}
                className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty disabled:opacity-40 shrink-0"
                aria-label="Закрити"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-5 pb-5">
              <BouquetPhoto
                value={shooting.image_url}
                onChange={(url) => {
                  if (url) void attachPhoto(shooting, url);
                  else setShooting(null);
                }}
                disabled={busy}
              />
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4">
          <div
            className="bg-white rounded-card w-full max-w-sm overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]"
            data-testid="writeoff-dialog"
          >
            <div className="px-5 pt-[18px] pb-3">
              <h3 className="text-[19px] font-bold text-sq-heading">Списати букет</h3>
              <p className="text-[15px] text-sq-secondary truncate mt-0.5 tabular-nums">
                {confirming.product_name} · {formatUah(confirming.price_cents)}
              </p>
            </div>
            <div className="px-5 pb-4 flex flex-col gap-2.5">
              {/* Stated plainly, because it is the one thing a florist might
                  reasonably expect to work the other way. */}
              <p className="text-[13px] text-sq-muted">
                Стебла не повернуться на залишок — їх списав документ виробництва, коли
                букет зібрали.
              </p>
              {REASONS.map((reason) => (
                <button
                  key={reason.code}
                  type="button"
                  disabled={busy}
                  onClick={() => void writeOff(confirming, reason.code)}
                  className="w-full min-h-16 rounded-[14px] bg-white ring-1 ring-sq-divider hover:bg-sq-sidebar px-4 py-2.5 text-left disabled:opacity-50"
                  data-testid={`writeoff-${reason.code}`}
                >
                  <span className="block text-[17px] font-semibold text-sq-text">{reason.label}</span>
                  <span className="block text-[13px] text-sq-muted">{reason.hint}</span>
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(null)}
                className="min-h-11 w-full text-base font-semibold text-sq-blue disabled:opacity-50"
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
