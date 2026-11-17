// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useState } from 'react';
import type { ModifierGroup, Product } from '@pos/platform';
import { ArrowDown, ArrowUp, Pencil, Plus, X } from '@pos/platform/ui';
import { ModifierGroupDialog } from './ModifierGroupDialog';
import { ModifierPickerDialog } from './ModifierPickerDialog';
import type { ComponentOption } from './componentOptions';
import { chipClass } from './formStyles';
import { answersPreview, nounFor, productsAsking, ruleText, suggestGroups, usageText } from '../lib/modifierWords';

type Sheet = { kind: 'picker' } | { kind: 'create'; name: string } | { kind: 'edit'; group: ModifierGroup };

/**
 * What the product asks at the till, in the order it asks it.
 *
 * Each question is a row that can be READ — its answers with their prices,
 * its rule, and how many other products share it — instead of a chip with a
 * name. The order is the till's order and is changed with the arrows. A
 * question is added from a searchable picker, created on the spot, copied
 * from another product, or — the fastest path for the twentieth coffee — taken
 * with one tap from «схожі питають», the questions the product's neighbours
 * under the same tags already ask.
 *
 * Which questions are attached is part of the card's draft and is saved with
 * the card. The questions themselves are shared between products, so the
 * editor opened from here writes at once — and says who else will see it.
 */
export function ProductModifiers({
  groups,
  products,
  value,
  onChange,
  productId,
  productName,
  tagIds,
  options,
  dish,
  onGroupSaved,
}: {
  /** Every question of the store. */
  groups: ModifierGroup[];
  products: Product[];
  /** The ids this card asks, in order. */
  value: number[];
  onChange: (next: number[]) => void;
  /** Absent on a card that is still being created. */
  productId?: number;
  productName: string;
  tagIds: number[];
  /** What an answer may take off the shelf. */
  options: ComponentOption[];
  dish: boolean;
  /** A question was created or changed on the server: the card's list of them follows. */
  onGroupSaved: (group: ModifierGroup) => void;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const noun = nounFor(dish);
  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const suggestions = useMemo(
    () => suggestGroups(groups, products, tagIds, { productId, exclude: value }).slice(0, 4),
    [groups, products, tagIds, productId, value]
  );

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function othersOf(group: ModifierGroup) {
    const asking = productsAsking(group, products).filter((p) => p.id !== productId);
    return { count: asking.length, names: asking.map((p) => p.name) };
  }

  return (
    <div className="space-y-3" data-testid="product-modifiers">
      {value.length === 0 && (
        <p className="text-[15px] text-sq-muted leading-relaxed">
          {dish
            ? 'Каса нічого не питає про цю страву. Додайте «Молоко», «Соус» чи «Просмаження» — касир обере відповідь одним дотиком.'
            : 'Каса нічого не питає про цей товар.'}
        </p>
      )}

      <ol className="space-y-2">
        {value.map((id, index) => {
          const group = byId.get(id);
          if (!group) {
            return (
              <li
                key={id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl ring-1 ring-inset ring-sq-divider text-[15px] text-sq-muted"
              >
                Модифікатор видалено
                <button
                  type="button"
                  className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty"
                  aria-label="Прибрати"
                  onClick={() => onChange(value.filter((x) => x !== id))}
                >
                  <X size={18} />
                </button>
              </li>
            );
          }
          const others = othersOf(group);
          const preview = answersPreview(group, 5);
          return (
            <li
              key={id}
              className="rounded-xl bg-sq-surface ring-1 ring-inset ring-sq-divider p-3 flex flex-wrap items-start gap-x-3 gap-y-1.5"
              data-testid={`product-modifier-${id}`}
            >
              <span className="mt-0.5 min-w-5 h-5 px-1 rounded-full bg-sq-blue text-white text-[11px] font-semibold tabular-nums grid place-items-center shrink-0">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 basis-52">
                <p className="flex flex-wrap items-baseline gap-x-2 leading-snug">
                  <span className="text-[15px] font-semibold text-sq-text">{group.name}</span>
                  <span className="text-[13px] text-sq-muted">{ruleText(group)}</span>
                </p>
                <p className="mt-0.5 text-[14px] text-sq-secondary leading-snug">
                  {preview || <span className="text-amber-700">Немає відповідей — каса не спитає</span>}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {!group.is_active && (
                    <span className={`${chipClass} bg-amber-50 text-amber-800`}>вимкнено — каса не питає</span>
                  )}
                  <span className="text-[13px] text-sq-muted">
                    {others.count === 0 ? 'лише тут' : `ще ${usageText(others.count, noun)}`}
                  </span>
                </p>
              </div>

              <div className="ml-auto flex items-center gap-0.5">
                <button
                  type="button"
                  className="min-h-9 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[14px] font-semibold text-sq-blue hover:bg-sq-sidebar"
                  onClick={() => setSheet({ kind: 'edit', group })}
                  data-testid={`product-modifier-edit-${id}`}
                >
                  <Pencil size={16} />
                  Відповіді й ціни
                </button>
                {value.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="w-9 h-9 grid place-items-center rounded-lg text-sq-secondary hover:bg-sq-sidebar disabled:opacity-25"
                      aria-label={`«${group.name}» питати раніше`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      data-testid={`product-modifier-up-${id}`}
                    >
                      <ArrowUp size={18} />
                    </button>
                    <button
                      type="button"
                      className="w-9 h-9 grid place-items-center rounded-lg text-sq-secondary hover:bg-sq-sidebar disabled:opacity-25"
                      aria-label={`«${group.name}» питати пізніше`}
                      disabled={index === value.length - 1}
                      onClick={() => move(index, 1)}
                      data-testid={`product-modifier-down-${id}`}
                    >
                      <ArrowDown size={18} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="w-9 h-9 grid place-items-center rounded-lg text-sq-secondary hover:bg-sq-sidebar"
                  aria-label={`Прибрати «${group.name}»`}
                  onClick={() => onChange(value.filter((x) => x !== id))}
                  data-testid={`product-modifier-remove-${id}`}
                >
                  <X size={18} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {suggestions.length > 0 && (
        <div className="space-y-1.5" data-testid="product-modifier-suggestions">
          <p className="text-[13px] text-sq-muted">Схожі {dish ? 'страви' : 'товари'} питають:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.group.id}
                type="button"
                title={answersPreview(s.group, 6)}
                className="inline-flex items-center gap-1 min-h-9 pl-2 pr-3 rounded-[10px] bg-sq-surface ring-1 ring-inset ring-sq-divider text-[15px] font-medium text-sq-text hover:bg-sq-sidebar"
                onClick={() => onChange([...value, s.group.id])}
                data-testid={`product-modifier-suggest-${s.group.id}`}
              >
                <Plus size={16} className="text-sq-blue" />
                {s.group.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="min-h-11 px-4 rounded-[10px] inline-flex items-center justify-center gap-1.5 text-[15px] font-semibold text-sq-blue ring-1 ring-inset ring-sq-divider bg-sq-surface hover:bg-sq-sidebar"
        onClick={() => setSheet(groups.length === 0 ? { kind: 'create', name: '' } : { kind: 'picker' })}
        data-testid="product-modifier-add"
      >
        <Plus size={18} />
        {groups.length === 0 ? 'Новий модифікатор' : 'Додати модифікатор'}
      </button>

      {sheet?.kind === 'picker' && (
        <ModifierPickerDialog
          groups={groups}
          products={products}
          attached={value}
          productId={productId}
          tagIds={tagIds}
          dish={dish}
          onAdd={(ids) => {
            onChange([...value, ...ids.filter((id) => !value.includes(id))]);
            setSheet(null);
          }}
          onCreate={(name) => setSheet({ kind: 'create', name })}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'create' && (
        <ModifierGroupDialog
          group={null}
          initialName={sheet.name}
          options={options}
          dish={dish}
          onSaved={(group) => {
            onGroupSaved(group);
            onChange([...value, group.id]);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'edit' && (
        <ModifierGroupDialog
          group={sheet.group}
          options={options}
          dish={dish}
          others={othersOf(sheet.group)}
          fork={{ productName }}
          onSaved={(group, how) => {
            onGroupSaved(group);
            // «Лише для цієї страви»: the card asks its own copy in the same place.
            if (how === 'forked') onChange(value.map((id) => (id === sheet.group.id ? group.id : id)));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
