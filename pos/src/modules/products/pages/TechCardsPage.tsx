// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, uahInputToCents, useVertical } from '@pos/platform';
import type { ModifierGroup, PosTag, Product } from '@pos/platform';
import { ChevronRight, FileText, PageHeader, Search, Segmented } from '@pos/platform/ui';
import { RecipeDialog } from '../components/RecipeDialog';
import { ReplaceIngredientDialog } from '../components/ReplaceIngredientDialog';
import { TechCardsImportDialog } from '../components/TechCardsImportDialog';
import { chipClass } from '../components/formStyles';
import { productFormScope } from '../components/productFormScope';
import { flattenTags, tagPathLabel } from '../components/tagLabels';
import { foodCostPercent } from '../data/techCards';
import { parseTargetPercent, useFoodCostTarget } from '../lib/foodCostTarget';
import { ingredientOptions } from '../lib/ingredientOptions';
import { matchesWords, plural, queryWords } from '../lib/modifierWords';
import { centsToInput } from '../lib/productDraft';
import {
  buildCostIndex,
  humanPriceToBaseCents,
  moneyText,
  pricingUnit,
  type CostIndex,
} from '../lib/recipeCost';
import {
  PROBLEM_TEXT,
  dishRows,
  ingredientRows,
  needsAttention,
  noRecipeProducts,
  overTarget,
  prepRows,
  type DishRow,
  type IngredientRow,
  type SizeRow,
} from '../lib/techCardLists';

type Tab = 'dishes' | 'preps' | 'ingredients';
type Show = 'all' | 'attention' | 'over' | 'none';

/**
 * How alarming a food cost is. With the owner's own target, anything over it
 * is amber; with none, the screen stays deliberately coarse — a florist's
 * bouquet and a café's coffee live at different numbers. Red is reserved for
 * the case nobody argues with: the dish costs more than it sells for.
 */
function toneOf(bps: number, targetBps: number | null): 'red' | 'amber' | 'plain' {
  if (bps >= 10000) return 'red';
  if (targetBps != null ? bps > targetBps : bps >= 5000) return 'amber';
  return 'plain';
}

/** «5 кг», «750 г», «12 шт» — the shelf, read the way it is bought. */
function stockText(quantity: number, unit: string): string {
  const { per, label } = pricingUnit(unit);
  if (per > 1 && Math.abs(quantity) >= per) {
    return `${String(Math.round((quantity / per) * 1000) / 1000).replace('.', ',')} ${label}`;
  }
  return `${quantity} ${unit || 'шт'}`;
}

function SizeLine({ size, single, targetBps }: { size: SizeRow; single: boolean; targetBps: number | null }) {
  const tone = size.bps == null ? 'plain' : toneOf(size.bps, targetBps);
  const width = size.bps == null ? 0 : Math.min(100, size.bps / 100);
  return (
    <div className="flex items-center gap-3 min-h-8 text-[15px] tabular-nums" data-testid={`tech-size-${size.variantId}`}>
      {!single && <span className="w-14 shrink-0 text-[14px] text-sq-secondary truncate">{size.label || '—'}</span>}
      <span className="w-20 shrink-0 text-right text-sq-secondary">
        {size.priceCents > 0 ? moneyText(size.priceCents) : '—'}
      </span>
      <span className="w-24 shrink-0 text-right text-sq-text">
        {size.cost.lines.length === 0 ? '—' : size.cost.unpriced ? `від ${moneyText(size.cost.cents)}` : moneyText(size.cost.cents)}
      </span>
      <span className="flex-1 min-w-[7rem] flex items-center gap-2">
        {size.bps != null ? (
          <>
            <span className="flex-1 h-1.5 rounded-full bg-sq-empty overflow-hidden" aria-hidden>
              <span
                className={`block h-full rounded-full ${
                  tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-sq-blue'
                }`}
                style={{ width: `${width}%` }}
              />
            </span>
            <span
              className={`w-16 shrink-0 text-right ${
                tone === 'red' ? 'text-red-600 font-semibold' : tone === 'amber' ? 'text-amber-700 font-medium' : 'text-sq-text'
              }`}
              data-testid="tech-food-cost"
            >
              {foodCostPercent(size.bps)}
            </span>
          </>
        ) : (
          <span className="text-[14px] text-amber-700 truncate" data-testid="tech-reason">
            {size.cost.lines.length === 0
              ? 'немає рецепта'
              : size.cost.unpriced
                ? `немає ціни: ${size.cost.missing.slice(0, 2).join(', ')}${size.cost.missing.length > 2 ? '…' : ''}`
                : 'немає ціни продажу'}
          </span>
        )}
      </span>
      <span className="hidden sm:block w-24 shrink-0 text-right text-sq-secondary">
        {size.bps != null ? moneyText(size.priceCents - size.cost.cents) : ''}
      </span>
    </div>
  );
}

function DishCard({
  row,
  targetBps,
  usedIn,
  onOpen,
}: {
  row: DishRow;
  targetBps: number | null;
  /** A prep: how many dishes take it. */
  usedIn?: number;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid={`tech-card-${row.productId}`}
        className="w-full text-left rounded-card bg-sq-surface shadow-card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 hover:bg-sq-sidebar/60 transition-colors"
      >
        <span className="min-w-0 flex-1 basis-52">
          <span className="block text-[16px] font-semibold text-sq-heading truncate">{row.name}</span>
          <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {row.problems.map((problem) => (
              <span
                key={problem}
                className={`${chipClass} ${problem === 'loss' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}
              >
                {PROBLEM_TEXT[problem]}
              </span>
            ))}
            {row.madeAhead && <span className={`${chipClass} ring-1 ring-inset ring-sq-divider text-sq-secondary`}>наперед</span>}
            {usedIn != null && (
              <span className="text-[13px] text-sq-muted">
                {usedIn === 0 ? 'ніде не використовується' : `у ${usedIn} ${plural(usedIn, ['рецепті', 'рецептах', 'рецептах'])}`}
              </span>
            )}
          </span>
        </span>
        <span className="basis-full md:basis-[30rem] md:grow-0 min-w-0 flex flex-col">
          {row.sizes.map((size) => (
            <SizeLine key={size.variantId} size={size} single={row.sizes.length === 1} targetBps={targetBps} />
          ))}
        </span>
        <ChevronRight size={18} className="hidden md:block shrink-0 text-sq-muted" />
      </button>
    </li>
  );
}

/** The purchase price of one ingredient, typed where it is read. */
function PriceCell({ row, onSave }: { row: IngredientRow; onSave: (baseCents: number) => Promise<void> }) {
  const { per, label } = pricingUnit(row.unit);
  const stored = row.costCents > 0 ? centsToInput(row.costCents * per) : '';
  const [text, setText] = useState(stored);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(stored), [stored]);

  async function commit() {
    if (busy || text.trim() === stored) return;
    const base = text.trim() === '' ? 0 : humanPriceToBaseCents(uahInputToCents(text), row.unit);
    if (text.trim() !== '' && base <= 0) {
      setError(per > 1 ? `крок 10 ₴ за ${label}` : 'вкажіть ціну');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(base);
    } catch {
      setError('не збереглося');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <span className="inline-flex items-center gap-1.5">
        <input
          className={`sq-input !min-h-9 !w-24 text-right tabular-nums ${row.costCents <= 0 ? 'ring-1 ring-inset ring-amber-400' : ''}`}
          inputMode="decimal"
          placeholder="немає"
          aria-label={`Ціна закупівлі «${row.caption}» за ${label}, грн`}
          value={text}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          data-testid={`ingredient-price-${row.variantId}`}
        />
        <span className="w-10 text-[13px] text-sq-muted">₴/{label}</span>
      </span>
      {error && <span className="text-[12px] text-red-600">{error}</span>}
    </span>
  );
}

/**
 * «Техкарти» — what the menu costs to make, and what to do about it
 * (TechDocs/POS_VERTICALS.md §7p and §7s).
 *
 * It used to be a read-only table of composites whose every row led away to
 * the product card. Now it is where the job is done: a dish opens its recipe
 * in place; the filters say what cannot be trusted (an empty recipe, an
 * ingredient with no price), what loses money and what is over the owner's
 * own target; «Без рецепта» lists what is sold with nothing written off; and
 * «Інгредієнти» is the other end of the same sum — a purchase price is typed
 * there and every dish that takes it moves.
 *
 * The rule the whole screen rests on is unchanged: a dish with one unpriced
 * ingredient has NO honest food cost, so it shows «—» and the reason, never
 * 0 %. Costs are the LAST purchase prices, not an average over batches.
 */
export function TechCardsPage() {
  const vertical = useVertical();
  const dish = productFormScope(vertical).askDishFacts;
  const maxDepth = vertical.maxCompositionDepth ?? 1;
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'preps' ? 'preps' : params.get('tab') === 'ingredients' ? 'ingredients' : 'dishes';
  const rawShow = params.get('show');
  const show: Show = rawShow === 'attention' || rawShow === 'over' || rawShow === 'none' ? rawShow : 'all';

  const [products, setProducts] = useState<Product[] | null>(null);
  const [tags, setTags] = useState<PosTag[]>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tagId, setTagId] = useState<number | ''>('');
  // `?open=<product id>` — the sidebar's search lands on a dish's tech card.
  const [open, setOpen] = useState<number | null>(() => {
    const id = Number(params.get('open'));
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  const [replacing, setReplacing] = useState<IngredientRow | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [target, setTarget] = useFoodCostTarget();
  const [targetText, setTargetText] = useState(() => (target == null ? '' : String(target / 100).replace('.', ',')));

  // The search may land here while the page is already open: follow the address.
  const openParam = params.get('open');
  useEffect(() => {
    const id = Number(openParam);
    if (Number.isInteger(id) && id > 0) setOpen(id);
  }, [openParam]);

  const reload = useCallback(async () => {
    const [plist, tlist, glist] = await Promise.all([
      api.getProducts(),
      // Tags only feed a filter and modifiers only «де використовується»: the
      // page stands without either.
      api.getTags().catch(() => [] as PosTag[]),
      api.listModifierGroups().catch(() => [] as ModifierGroup[]),
    ]);
    setProducts(plist);
    setTags(tlist);
    setGroups(glist);
  }, []);

  useEffect(() => {
    void reload().catch(() => {
      setProducts([]);
      setError('Не вдалося завантажити техкарти');
    });
  }, [reload]);

  const list = useMemo(() => products ?? [], [products]);
  const costs: CostIndex = useMemo(() => buildCostIndex(list), [list]);
  const dishes = useMemo(() => dishRows(list, costs), [list, costs]);
  const preps = useMemo(() => prepRows(list, costs), [list, costs]);
  const bare = useMemo(() => (dish ? noRecipeProducts(list) : []), [list, dish]);
  const ingredients = useMemo(() => ingredientRows(list, costs, groups), [list, costs, groups]);
  const flatTags = useMemo(() => flattenTags(tags), [tags]);
  const replaceOptions = useMemo(
    () => ingredientOptions(list).filter((o) => !costs.get(o.variant_id)?.derived),
    [list, costs]
  );

  const putProduct = useCallback((next: Product) => {
    setProducts((prev) => {
      const all = prev ?? [];
      return all.some((p) => p.id === next.id) ? all.map((p) => (p.id === next.id ? next : p)) : [...all, next];
    });
  }, []);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value == null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const words = queryWords(query);
  const byText = (row: DishRow) =>
    matchesWords(row.name, words) && (tagId === '' || row.tagIds.includes(tagId));
  const shownDishes = dishes.filter(
    (row) =>
      byText(row) &&
      (show === 'attention' ? needsAttention(row) : show === 'over' ? overTarget(row, target) : true)
  );
  const shownBare = bare.filter(
    (p) => matchesWords(p.name, words) && (tagId === '' || p.tag_ids.includes(tagId))
  );
  const shownPreps = preps.filter(byText);
  const shownIngredients = ingredients.filter((row) => matchesWords(row.caption, words));

  const attentionCount = dishes.filter(needsAttention).length;
  const overCount = dishes.filter((row) => overTarget(row, target)).length;
  const prepUses = useMemo(() => {
    const uses = new Map<number, number>();
    for (const product of list) {
      if (!product.is_active) continue;
      for (const variant of product.variants) {
        const seen = new Set<number>();
        for (const part of variant.components ?? []) {
          const owner = costs.get(part.component_variant_id)?.productId;
          if (owner != null && !seen.has(owner)) {
            seen.add(owner);
            uses.set(owner, (uses.get(owner) ?? 0) + 1);
          }
        }
      }
    }
    return uses;
  }, [list, costs]);

  const filterChip = (value: Show, label: string, count: number, alert = false) => {
    const on = show === value;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={on}
        onClick={() => setParam('show', value === 'all' ? null : value)}
        data-testid={`tech-filter-${value}`}
        className={`inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full text-[14px] whitespace-nowrap ${
          on
            ? 'bg-sq-blue text-white font-semibold'
            : 'bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text font-medium hover:bg-sq-sidebar'
        }`}
      >
        {label}
        <span
          className={`tabular-nums text-[13px] font-normal ${on ? 'text-white/80' : alert && count > 0 ? 'text-amber-700 font-semibold' : 'text-sq-muted'}`}
        >
          {count}
        </span>
      </button>
    );
  };

  const opened = open == null ? null : (list.find((p) => p.id === open) ?? null);
  function closeRecipe() {
    setOpen(null);
    if (params.has('open')) setParam('open', null);
  }
  const nothingAtAll = products !== null && dishes.length === 0 && preps.length === 0;

  return (
    <div className="animate-fade-up text-sq-text max-w-5xl">
      <PageHeader
        glyph={FileText}
        title="Техкарти"
        subtitle={
          <>
            Скільки коштує зібрати {dish ? 'страву' : 'товар'} і яку частку ціни це зʼїдає. Рецепт відкривається
            тут же. Собівартість рахується{' '}
            <strong className="font-semibold text-sq-text">за останніми цінами закупівлі</strong> складників, а
            не за середньою по партіях.
          </>
        }
        actions={
          <>
            <label className="inline-flex items-center gap-2 text-[15px] text-sq-secondary" title="Ваша ціль: усе, що вище, буде позначено">
              Ціль food cost
              <input
                className="sq-input !w-16 text-right tabular-nums"
                inputMode="decimal"
                placeholder="—"
                aria-label="Ціль food cost, %"
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                onBlur={() => {
                  const bps = parseTargetPercent(targetText);
                  setTarget(bps);
                  setTargetText(bps == null ? '' : String(bps / 100).replace('.', ','));
                  if (bps == null && show === 'over') setParam('show', null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                data-testid="tech-target"
              />
              %
            </label>
            <button type="button" className="sq-btn-quiet" onClick={() => setImporting(true)}>
              Імпорт з таблиці
            </button>
          </>
        }
      />

      {importing && (
        <TechCardsImportDialog onClose={() => setImporting(false)} onApplied={() => void reload().catch(() => undefined)} />
      )}

      <div className="space-y-4">
        {error && (
          <div className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" data-testid="tech-cards-error">
            {error}
          </div>
        )}
        {flash && (
          <div className="rounded-sq bg-emerald-50 text-emerald-800 px-4 py-3 text-sm" role="status" data-testid="tech-cards-flash">
            {flash}
          </div>
        )}

        {products === null && <p className="text-[15px] text-sq-muted">Завантаження…</p>}

        {products !== null && (
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<Tab>
              ariaLabel="Що показати"
              value={tab}
              options={[
                { value: 'dishes', label: `${dish ? 'Страви' : 'Товари'} · ${dishes.length}`, testId: 'tech-tab-dishes' },
                { value: 'preps', label: `Заготовки · ${preps.length}`, testId: 'tech-tab-preps' },
                { value: 'ingredients', label: `Інгредієнти · ${ingredients.length}`, testId: 'tech-tab-ingredients' },
              ]}
              onChange={(next) => {
                const p = new URLSearchParams(params);
                if (next === 'dishes') p.delete('tab');
                else p.set('tab', next);
                p.delete('show');
                setParams(p, { replace: true });
              }}
            />
            <div className="relative flex-1 min-w-[12rem] max-w-sm">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none" />
              <input
                className="sq-input !pl-9"
                placeholder={tab === 'ingredients' ? 'Назва інгредієнта…' : 'Назва…'}
                aria-label="Пошук"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="tech-search"
              />
            </div>
            {tab !== 'ingredients' && flatTags.length > 0 && (
              <select
                className="sq-input !w-auto max-w-[14rem]"
                aria-label="Мітка"
                value={tagId}
                onChange={(e) => setTagId(e.target.value === '' ? '' : Number(e.target.value))}
                data-testid="tech-tag"
              >
                <option value="">Усі мітки</option>
                {flatTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tagPathLabel(flatTags, t)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {products !== null && tab === 'dishes' && (
          <>
            <div className="flex flex-wrap gap-2">
              {filterChip('all', 'Усі', dishes.length)}
              {filterChip('attention', 'Потребують уваги', attentionCount, true)}
              {target != null && filterChip('over', `Вище цілі ${foodCostPercent(target)}`, overCount, true)}
              {dish && filterChip('none', 'Без рецепта', bare.length)}
            </div>

            {show !== 'none' && shownDishes.length > 0 && (
              <>
                <div className="hidden md:flex items-end gap-5 px-4 text-[12px] leading-4 text-sq-muted" aria-hidden>
                  <span className="flex-1 basis-52" />
                  <span className="basis-[30rem] grow-0 flex items-center gap-3">
                    <span className="w-14 shrink-0" />
                    <span className="w-20 shrink-0 text-right">ціна</span>
                    <span className="w-24 shrink-0 text-right">собівартість</span>
                    <span className="flex-1 min-w-[7rem] text-right pr-1">food cost</span>
                    <span className="w-24 shrink-0 text-right">маржа</span>
                  </span>
                  <span className="w-[18px] shrink-0" />
                </div>
                <ul className="space-y-2">
                  {shownDishes.map((row) => (
                    <DishCard key={row.productId} row={row} targetBps={target} onOpen={() => setOpen(row.productId)} />
                  ))}
                </ul>
              </>
            )}

            {show === 'none' && (
              <>
                <p className="text-[14px] text-sq-muted leading-relaxed max-w-2xl">
                  Це продається, але нічого не списує зі складу, і собівартість невідома. Для води в пляшці так і
                  має бути; для страви, яку готують, — варто додати рецепт.
                </p>
                <ul className="rounded-card bg-sq-surface shadow-card divide-y divide-sq-divider overflow-hidden">
                  {shownBare.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 min-h-12 py-1.5" data-testid={`tech-bare-${p.id}`}>
                      <span className="min-w-0 flex-1 text-[15px] text-sq-text truncate">{p.name}</span>
                      <Link
                        to={`/admin/products/${p.id}#recipe`}
                        className="shrink-0 min-h-9 px-2 inline-flex items-center text-[15px] font-semibold text-sq-blue"
                      >
                        Додати рецепт
                      </Link>
                    </li>
                  ))}
                  {shownBare.length === 0 && (
                    <li className="px-4 py-6 text-center text-[15px] text-sq-secondary">Усе, що продається, має рецепт.</li>
                  )}
                </ul>
              </>
            )}

            {show !== 'none' && shownDishes.length === 0 && (
              <div className="py-10 flex flex-col items-center gap-3 text-center" data-testid="tech-empty">
                <FileText size={48} />
                <p className="text-[15px] text-sq-secondary max-w-md leading-relaxed">
                  {nothingAtAll ? (
                    <>
                      Тут зʼявляться {dish ? 'страви' : 'товари'}, які збирають зі складників. Додайте рецепт у{' '}
                      <Link to="/admin/products" className="text-sq-blue font-semibold">
                        картці товару
                      </Link>{' '}
                      — розділ «{dish ? 'Рецепт' : 'Склад'}»{dish && bare.length > 0 ? ', або відкрийте «Без рецепта»' : ''}.
                    </>
                  ) : show === 'attention' ? (
                    'Усім техкартам можна вірити: рецепти заповнені, ціни складників є, ніщо не продається в мінус.'
                  ) : show === 'over' ? (
                    'Жодна страва не перевищує вашу ціль.'
                  ) : (
                    'Нічого не знайдено.'
                  )}
                </p>
              </div>
            )}
          </>
        )}

        {products !== null && tab === 'preps' && (
          <>
            <p className="text-[14px] text-sq-muted leading-relaxed max-w-2xl">
              Заготовка — рецепт, який не продається сам, а йде в інші: соус, бульйон, тісто. Щоб зробити її,
              створіть товар, вимкніть «Продається на касі» й додайте йому рецепт.
            </p>
            <ul className="space-y-2">
              {shownPreps.map((row) => (
                <DishCard
                  key={row.productId}
                  row={row}
                  targetBps={null}
                  usedIn={prepUses.get(row.productId) ?? 0}
                  onOpen={() => setOpen(row.productId)}
                />
              ))}
            </ul>
            {shownPreps.length === 0 && (
              <p className="py-8 text-center text-[15px] text-sq-secondary">
                {preps.length === 0 ? 'Заготовок ще немає.' : 'Нічого не знайдено.'}
              </p>
            )}
          </>
        )}

        {products !== null && tab === 'ingredients' && (
          <>
            <p className="text-[14px] text-sq-muted leading-relaxed max-w-2xl">
              Усе, що списують рецепти й модифікатори. Постачальник підняв ціну — впишіть нову тут, і
              собівартість кожної {dish ? 'страви' : 'позиції'} з цим інгредієнтом перерахується одразу. Прихід з
              ціною теж її оновлює. Ціна за грам і мілілітр зберігається з кроком 10 ₴ за кг чи літр.
            </p>
            <ul className="rounded-card bg-sq-surface shadow-card divide-y divide-sq-divider">
              {shownIngredients.map((row) => {
                const uses = row.usedIn.length;
                const isOpen = expanded === row.variantId;
                return (
                  <li key={row.variantId} className="px-4 py-2" data-testid={`ingredient-row-${row.variantId}`}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-h-10">
                      <span className="min-w-0 flex-1 basis-48">
                        <Link to={`/admin/products/${row.productId}`} className="text-[15px] font-medium text-sq-text hover:text-sq-blue">
                          {row.caption}
                        </Link>
                        <span className="block text-[13px] text-sq-muted tabular-nums">на складі {stockText(row.quantity, row.unit)}</span>
                      </span>
                      <button
                        type="button"
                        className="shrink-0 min-h-9 px-2 rounded-lg text-[14px] text-sq-blue font-medium hover:bg-sq-sidebar disabled:text-sq-muted disabled:hover:bg-transparent"
                        disabled={uses === 0}
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : row.variantId)}
                        data-testid={`ingredient-uses-${row.variantId}`}
                      >
                        {uses === 0 && row.modifierUses === 0
                          ? 'ніде не використовується'
                          : [
                              uses > 0 ? `у ${uses} ${plural(uses, ['рецепті', 'рецептах', 'рецептах'])}` : '',
                              row.modifierUses > 0
                                ? `${row.modifierUses} ${plural(row.modifierUses, ['модифікатор', 'модифікатори', 'модифікаторів'])}`
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                      </button>
                      <PriceCell
                        row={row}
                        onSave={async (baseCents) => {
                          putProduct(await api.updateVariant(row.variantId, { cost_cents: baseCents }));
                          setFlash(
                            uses > 0
                              ? `«${row.caption}»: ціну збережено, собівартість перераховано в ${uses} ${plural(uses, ['рецепті', 'рецептах', 'рецептах'])}.`
                              : `«${row.caption}»: ціну збережено.`
                          );
                        }}
                      />
                      <button
                        type="button"
                        className="shrink-0 min-h-9 px-2 rounded-lg text-[14px] font-semibold text-sq-blue hover:bg-sq-sidebar disabled:opacity-30"
                        disabled={uses === 0 && row.modifierUses === 0}
                        onClick={() => setReplacing(row)}
                        data-testid={`ingredient-replace-${row.variantId}`}
                      >
                        Замінити…
                      </button>
                    </div>
                    {isOpen && uses > 0 && (
                      <ul className="mt-1 mb-2 flex flex-wrap gap-1.5" data-testid={`ingredient-used-${row.variantId}`}>
                        {row.usedIn.map((u) => (
                          <li key={u.productId}>
                            <button
                              type="button"
                              className="min-h-8 px-2.5 rounded-full bg-sq-sidebar text-[14px] text-sq-text hover:bg-sq-selected"
                              onClick={() => setOpen(u.productId)}
                            >
                              {u.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
              {shownIngredients.length === 0 && (
                <li className="px-4 py-8 text-center text-[15px] text-sq-secondary">
                  {ingredients.length === 0
                    ? 'Інгредієнтів ще немає: вони зʼявляться, щойно ви додасте їх у рецепт.'
                    : 'Нічого не знайдено.'}
                </li>
              )}
            </ul>
          </>
        )}
      </div>

      {opened && (
        <RecipeDialog
          key={opened.id}
          product={opened}
          products={list}
          costs={costs}
          maxDepth={maxDepth}
          units={vertical.units}
          targetBps={target}
          onProductChanged={putProduct}
          onSaved={() => {
            closeRecipe();
            setFlash(`«${opened.name}»: рецепт збережено.`);
            void reload().catch(() => undefined);
          }}
          onClose={closeRecipe}
        />
      )}

      {replacing && (
        <ReplaceIngredientDialog
          row={replacing}
          products={list}
          costs={costs}
          options={replaceOptions}
          onDone={(result, toCaption) => {
            setReplacing(null);
            setFlash(
              `«${replacing.caption}» замінено на «${toCaption}»: ${result.recipes} ${plural(result.recipes, ['рецепт', 'рецепти', 'рецептів'])}` +
                (result.modifiers > 0
                  ? ` і ${result.modifiers} ${plural(result.modifiers, ['відповідь', 'відповіді', 'відповідей'])} модифікаторів`
                  : '') +
                '.'
            );
            void reload().catch(() => undefined);
          }}
          onClose={() => setReplacing(null)}
        />
      )}
    </div>
  );
}
