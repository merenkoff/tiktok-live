// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useState } from 'react';
import { formatUah } from '../../lib/money';
import { parseChildQuery, suggestSizes } from '../../lib/sizeFinder';
import { parseSize, sizeHint } from '../../lib/sizeLadder';
import type { CatalogItem } from '../../types';
import { useDragScroll } from '../../hooks/useDragScroll';
import { ChevronRight, X } from '../../platform/glyphs';

interface Props {
  productName: string;
  variants: CatalogItem[];
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
}

const sizeOf = (item: CatalogItem): string => String(item.attributes?.size ?? '').trim();
const colourOf = (item: CatalogItem): string => String(item.attributes?.color ?? '').trim();

/**
 * Sizes as chips, a colour at a time (TechDocs/POS_CLOTHING.md, C1d). A garment
 * card has a dozen variants and the flat list made the cashier read «Блакитний /
 * 98-104» twelve times; here the colour is a heading, the size is what you tap,
 * and under it stands the same size in the other system («2–4 роки» under
 * «98-104»). A size that is out stays where it is — greyed, and the row of sizes
 * keeps its shape — instead of sinking to the bottom and breaking the run.
 *
 * Only for a card where EVERY variant has a size: a florist's stems or a café's
 * cups have none and keep the plain list.
 */
function SizeChips({
  variants,
  onPick,
  fit,
  room,
}: {
  variants: CatalogItem[];
  onPick: (item: CatalogItem) => void;
  fit: ReadonlySet<string>;
  room: ReadonlySet<string>;
}) {
  const groups = useMemo(() => {
    const byColour = new Map<string, CatalogItem[]>();
    for (const item of variants) {
      const key = colourOf(item);
      byColour.set(key, [...(byColour.get(key) ?? []), item]);
    }
    return [...byColour.entries()];
  }, [variants]);
  // One price for the whole card is said once, in the chips' heading; a card
  // whose sizes cost differently says it on each chip.
  const prices = new Set(variants.map((v) => v.price_cents));
  const uniformPrice = prices.size === 1 ? variants[0]!.price_cents : null;

  return (
    <div className="px-4 pb-3 max-h-[52vh] overflow-auto" data-testid="size-chips">
      {uniformPrice !== null && (
        <p className="text-[15px] font-semibold text-sq-text tabular-nums pb-1">{formatUah(uniformPrice)}</p>
      )}
      {groups.map(([colour, items]) => (
        <section key={colour || 'none'} className="pt-2">
          {(groups.length > 1 || colour) && (
            <h4 className="text-[13px] font-semibold text-sq-secondary pb-1.5">{colour || 'Без кольору'}</h4>
          )}
          <div className="flex flex-wrap gap-2">
            {items.map((item) => {
              const size = sizeOf(item);
              const hint = sizeHint(size);
              const oos = item.quantity <= 0;
              const state = fit.has(size) ? 'fit' : room.has(size) ? 'room' : null;
              return (
                <button
                  key={item.variant_id}
                  type="button"
                  disabled={oos}
                  onClick={() => onPick(item)}
                  aria-label={state === 'fit' ? `${size}, підходить` : state === 'room' ? `${size}, на виріст` : size}
                  data-state={state ?? undefined}
                  className={`min-w-[4.5rem] min-h-14 px-3 py-1.5 rounded-[14px] flex flex-col items-center justify-center text-center leading-tight ring-1 ring-inset transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sq-blue disabled:cursor-not-allowed ${
                    oos
                      ? 'bg-sq-sidebar text-sq-muted ring-sq-divider opacity-60'
                      : state === 'fit'
                        ? 'bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue'
                        : state === 'room'
                          ? 'bg-sq-surface ring-sq-blue/50 text-sq-text'
                          : 'bg-sq-surface ring-sq-divider text-sq-text hover:bg-sq-sidebar active:bg-sq-selected'
                  }`}
                >
                  <span className="text-[17px] font-semibold tabular-nums">{size}</span>
                  <span aria-hidden="true" className={`text-[11px] ${oos ? 'text-red-600' : 'text-sq-muted'}`}>
                    {oos ? 'немає' : (hint ?? `${item.quantity} ${item.unit || 'шт'}`)}
                  </span>
                  {!oos && uniformPrice === null && (
                    <span aria-hidden="true" className="text-[12px] font-semibold tabular-nums">
                      {formatUah(item.price_cents)}
                    </span>
                  )}
                  {state === 'room' && (
                    <span aria-hidden="true" className="text-[10px] text-sq-blue">
                      на виріст
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function VariantPicker({ productName, variants, onPick, onClose }: Props) {
  const listRef = useDragScroll<HTMLUListElement>();
  const sorted = [...variants].sort((a, b) => {
    if (a.quantity <= 0 && b.quantity > 0) return 1;
    if (a.quantity > 0 && b.quantity <= 0) return -1;
    return 0;
  });

  // Chips only where every variant is a size (clothing); a florist's or a café's
  // card keeps the list, exactly as it was.
  const asChips = variants.length > 0 && variants.every((v) => sizeOf(v) !== '');
  // The size finder appears only when at least one size is a child's — on the
  // ladder. An adult garment (S, M, L) gets neither a field nor a hint.
  const childSizes = asChips && variants.some((v) => parseSize(sizeOf(v)) !== null);
  const [ask, setAsk] = useState('');
  const query = parseChildQuery(ask);
  const suggestion = useMemo(
    () => (query ? suggestSizes(query, [...new Set(variants.filter((v) => v.quantity > 0).map(sizeOf))]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ask, variants]
  );
  const fit = new Set(suggestion?.fit ?? []);
  const room = new Set(suggestion?.room ?? []);

  return (
    <div className="fixed inset-0 z-40 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4">
      <div
        role="dialog"
        aria-label={productName}
        className="bg-white rounded-card w-full max-w-md overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]"
        data-testid="variant-picker"
      >
        <div className="pl-5 pr-3 pt-4 pb-2 flex justify-between items-center gap-3">
          <h3 className="text-[19px] font-bold text-sq-heading truncate">{productName}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0"
          >
            <X size={20} />
          </button>
        </div>
        {childSizes && (
          <div className="px-5 pb-2">
            <input
              type="text"
              inputMode="text"
              aria-label="Вік або зріст дитини"
              placeholder="Вік або зріст: 2 роки, 18 міс, 98"
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              className="sq-input w-full"
            />
            {ask.trim() !== '' && (
              <p role="status" className="mt-1.5 text-[13px] text-sq-secondary" data-testid="size-finder-status">
                {!query
                  ? 'Напишіть вік («2 роки», «18 міс») або зріст («98»)'
                  : !suggestion
                    ? 'Такого розміру в каталозі немає'
                    : suggestion.fit.length === 0 && suggestion.room.length === 0
                      ? `Розмір ${suggestion.rung.cm} не в наявності`
                      : suggestion.fit.length > 0
                        ? `Підходить: ${suggestion.fit.join(', ')}${suggestion.room.length ? ` · на виріст: ${suggestion.room.join(', ')}` : ''}`
                        : `Потрібного розміру немає · на виріст: ${suggestion.room.join(', ')}`}
              </p>
            )}
          </div>
        )}
        {asChips ? (
          <SizeChips variants={variants} onPick={onPick} fit={fit} room={room} />
        ) : (
          <ul ref={listRef} className="px-2 pb-2 max-h-[60vh] overflow-auto select-none">
            {sorted.map((item) => {
              const label = item.label || 'Стандарт';
              const oos = item.quantity <= 0;
              return (
                <li key={item.variant_id}>
                  <button
                    type="button"
                    disabled={oos}
                    onClick={() => onPick(item)}
                    className="w-full min-h-16 rounded-[14px] text-left px-3.5 py-2.5 flex items-center gap-3 disabled:opacity-50 hover:bg-sq-sidebar focus-visible:bg-sq-sidebar active:bg-sq-selected outline-none"
                  >
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[17px] font-semibold truncate ${oos ? 'text-sq-muted' : 'text-sq-text'}`}>
                        {label}
                      </span>
                      <span className={`block text-[13px] ${oos ? 'text-red-600' : 'text-sq-muted'}`}>
                        {oos ? 'Немає в наявності' : `${item.quantity} ${item.unit || 'шт'}`}
                      </span>
                    </span>
                    <span className="text-[17px] font-semibold text-sq-text tabular-nums shrink-0">
                      {formatUah(item.price_cents)}
                    </span>
                    <ChevronRight size={20} className="text-sq-muted shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
