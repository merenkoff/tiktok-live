// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, useVertical } from '@pos/platform';
import type { ModifierGroup, PosTag, Product } from '@pos/platform';
import { Layers, MoreHorizontal, PageHeader, Pencil, Plus, Search } from '@pos/platform/ui';
import { ConfirmSheet } from '../../../components/cashier/ConfirmSheet';
import { GroupProductsDialog } from '../components/GroupProductsDialog';
import { ModifierGroupDialog } from '../components/ModifierGroupDialog';
import { chipClass } from '../components/formStyles';
import { errorText } from '../components/modifierInput';
import { productFormScope } from '../components/productFormScope';
import { flattenTags } from '../components/tagLabels';
import { saveGroupWhole, setGroupActive } from '../data/modifiersApi';
import { draftOfGroup, toWholeInput } from '../lib/groupDraft';
import { useMenuOnly } from '../lib/menuOnly';
import { ingredientOptions } from '../lib/ingredientOptions';
import {
  PROBLEM_WORDS,
  answersPreview,
  countText,
  groupMatches,
  groupProblems,
  namesPreview,
  nounFor,
  productsAsking,
  queryWords,
  ruleText,
  type GroupProblem,
} from '../lib/modifierWords';

type Filter = 'all' | GroupProblem;

type Sheet =
  | { kind: 'create' }
  | { kind: 'edit'; group: ModifierGroup }
  | { kind: 'products'; group: ModifierGroup }
  | { kind: 'delete'; group: ModifierGroup };

const FILTER_LABELS: Record<GroupProblem, string> = {
  unused: 'Ніде не питають',
  no_answers: 'Без відповідей',
  off: 'Вимкнені',
};

/** A name for a copy that no other question has: «Соус (копія)», «Соус (копія 2)». */
function copyName(name: string, taken: Set<string>): string {
  for (let n = 1; n < 100; n += 1) {
    const candidate = `${name} (копія${n === 1 ? '' : ` ${n}`})`.slice(0, 80);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${name} (копія)`.slice(0, 80);
}

/**
 * The owner's modifiers — every question the till may ask («Молоко?»,
 * «Соус?») as one row that says what it asks, what the answers cost and WHO
 * asks it (TechDocs/POS_CAFE.md §3–§4, POS_VERTICALS.md §7k and §7r).
 *
 * It used to be a report: every question unfolded into a form, and nothing on
 * it that the product card could not do. What only this page does now:
 *
 * - one price for many dishes — «вівсяне +15» is changed here once and every
 *   coffee that asks «Молоко» sells it at the new price;
 * - a question for a whole category — «Страви…» ticks products by tag, so
 *   forty coffees start asking about milk in one save, not forty cards;
 * - what is wrong — a question nobody asks, one with no answers, one switched
 *   off — is a filter with a count, not something to scroll for.
 *
 * Host code in the `products` module rather than café code: a bakery will ask
 * «нарізати?» one day, and the question a product asks belongs next to the
 * product.
 */
export function ModifiersPage() {
  const vertical = useVertical();
  const menuOnly = useMenuOnly();
  const dish = productFormScope(vertical).askDishFacts;
  const noun = nounFor(dish);

  const [groups, setGroups] = useState<ModifierGroup[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [tags, setTags] = useState<PosTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Any variant of the store may be what an answer takes off the shelf — a
  // portion of syrup that is itself a recipe included, so no depth cap here.
  const options = useMemo(() => ingredientOptions(products), [products]);
  const flatTags = useMemo(() => flattenTags(tags), [tags]);

  const reload = useCallback(async () => {
    const [glist, plist, tlist] = await Promise.all([
      api.listModifierGroups(),
      api.getProducts(),
      // The tags only feed the bulk picker's filter: without them it still works.
      api.getTags().catch(() => [] as PosTag[]),
    ]);
    setGroups(glist);
    setProducts(plist);
    setTags(tlist);
  }, []);

  useEffect(() => {
    void reload().catch(() => {
      setGroups([]);
      setError('Не вдалося завантажити');
    });
  }, [reload]);

  // The «⋯» menu closes on a tap anywhere else.
  useEffect(() => {
    if (menu == null) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  function putGroup(next: ModifierGroup) {
    setGroups((prev) => {
      const list = prev ?? [];
      return list.some((g) => g.id === next.id) ? list.map((g) => (g.id === next.id ? next : g)) : [...list, next];
    });
  }

  async function toggleActive(group: ModifierGroup) {
    setMenu(null);
    setError(null);
    try {
      putGroup(await setGroupActive(group.id, !group.is_active));
    } catch (err) {
      setError(errorText(err, 'Не вдалося змінити'));
    }
  }

  async function duplicate(group: ModifierGroup) {
    setMenu(null);
    setError(null);
    try {
      const input = toWholeInput(draftOfGroup(group), { writeOffs: !menuOnly });
      const taken = new Set((groups ?? []).map((g) => g.name.toLowerCase()));
      const copy = await saveGroupWhole(null, {
        ...input,
        name: copyName(group.name, taken),
        modifiers: input.modifiers.map(({ id: _id, ...rest }) => rest),
      });
      putGroup(copy);
      // A copy exists to be made different: open it straight away.
      setSheet({ kind: 'edit', group: copy });
    } catch (err) {
      setError(errorText(err, 'Не вдалося дублювати'));
    }
  }

  async function remove(group: ModifierGroup) {
    setSheet(null);
    setError(null);
    try {
      await api.deleteModifierGroup(group.id);
      setGroups((prev) => (prev ?? []).filter((g) => g.id !== group.id));
      // The products' own lists of questions changed with it.
      void reload().catch(() => undefined);
    } catch (err) {
      setError(errorText(err, 'Не вдалося видалити'));
    }
  }

  const list = useMemo(
    () => [...(groups ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    [groups]
  );
  const problemCounts = useMemo(() => {
    const counts: Record<GroupProblem, number> = { unused: 0, no_answers: 0, off: 0 };
    for (const group of list) for (const problem of groupProblems(group)) counts[problem] += 1;
    return counts;
  }, [list]);
  const words = queryWords(query);
  const shown = list.filter(
    (group) => groupMatches(group, words) && (filter === 'all' || groupProblems(group).includes(filter))
  );

  const filterChip = (value: Filter, label: string, count: number) => {
    const on = filter === value;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={on}
        onClick={() => setFilter(value)}
        data-testid={`modifiers-filter-${value}`}
        className={`inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full text-[14px] whitespace-nowrap ${
          on
            ? 'bg-sq-blue text-white font-semibold'
            : 'bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text font-medium hover:bg-sq-sidebar'
        }`}
      >
        {label}
        <span className={`tabular-nums text-[13px] font-normal ${on ? 'text-white/80' : 'text-sq-muted'}`}>{count}</span>
      </button>
    );
  };

  return (
    <div className="animate-fade-up text-sq-text max-w-5xl">
      <PageHeader
        glyph={Layers}
        title="Модифікатори"
        subtitle={
          <>
            Питання, які каса ставить про {dish ? 'страву' : 'товар'}, — «Молоко?», «Соус?» — і відповіді з
            доплатами. Одне питання служить багатьом {dish ? 'стравам' : 'товарам'}: змініть ціну відповіді
            тут — і вона зміниться всюди, де його питають.
          </>
        }
        actions={
          <button
            type="button"
            className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-1.5"
            onClick={() => setSheet({ kind: 'create' })}
            data-testid="modifiers-new"
          >
            <Plus size={20} />
            Новий модифікатор
          </button>
        }
      />

      <div className="space-y-4">
        {error && (
          <div className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" role="alert" data-testid="modifiers-error">
            {error}
          </div>
        )}
        {flash && (
          <div className="rounded-sq bg-emerald-50 text-emerald-800 px-4 py-3 text-sm" role="status" data-testid="modifiers-flash">
            {flash}
          </div>
        )}

        {groups === null && <p className="text-[15px] text-sq-muted">Завантаження…</p>}

        {groups !== null && list.length === 0 && (
          <div className="rounded-card bg-sq-surface shadow-card p-6 sm:p-8 space-y-5" data-testid="modifiers-empty">
            <div className="flex items-center gap-3">
              <Layers size={40} />
              <p className="text-[19px] font-bold text-sq-heading">Як це працює</p>
            </div>
            <ol className="space-y-3 text-[15px] text-sq-text leading-relaxed">
              <li>
                <span className="font-semibold">1. Питання й відповіді.</span> «Молоко: звичайне, вівсяне +15 ₴,
                кокосове +20 ₴». Є готові заготовки — молоко, сироп, просмаження, гарнір, соус.
              </li>
              <li>
                <span className="font-semibold">2. Кому його ставити.</span> Одразу всій категорії — кнопкою
                «{dish ? 'Страви' : 'Товари'}…» — або по одній, у{' '}
                <Link to="/admin/products" className="sq-link">
                  картці {dish ? 'страви' : 'товару'}
                </Link>
                .
              </li>
              <li>
                <span className="font-semibold">3. На касі.</span> Касир торкається позиції — каса питає, додає
                доплату до ціни, а відповідь списує свій інгредієнт: «вівсяне» — вівсяне молоко, не звичайне.
              </li>
            </ol>
            <button
              type="button"
              className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px] gap-1.5"
              onClick={() => setSheet({ kind: 'create' })}
              data-testid="modifiers-first"
            >
              <Plus size={20} />
              Створити перший модифікатор
            </button>
          </div>
        )}

        {list.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[14rem] max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none" />
                <input
                  className="sq-input !pl-9"
                  placeholder="Пошук: питання або відповідь…"
                  aria-label="Пошук"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  data-testid="modifiers-search"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {filterChip('all', 'Усі', list.length)}
                {(Object.keys(FILTER_LABELS) as GroupProblem[])
                  .filter((problem) => problemCounts[problem] > 0 || filter === problem)
                  .map((problem) => filterChip(problem, FILTER_LABELS[problem], problemCounts[problem]))}
              </div>
            </div>

            <ul className="space-y-3">
              {shown.map((group) => {
                const asking = productsAsking(group, products);
                const problems = groupProblems(group);
                const preview = answersPreview(group, 6);
                return (
                  <li
                    key={group.id}
                    className={`rounded-card bg-sq-surface shadow-card p-4 sm:p-5 ${group.is_active ? '' : 'opacity-75'}`}
                    data-testid={`group-card-${group.id}`}
                  >
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1 basis-64">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <h3 className="text-[17px] font-bold text-sq-heading">{group.name}</h3>
                          <span className="text-[13px] text-sq-muted">{ruleText(group)}</span>
                          {problems.map((problem) => (
                            <span
                              key={problem}
                              className={`${chipClass} self-center ${
                                problem === 'off'
                                  ? 'ring-1 ring-inset ring-sq-divider text-sq-secondary'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                              data-testid={`group-problem-${problem}`}
                            >
                              {PROBLEM_WORDS[problem]}
                            </span>
                          ))}
                        </div>
                        <p className="mt-1 text-[15px] text-sq-secondary leading-snug" data-testid="group-answers">
                          {preview || 'Додайте відповіді — без них каса питання не покаже.'}
                        </p>
                        <button
                          type="button"
                          className="mt-1.5 text-left text-[14px] text-sq-blue font-medium hover:underline"
                          onClick={() => setSheet({ kind: 'products', group })}
                          data-testid={`group-usage-${group.id}`}
                        >
                          {asking.length === 0
                            ? `Додати до ${dish ? 'страв' : 'товарів'}…`
                            : `${countText(asking.length, noun)}: ${namesPreview(asking.map((p) => p.name), 4)}`}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          type="button"
                          className="sq-btn-quiet"
                          onClick={() => setSheet({ kind: 'edit', group })}
                          data-testid={`group-edit-${group.id}`}
                        >
                          <Pencil size={18} />
                          Змінити
                        </button>
                        <button
                          type="button"
                          className="sq-btn-quiet"
                          onClick={() => setSheet({ kind: 'products', group })}
                          data-testid={`group-products-${group.id}`}
                        >
                          {dish ? 'Страви' : 'Товари'}…
                        </button>
                        <div className="relative" ref={menu === group.id ? menuRef : undefined}>
                          <button
                            type="button"
                            className="w-11 h-11 grid place-items-center rounded-sq text-sq-secondary hover:bg-sq-sidebar"
                            aria-label={`Ще дії: ${group.name}`}
                            aria-expanded={menu === group.id}
                            onClick={() => setMenu(menu === group.id ? null : group.id)}
                            data-testid={`group-more-${group.id}`}
                          >
                            <MoreHorizontal size={20} />
                          </button>
                          {menu === group.id && (
                            <div
                              role="menu"
                              className="absolute right-0 top-full mt-1 z-20 w-56 rounded-xl bg-white shadow-[0_12px_32px_rgba(0,20,60,.2)] ring-1 ring-sq-divider p-1.5"
                            >
                              {/* A copy carries what each answer writes off — the
                                  kitchen's half, so not the marketer's to make (МР5). */}
                              {!(menuOnly && group.modifiers.some((m) => m.component_variant_id != null)) && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="w-full min-h-10 px-3 rounded-lg text-left text-[15px] text-sq-text hover:bg-sq-sidebar"
                                  onClick={() => void duplicate(group)}
                                  data-testid={`group-duplicate-${group.id}`}
                                >
                                  Дублювати
                                </button>
                              )}
                              <button
                                type="button"
                                role="menuitem"
                                className="w-full min-h-10 px-3 rounded-lg text-left text-[15px] text-sq-text hover:bg-sq-sidebar"
                                onClick={() => void toggleActive(group)}
                                data-testid={`group-active-${group.id}`}
                              >
                                {group.is_active ? 'Вимкнути — каса не питатиме' : 'Увімкнути'}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="w-full min-h-10 px-3 rounded-lg text-left text-[15px] text-red-600 hover:bg-red-50"
                                onClick={() => {
                                  setMenu(null);
                                  setSheet({ kind: 'delete', group });
                                }}
                                data-testid={`group-delete-${group.id}`}
                              >
                                Видалити
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {shown.length === 0 && (
              <p className="py-8 text-center text-[15px] text-sq-secondary" data-testid="modifiers-none-found">
                Нічого не знайдено.{' '}
                <button
                  type="button"
                  className="sq-link"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Показати всі
                </button>
              </p>
            )}
          </>
        )}
      </div>

      {sheet?.kind === 'create' && (
        <ModifierGroupDialog
          group={null}
          options={options}
          dish={dish}
          onSaved={(group) => {
            putGroup(group);
            setFlash(null);
            // A question nobody asks does nothing: the next step is who asks it.
            setSheet({ kind: 'products', group });
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'edit' && (
        <ModifierGroupDialog
          group={sheet.group}
          options={options}
          dish={dish}
          others={(() => {
            const asking = productsAsking(sheet.group, products);
            return { count: asking.length, names: asking.map((p) => p.name) };
          })()}
          onSaved={(group) => {
            putGroup(group);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'products' && (
        <GroupProductsDialog
          group={sheet.group}
          groups={groups ?? []}
          products={products}
          flatTags={flatTags}
          dish={dish}
          onSaved={(group, summary) => {
            putGroup(group);
            setSheet(null);
            setFlash(
              [
                `«${group.name}»:`,
                summary.added > 0 ? `додано до ${countText(summary.added, noun)}` : '',
                summary.added > 0 && summary.removed > 0 ? 'і' : '',
                summary.removed > 0 ? `прибрано з ${countText(summary.removed, noun)}` : '',
              ]
                .filter(Boolean)
                .join(' ')
            );
            // Every touched card's own list of questions moved with it.
            void reload().catch(() => undefined);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'delete' &&
        createPortal(
          <ConfirmSheet
            title={`Видалити «${sheet.group.name}»?`}
            message={(() => {
              const n = (sheet.group.product_ids ?? []).length;
              return n > 0
                ? `Його перестануть питати ${countText(n, noun)}. Уже пробиті чеки збережуть свої відповіді.`
                : 'Уже пробиті чеки збережуть свої відповіді.';
            })()}
            confirmLabel="Видалити"
            tone="danger"
            onConfirm={() => void remove(sheet.group)}
            onCancel={() => setSheet(null)}
          />,
          document.body
        )}
    </div>
  );
}
