// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useState } from 'react';
import type { ModifierGroup, PosTag, Product } from '@pos/platform';
import { Check, Search } from '@pos/platform/ui';
import { Dialog } from './Dialog';
import { TagDot } from './TagDot';
import { errorText } from './modifierInput';
import { tagPathLabel } from './tagLabels';
import { setGroupProducts } from '../data/modifiersApi';
import { countText, matchesWords, nounFor, queryWords } from '../lib/modifierWords';

type Scope = 'all' | 'picked' | number;

/**
 * Which products ask one question — set for many at once.
 *
 * The product card attaches questions one dish at a time; forty coffees are
 * forty cards. Here the question is the starting point: filter by a tag
 * («Кава»), «Обрати всі показані», save — and every coffee asks about milk.
 * A product that starts asking the question asks it last, after the ones it
 * already has; nothing else about a card changes.
 */
export function GroupProductsDialog({
  group,
  groups,
  products,
  flatTags,
  dish,
  onSaved,
  onClose,
}: {
  group: ModifierGroup;
  /** Every question — to say what else a product already asks. */
  groups: ModifierGroup[];
  products: Product[];
  flatTags: PosTag[];
  dish: boolean;
  onSaved: (group: ModifierGroup, summary: { added: number; removed: number }) => void;
  onClose: () => void;
}) {
  const initial = useMemo(() => new Set(group.product_ids ?? []), [group]);
  const [picked, setPicked] = useState<Set<number>>(() => new Set(initial));
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = nounFor(dish);

  // What can be sold asks questions; an ingredient is offered only if it
  // already asks this one (so it can be taken off).
  const candidates = useMemo(
    () =>
      products
        .filter((p) => p.is_active && (p.sellable !== false || initial.has(p.id)))
        .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    [products, initial]
  );
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const tagsInUse = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of candidates) for (const id of p.tag_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return flatTags.filter((t) => counts.has(t.id)).map((tag) => ({ tag, count: counts.get(tag.id) ?? 0 }));
  }, [candidates, flatTags]);

  const words = queryWords(query);
  const shown = candidates.filter((p) => {
    if (scope === 'picked' && !picked.has(p.id)) return false;
    if (typeof scope === 'number' && !p.tag_ids.includes(scope)) return false;
    return matchesWords(p.name, words);
  });
  const shownPicked = shown.filter((p) => picked.has(p.id)).length;
  const allShownPicked = shown.length > 0 && shownPicked === shown.length;

  const added = [...picked].filter((id) => !initial.has(id)).length;
  const removed = [...initial].filter((id) => !picked.has(id)).length;
  const dirty = added > 0 || removed > 0;

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setShown(on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const p of shown) {
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  }

  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setGroupProducts(group.id, [...picked]);
      onSaved(result.group, { added: result.added, removed: result.removed });
    } catch (err) {
      setError(errorText(err, 'Не вдалося зберегти'));
      setBusy(false);
    }
  }

  const scopeChip = (value: Scope, label: string, count: number, color?: string | null) => {
    const on = scope === value;
    return (
      <button
        key={String(value)}
        type="button"
        aria-pressed={on}
        onClick={() => setScope(value)}
        data-testid={`group-products-scope-${String(value)}`}
        className={`shrink-0 inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full text-[14px] whitespace-nowrap ${
          on
            ? 'bg-sq-blue text-white font-semibold'
            : 'bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text font-medium hover:bg-sq-sidebar'
        }`}
      >
        {color !== undefined && !on && <TagDot color={color} />}
        {label}
        <span className={`tabular-nums text-[13px] font-normal ${on ? 'text-white/80' : 'text-sq-muted'}`}>{count}</span>
      </button>
    );
  };

  return (
    <Dialog
      title={`Хто питає «${group.name}»`}
      description={`Позначте ${dish ? 'страви' : 'товари'}, для яких каса ставитиме це питання. Оберіть мітку — і додайте всю категорію одразу.`}
      size="lg"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      testId="group-products-dialog"
      footer={
        <>
          <span className="mr-auto text-[15px] text-sq-secondary" data-testid="group-products-summary">
            {dirty
              ? [added > 0 ? `додати до ${added}` : '', removed > 0 ? `прибрати з ${removed}` : '']
                  .filter(Boolean)
                  .join(', ')
              : `Питають: ${countText(picked.size, noun)}`}
          </span>
          <button type="button" className="sq-btn-quiet" onClick={onClose}>
            Скасувати
          </button>
          <button
            type="submit"
            className="pos-btn-primary min-h-11 px-6 rounded-sq text-[15px] disabled:opacity-50"
            disabled={!dirty || busy}
            data-testid="group-products-save"
          >
            {busy ? 'Збереження…' : 'Зберегти'}
          </button>
        </>
      }
    >
      <div className="space-y-3 pb-3">
        {error && (
          <div className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" role="alert">
            {error}
          </div>
        )}

        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none" />
          <input
            className="sq-input !pl-9"
            placeholder={`Назва ${dish ? 'страви' : 'товару'}…`}
            aria-label="Пошук"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="group-products-search"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {scopeChip('all', 'Усі', candidates.length)}
          {scopeChip('picked', 'Обрані', picked.size)}
          {tagsInUse.map(({ tag, count }) => scopeChip(tag.id, tagPathLabel(flatTags, tag), count, tag.color))}
        </div>

        <div className="flex items-center justify-between gap-3 min-h-9">
          <span className="text-[13px] text-sq-muted">
            Показано {shown.length}, з них обрано {shownPicked}
          </span>
          {shown.length > 0 && (
            <button
              type="button"
              className="min-h-9 px-2 rounded-lg text-[15px] font-semibold text-sq-blue hover:bg-sq-sidebar"
              onClick={() => setShown(!allShownPicked)}
              data-testid="group-products-toggle-shown"
            >
              {allShownPicked ? 'Зняти всі показані' : `Обрати всі показані (${shown.length})`}
            </button>
          )}
        </div>

        <ul className="rounded-xl ring-1 ring-inset ring-sq-divider divide-y divide-sq-divider overflow-hidden">
          {shown.map((product) => {
            const on = picked.has(product.id);
            const asks = (product.modifier_group_ids ?? [])
              .filter((id) => id !== group.id)
              .map((id) => groupName.get(id))
              .filter((name): name is string => !!name);
            return (
              <li key={product.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(product.id)}
                  data-testid={`group-products-row-${product.id}`}
                  className={`w-full text-left flex items-center gap-3 px-3 min-h-12 py-1.5 ${
                    on ? 'bg-sq-blue/[0.06]' : 'hover:bg-sq-sidebar'
                  }`}
                >
                  <span
                    className={`w-5 h-5 shrink-0 rounded-md grid place-items-center ${
                      on ? 'bg-sq-blue text-white' : 'ring-1 ring-inset ring-sq-divider bg-sq-surface'
                    }`}
                    aria-hidden
                  >
                    {on && <Check size={14} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-sq-text truncate">{product.name}</span>
                    {asks.length > 0 && (
                      <span className="block text-[13px] text-sq-muted truncate">уже питає: {asks.join(' · ')}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="px-3 py-6 text-center text-[15px] text-sq-secondary">Нічого не знайдено.</li>
          )}
        </ul>
      </div>
    </Dialog>
  );
}
