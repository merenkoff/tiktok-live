// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { formatUah } from '../../lib/money';
import { useDragScroll } from '../../hooks/useDragScroll';
import {
  MAX_LINE_NOTE,
  cleanLineNote,
  groupsOf,
  resolveLineModifiers,
} from '../../lib/modifiers';
import type { CatalogItem, CatalogModifier, CatalogModifierGroup } from '../../types';

/** What the sheet hands back: the variant picked, the answers in group order, the note. */
export interface ModifierSheetChoice {
  item: CatalogItem;
  modifiers: number[];
  note: string;
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
  onAdd,
  onClose,
}: Props) {
  const [variantId, setVariantId] = useState<number | null>(
    () => initialVariantId ?? (variants.length === 1 ? variants[0].variant_id : null)
  );
  const [selected, setSelected] = useState<number[]>(() => initialModifierIds ?? []);
  const [note, setNote] = useState(initialNote ?? '');
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
    });
  }

  return (
    <div className="absolute inset-0 z-30" data-testid="modifier-sheet">
      <button
        type="button"
        aria-label="Закрити"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={productName}
        className="absolute inset-x-0 bottom-0 bg-white rounded-t-sq shadow-lg animate-fade-up flex flex-col max-h-[85%]"
      >
        <div className="px-4 py-3 border-b border-sq-divider flex justify-between items-center gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-sq-text truncate">{productName}</h3>
            {current && (
              <p className="text-xs text-sq-secondary truncate">
                {[current.label, formatUah(current.price_cents)].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 text-sm text-sq-secondary hover:text-sq-text shrink-0"
            data-testid="modifier-close"
          >
            Закрити
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-auto select-none px-4 py-3 space-y-4">
          {variants.length > 1 && (
            <div data-testid="modifier-variants">
              <RowLabel name={variantLabel} hint="обовʼязково" />
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
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
                      {v.label || 'Стандарт'}
                      {oos ? ' · немає' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {groups.map((group) => {
            const n = countIn(group, selected);
            const full = group.max_select > 1 && n >= group.max_select;
            const hint =
              group.min_select >= 1
                ? group.max_select > 1
                  ? `обовʼязково · до ${group.max_select}`
                  : 'обовʼязково'
                : group.max_select > 1
                  ? full
                    ? `не більше ${group.max_select}`
                    : `до ${group.max_select}`
                  : null;
            return (
              <div key={group.id} data-testid={`modifier-group-${group.id}`}>
                <RowLabel name={group.name} hint={hint} />
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
                        {modifier.name}
                        {deltaText(modifier.price_delta_cents)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-sq-divider px-4 py-3 space-y-2">
          <input
            className="pos-field w-full"
            value={note}
            maxLength={MAX_LINE_NOTE}
            placeholder="Коментар для кухні"
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
          {error && (
            <p className="text-xs text-red-600" data-testid="modifier-error">
              {error}
            </p>
          )}
          <button
            type="button"
            className="pos-btn-primary w-full min-h-12"
            disabled={!canAdd}
            onClick={submit}
            data-testid="modifier-add"
          >
            {submitLabel}
            {priceCents != null && (
              <>
                {' · '}
                <span data-testid="modifier-price">{formatUah(priceCents)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function RowLabel({ name, hint }: { name: string; hint: string | null }) {
  return (
    <p className="text-xs font-semibold text-sq-secondary mb-2">
      {name}
      {hint && <span className="font-normal"> · {hint}</span>}
    </p>
  );
}

function chipClass(on: boolean, blocked: boolean): string {
  return [
    'min-h-11 px-3 rounded-full border text-sm font-medium transition-colors',
    on ? 'border-sq-blue bg-sq-blue text-white' : 'border-sq-divider bg-white text-sq-text',
    blocked ? 'opacity-40' : '',
  ].join(' ');
}

/** «+15,00 ₴» / «−20,00 ₴»; nothing for a free answer. */
function deltaText(deltaCents: number): string {
  if (deltaCents > 0) return ` +${formatUah(deltaCents)}`;
  if (deltaCents < 0) return ` −${formatUah(-deltaCents)}`;
  return '';
}
