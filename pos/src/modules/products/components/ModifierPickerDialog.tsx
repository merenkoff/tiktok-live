// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useState } from 'react';
import type { ModifierGroup, Product } from '@pos/platform';
import { Check, Plus, Search, Segmented } from '@pos/platform/ui';
import { Dialog } from './Dialog';
import { chipClass } from './formStyles';
import {
  answersPreview,
  groupMatches,
  matchesWords,
  nounFor,
  queryWords,
  ruleText,
  suggestGroups,
  usageText,
  type GroupSuggestion,
} from '../lib/modifierWords';

type Mode = 'groups' | 'copy';

/** One question in the list: tick it, read what it asks and where. */
function GroupOption({
  group,
  on,
  note,
  onToggle,
}: {
  group: ModifierGroup;
  on: boolean;
  /** «у 12 стравах», or for a suggestion «питають 8 з 10 схожих». */
  note: string;
  onToggle: () => void;
}) {
  const preview = answersPreview(group, 5);
  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        data-testid={`modifier-option-${group.id}`}
        className={`w-full text-left flex items-start gap-3 p-3 rounded-xl ${
          on ? 'bg-sq-blue/[0.08] ring-2 ring-inset ring-sq-blue' : 'ring-1 ring-inset ring-sq-divider hover:bg-sq-sidebar'
        }`}
      >
        <span
          className={`mt-0.5 w-5 h-5 shrink-0 rounded-md grid place-items-center ${
            on ? 'bg-sq-blue text-white' : 'ring-1 ring-inset ring-sq-divider bg-sq-surface'
          }`}
          aria-hidden
        >
          {on && <Check size={14} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[15px] font-semibold text-sq-text">{group.name}</span>
            <span className="text-[13px] text-sq-muted">{ruleText(group)}</span>
          </span>
          <span className="block text-[14px] text-sq-secondary leading-snug">
            {preview || 'ще без відповідей — каса не спитає'}
          </span>
          <span className="block text-[13px] text-sq-muted">{note}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * «Додати модифікатор» in the product card.
 *
 * What it replaces is a wall of chips — every question of the store, by name
 * only. Here a question is found by typing (its name or any of its answers:
 * «вівсяне» finds «Молоко»), read before it is chosen (answers, prices, where
 * else it is asked), and the ones the product's neighbours ask come first.
 * Nothing fits? The typed words become a new question without leaving the
 * card. And a dish that should ask exactly what another one asks copies it.
 */
export function ModifierPickerDialog({
  groups,
  products,
  attached,
  productId,
  tagIds,
  dish,
  onAdd,
  onCreate,
  onClose,
}: {
  groups: ModifierGroup[];
  products: Product[];
  /** What the card already asks — not offered again. */
  attached: number[];
  productId?: number;
  tagIds: number[];
  dish: boolean;
  onAdd: (groupIds: number[]) => void;
  /** «Create a new one», with whatever was typed into the search. */
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('groups');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const noun = nounFor(dish);
  const words = queryWords(query);

  const available = useMemo(
    () => groups.filter((g) => g.is_active && !attached.includes(g.id)),
    [groups, attached]
  );
  const suggestions = useMemo(
    () => suggestGroups(groups, products, tagIds, { productId, exclude: attached }),
    [groups, products, tagIds, productId, attached]
  );
  const usage = (g: ModifierGroup) => {
    const n = (g.product_ids ?? []).filter((id) => id !== productId).length;
    return n === 0 ? 'ще ніде не питають' : usageText(n, noun);
  };

  const filtered = available
    .filter((g) => groupMatches(g, words))
    .sort(
      (a, b) =>
        (b.product_ids?.length ?? 0) - (a.product_ids?.length ?? 0) || a.name.localeCompare(b.name, 'uk')
    );
  const suggestedIds = new Set(suggestions.map((s) => s.group.id));
  const showSuggestions = words.length === 0 && suggestions.length > 0;
  const rest = showSuggestions ? filtered.filter((g) => !suggestedIds.has(g.id)) : filtered;

  // «Як у страві»: the products that ask anything, found by name.
  const donors = useMemo(
    () =>
      products
        .filter((p) => p.is_active && p.id !== productId && (p.modifier_group_ids?.length ?? 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    [products, productId]
  );
  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const shownDonors = donors.filter((p) => matchesWords(p.name, words)).slice(0, 40);

  function toggle(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function suggestionNote(s: GroupSuggestion): string {
    return `питають ${s.asking} з ${s.outOf} схожих · ${usage(s.group)}`;
  }

  return (
    <Dialog
      title="Додати модифікатор"
      description={
        dish
          ? 'Що каса спитає про цю страву: молоко, соус, просмаження, гарнір.'
          : 'Що каса спитає про цей товар при продажу.'
      }
      size="lg"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === 'groups' && picked.length > 0) onAdd(picked);
      }}
      testId="modifier-picker"
      footer={
        <>
          <button
            type="button"
            className="sq-btn-quiet mr-auto"
            onClick={() => onCreate(mode === 'groups' ? query.trim() : '')}
            data-testid="modifier-picker-create"
          >
            <Plus size={18} />
            Створити новий
          </button>
          <button type="button" className="sq-btn-quiet" onClick={onClose}>
            Скасувати
          </button>
          {mode === 'groups' && (
            <button
              type="submit"
              className="pos-btn-primary min-h-11 px-6 rounded-sq text-[15px] disabled:opacity-50"
              disabled={picked.length === 0}
              data-testid="modifier-picker-add"
            >
              {picked.length > 0 ? `Додати (${picked.length})` : 'Додати'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[12rem]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none" />
            <input
              className="sq-input !pl-9"
              placeholder={mode === 'groups' ? 'Пошук: «молоко», «вівсяне», «соус»…' : `Назва ${dish ? 'страви' : 'товару'}…`}
              aria-label="Пошук"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="modifier-picker-search"
            />
          </div>
          {donors.length > 0 && (
            <Segmented
              ariaLabel="Що шукати"
              value={mode}
              options={[
                { value: 'groups', label: 'Модифікатори', testId: 'modifier-picker-mode-groups' },
                { value: 'copy', label: dish ? 'Як у страві…' : 'Як у товарі…', testId: 'modifier-picker-mode-copy' },
              ]}
              onChange={(next) => {
                setMode(next);
                setQuery('');
              }}
            />
          )}
        </div>

        {mode === 'groups' && (
          <>
            {showSuggestions && (
              <section className="space-y-2" data-testid="modifier-picker-suggested">
                <p className="text-[13px] font-semibold text-sq-secondary">
                  Питають схожі {dish ? 'страви' : 'товари'} — з тими самими мітками
                </p>
                <ul className="space-y-2">
                  {suggestions.map((s) => (
                    <GroupOption
                      key={s.group.id}
                      group={s.group}
                      on={picked.includes(s.group.id)}
                      note={suggestionNote(s)}
                      onToggle={() => toggle(s.group.id)}
                    />
                  ))}
                </ul>
              </section>
            )}

            {rest.length > 0 && (
              <section className="space-y-2">
                {showSuggestions && <p className="text-[13px] font-semibold text-sq-secondary">Усі інші</p>}
                <ul className="space-y-2">
                  {rest.map((group) => (
                    <GroupOption
                      key={group.id}
                      group={group}
                      on={picked.includes(group.id)}
                      note={usage(group)}
                      onToggle={() => toggle(group.id)}
                    />
                  ))}
                </ul>
              </section>
            )}

            {filtered.length === 0 && (
              <div className="py-6 text-center space-y-3" data-testid="modifier-picker-empty">
                <p className="text-[15px] text-sq-secondary">
                  {available.length === 0
                    ? groups.length === 0
                      ? 'Ще жодного модифікатора. Створіть перший — потім він знадобиться й іншим позиціям.'
                      : 'Усі модифікатори вже додано до цієї картки.'
                    : `Нічого не знайдено за «${query.trim()}».`}
                </p>
                <button
                  type="button"
                  className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px] gap-1.5"
                  onClick={() => onCreate(query.trim())}
                  data-testid="modifier-picker-create-named"
                >
                  <Plus size={18} />
                  {query.trim() ? `Створити «${query.trim()}»` : 'Створити модифікатор'}
                </button>
              </div>
            )}
          </>
        )}

        {mode === 'copy' && (
          <section className="space-y-2" data-testid="modifier-picker-donors">
            <p className="text-[13px] text-sq-muted">
              Оберіть {dish ? 'страву' : 'товар'} — ця картка питатиме те саме й у тому самому порядку.
            </p>
            <ul className="space-y-2">
              {shownDonors.map((product) => {
                const names = (product.modifier_group_ids ?? [])
                  .map((id) => byId.get(id)?.name)
                  .filter((name): name is string => !!name);
                const fresh = (product.modifier_group_ids ?? []).filter((id) => !attached.includes(id) && byId.has(id));
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      disabled={fresh.length === 0}
                      onClick={() => onAdd(fresh)}
                      data-testid={`modifier-donor-${product.id}`}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-xl ring-1 ring-inset ring-sq-divider hover:bg-sq-sidebar disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-sq-text truncate">{product.name}</span>
                        <span className="block text-[14px] text-sq-secondary truncate">{names.join(' · ')}</span>
                      </span>
                      <span className={`${chipClass} shrink-0 bg-sq-blue/10 text-sq-blue-press`}>
                        {fresh.length === 0 ? 'уже додано' : `+${fresh.length}`}
                      </span>
                    </button>
                  </li>
                );
              })}
              {shownDonors.length === 0 && (
                <li className="py-6 text-center text-[15px] text-sq-secondary">Нічого не знайдено.</li>
              )}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
