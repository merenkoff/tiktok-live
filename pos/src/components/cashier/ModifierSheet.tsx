// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { assetUrl } from '@pos/platform';
import { formatUah, formatUahCompact } from '../../lib/money';
import { useDragScroll } from '../../hooks/useDragScroll';
import {
  MAX_LINE_NOTE,
  cleanLineNote,
  groupsOf,
  lineCaption,
  resolveLineModifiers,
} from '../../lib/modifiers';
import type { CatalogItem, CatalogModifier, CatalogModifierGroup } from '../../types';
import { Check, Coffee, Minus, Pencil, Plus, X } from '../../platform/glyphs';

/** What the sheet hands back: the variant picked, the answers in group order, the note, how many. */
export interface ModifierSheetChoice {
  item: CatalogItem;
  modifiers: number[];
  note: string;
  /** Always 1 when the sheet has no stepper (`withQuantity={false}`). */
  quantity: number;
}

interface Props {
  productName: string;
  /** Every variant of the product. More than one draws a first row to pick from. */
  variants: CatalogItem[];
  /** What the variant row is called — «Розмір» in a café. */
  variantLabel?: string;
  /** Pre-picked variant; a single variant is picked on its own. */
  initialVariantId?: number | null;
  /** Pre-selected answers — the caller passes `defaultModifierIds(groups)`. UI state only. */
  initialModifierIds?: number[];
  initialNote?: string;
  /** What the button says — «Додати в чек» by default; «Зберегти» when the sheet edits a line. */
  submitLabel?: string;
  /** The −/+ stepper in the footer. Off where the sheet edits an existing line. */
  withQuantity?: boolean;
  /** «Коментар для кухні» by default; a bar item says «для бару». */
  notePlaceholder?: string;
  onAdd: (choice: ModifierSheetChoice) => void;
  onClose: () => void;
}

/**
 * The modifier sheet: every question about a product on one surface, in any
 * order, with the price of the answer on the button (TechDocs/POS_CAFE.md §3).
 *
 * Not a full-screen modal. It is positioned `absolute` inside the catalog
 * `<section>` the vertical module renders (which must be `relative`), so on a
 * wide till the cart stays visible next to it and on a tablet it takes the
 * catalog's width. Props-only, like `VariantPicker`: it reads no store and
 * decides nothing about when it opens — `needsModifierSheet` and the tile's
 * «⋯» do that in the module.
 *
 * `is_default` never reaches the server as such: the ids pre-selected here are
 * plain answers once «Додати» is tapped, and the caller sends them explicitly.
 */
export function ModifierSheet({
  productName,
  variants,
  variantLabel = 'Варіант',
  initialVariantId,
  initialModifierIds,
  initialNote,
  submitLabel = 'Додати в чек',
  withQuantity = true,
  notePlaceholder = 'Коментар для кухні',
  onAdd,
  onClose,
}: Props) {
  const [variantId, setVariantId] = useState<number | null>(
    () => initialVariantId ?? (variants.length === 1 ? variants[0].variant_id : null)
  );
  const [selected, setSelected] = useState<number[]>(() => initialModifierIds ?? []);
  const [note, setNote] = useState(initialNote ?? '');
  const [quantity, setQuantity] = useState(1);
  const bodyRef = useDragScroll<HTMLDivElement>();

  const current = variants.find((v) => v.variant_id === variantId) ?? null;
  const groups = groupsOf(variants);
  const resolved = resolveLineModifiers(groups, selected);
  const priceCents = current ? current.price_cents + resolved.deltaCents : null;
  const error =
    current == null
      ? `Оберіть «${variantLabel}»`
      : (resolved.error ?? (priceCents != null && priceCents < 0 ? 'Ціна не може бути відʼємною' : null));
  const canAdd = error == null && current != null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function countIn(group: CatalogModifierGroup, ids: number[]): number {
    return ids.filter((id) => group.modifiers.some((m) => m.id === id)).length;
  }

  function toggle(group: CatalogModifierGroup, modifier: CatalogModifier) {
    setSelected((prev) => {
      if (prev.includes(modifier.id)) return prev.filter((id) => id !== modifier.id);
      if (group.max_select === 1) {
        // One answer: the tap replaces it.
        return [...prev.filter((id) => !group.modifiers.some((m) => m.id === id)), modifier.id];
      }
      // At the cap the tap is refused — never an earlier choice silently dropped.
      if (countIn(group, prev) >= group.max_select) return prev;
      return [...prev, modifier.id];
    });
  }

  function submit() {
    if (!canAdd || !current) return;
    onAdd({
      item: current,
      modifiers: resolved.snapshot.map((m) => m.id),
      note: cleanLineNote(note),
      quantity: withQuantity ? quantity : 1,
    });
  }

  const caption = current ? lineCaption(current.label, resolved.error ? [] : resolved.names) : '';
  const image = assetUrl((current ?? variants[0])?.image_url ?? null);
  const minPrice = variants.length ? Math.min(...variants.map((v) => v.price_cents)) : null;
  // S · M · L, not the catalogue's alphabetical L · M · S: a size row reads
  // cheapest first. A stable sort, so equal prices keep the catalogue order.
  const bySize = [...variants].sort((a, b) => a.price_cents - b.price_cents);

  return (
    <div className="absolute inset-0 z-30" data-testid="modifier-sheet">
      <div
        aria-hidden
        className="absolute inset-0 bg-[rgba(28,32,38,.32)]"
        onClick={onClose}
        data-testid="modifier-scrim"
      />
      <div
        role="dialog"
        aria-label={productName}
        className="absolute inset-x-0 bottom-0 bg-white rounded-t-card shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up flex flex-col max-h-[88%]"
      >
        <div aria-hidden className="w-10 h-[5px] rounded-full bg-sq-divider self-center mt-2 shrink-0" />
        <div className="px-6 pt-2.5 pb-3.5 flex items-center gap-3.5 shadow-[0_1px_0_#E6E8EC] shrink-0">
          {image ? (
            <img src={image} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
          ) : (
            <div aria-hidden className="w-14 h-14 rounded-xl bg-sq-sidebar grid place-items-center shrink-0">
              <Coffee size={24} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-[21px] leading-tight font-bold text-sq-heading truncate">{productName}</h3>
            {minPrice != null && (
              <p className="text-sm text-sq-secondary truncate tabular-nums">
                {variants.length > 1 ? `від ${formatUah(minPrice)}` : formatUah(minPrice)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="w-11 h-11 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty shrink-0"
            data-testid="modifier-close"
          >
            <X size={20} />
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-auto select-none px-6 py-[18px] space-y-[18px]">
          {variants.length > 1 && (
            <section data-testid="modifier-variants">
              <GroupTitle name={variantLabel} hint="обовʼязково" required />
              <div className="flex flex-wrap gap-2">
                {bySize.map((v) => {
                  const on = v.variant_id === variantId;
                  const oos = v.quantity <= 0;
                  return (
                    <button
                      key={v.variant_id}
                      type="button"
                      disabled={oos}
                      aria-pressed={on}
                      onClick={() => setVariantId(v.variant_id)}
                      className={chipClass(on, oos)}
                      data-testid={`modifier-variant-${v.variant_id}`}
                    >
                      {on && <Check size={20} aria-hidden />}
                      {v.label || 'Стандарт'}
                      <span className={on ? 'font-medium' : 'font-medium text-sq-secondary'}>
                        {oos ? 'немає' : formatUahCompact(v.price_cents)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {groups.map((group) => {
            const n = countIn(group, selected);
            const full = group.max_select > 1 && n >= group.max_select;
            return (
              <section key={group.id} data-testid={`modifier-group-${group.id}`}>
                <GroupTitle name={group.name} hint={hintOf(group, full)} required={group.min_select >= 1} />
                <div className="flex flex-wrap gap-2">
                  {group.modifiers.map((modifier) => {
                    const on = selected.includes(modifier.id);
                    const blocked = !on && full;
                    return (
                      <button
                        key={modifier.id}
                        type="button"
                        aria-pressed={on}
                        aria-disabled={blocked || undefined}
                        onClick={() => toggle(group, modifier)}
                        className={chipClass(on, blocked)}
                        data-testid={`modifier-chip-${modifier.id}`}
                      >
                        {on && <Check size={20} aria-hidden />}
                        {modifier.name}
                        {modifier.price_delta_cents !== 0 && (
                          <span className={on ? 'font-medium' : 'font-medium text-sq-secondary'}>
                            {deltaText(modifier.price_delta_cents)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <label className="h-12 rounded-xl bg-sq-empty flex items-center gap-2.5 px-3.5">
            <Pencil size={20} aria-hidden className="text-sq-muted shrink-0" />
            <input
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-base text-sq-text placeholder:text-sq-muted"
              value={note}
              maxLength={MAX_LINE_NOTE}
              placeholder={notePlaceholder}
              aria-label={notePlaceholder}
              enterKeyHint="done"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              data-testid="modifier-note"
            />
          </label>
        </div>

        <div className="shrink-0 px-6 pt-3 pb-[18px] flex flex-wrap items-center gap-x-4 gap-y-2 shadow-[0_-1px_0_#E6E8EC]">
          {withQuantity && (
            <div className="flex items-center gap-1.5" data-testid="modifier-qty">
              <button
                type="button"
                aria-label="Менше"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className={stepClass}
                data-testid="modifier-qty-minus"
              >
                <Minus size={20} />
              </button>
              <span
                className="w-11 h-10 grid place-items-center text-[17px] font-semibold text-sq-text tabular-nums"
                data-testid="modifier-qty-value"
              >
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Більше"
                disabled={quantity >= MAX_QTY}
                onClick={() => setQuantity((q) => Math.min(MAX_QTY, q + 1))}
                className={stepClass}
                data-testid="modifier-qty-plus"
              >
                <Plus size={20} />
              </button>
            </div>
          )}
          {error ? (
            <p className="flex-1 min-w-[10rem] text-sm text-red-600" data-testid="modifier-error">
              {error}
            </p>
          ) : (
            <p className="flex-1 min-w-[10rem] text-sm text-sq-secondary truncate" data-testid="modifier-caption">
              {caption}
            </p>
          )}
          <button
            type="button"
            className="pos-btn-primary min-h-[52px] rounded-xl px-[22px] text-[17px] sm:min-w-[300px] max-sm:w-full"
            disabled={!canAdd}
            onClick={submit}
            data-testid="modifier-add"
          >
            {/* One text run: in an inline-flex button the spaces around «·»
                would be trimmed at the edges of separate flex items. */}
            <span>
              {submitLabel}
              {priceCents != null && (
                <>
                  {' · '}
                  <span className="tabular-nums" data-testid="modifier-price">
                    {formatUah(priceCents * quantity)}
                  </span>
                </>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

const MAX_QTY = 99;

const stepClass =
  'w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40';

function GroupTitle({ name, hint, required }: { name: string; hint: string | null; required: boolean }) {
  return (
    <div className="flex items-baseline gap-2 mb-2.5">
      <span className="text-base font-bold text-sq-heading">{name}</span>
      {hint && <span className={`text-[13px] ${required ? 'text-red-600' : 'text-sq-muted'}`}>{hint}</span>}
    </div>
  );
}

/** «обовʼязково» / «можна одне» / «скільки завгодно» / «до 2» — what the group lets you do. */
function hintOf(group: CatalogModifierGroup, full: boolean): string | null {
  if (group.min_select >= 1) {
    return group.max_select > 1 ? `обовʼязково · до ${group.max_select}` : 'обовʼязково';
  }
  if (group.max_select <= 1) return 'можна одне';
  if (full) return `не більше ${group.max_select}`;
  if (group.max_select >= group.modifiers.length) return 'скільки завгодно';
  return `до ${group.max_select}`;
}

function chipClass(on: boolean, blocked: boolean): string {
  return [
    'min-h-12 px-4 rounded-xl text-base inline-flex items-center gap-2 transition-colors',
    on
      ? 'bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold'
      : 'bg-white ring-1 ring-sq-divider text-sq-text font-medium',
    blocked ? 'opacity-40' : '',
  ].join(' ');
}

/** «+15 ₴» / «−20 ₴»; nothing for a free answer. */
function deltaText(deltaCents: number): string {
  if (deltaCents > 0) return `+${formatUahCompact(deltaCents)}`;
  if (deltaCents < 0) return `−${formatUahCompact(-deltaCents)}`;
  return '';
}
