// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useRef, useState } from 'react';
import { uahInputToCents } from '@pos/platform';
import type { Product, ProductComponentInput } from '@pos/platform';
import { Search, X } from '@pos/platform/ui';
import { Dialog } from './Dialog';
import { IngredientPicker } from './IngredientPicker';
import { NewIngredientDialog } from './NewIngredientDialog';
import type { ComponentOption } from './componentOptions';
import { chipClass } from './formStyles';
import { foodCostPercent } from '../data/techCards';
import { matchesWords, queryWords } from '../lib/modifierWords';
import {
  foodCostBps,
  humanPriceToBaseCents,
  moneyText,
  priceForTarget,
  pricingUnit,
  recipeCost,
  scaleRecipe,
  unitPriceText,
  type CostIndex,
} from '../lib/recipeCost';

/** The money beside a recipe: what its parts cost and what the dish sells for. */
export interface RecipeMoney {
  index: CostIndex;
  /** The selling price of the variant being composed, as typed right now. */
  priceCents: number;
  /** The owner's own target (3000 = 30 %), or null while there is none. */
  targetBps: number | null;
  /** The variant being composed — so a draft that names itself is not walked forever. */
  selfId?: number;
  /** Write an ingredient's purchase price (per BASE unit) at once. Absent = read-only prices. */
  onSetCost?: (variantId: number, baseCents: number) => Promise<void>;
}

/** A recipe that can be copied into this one. */
export interface RecipeSource {
  key: string;
  /** «Латте · S». */
  title: string;
  /** Another size of the same dish — listed first. */
  sibling: boolean;
  components: ProductComponentInput[];
}

/** «Вказати ціну»: an unpriced ingredient gets its purchase price without leaving the recipe. */
function SetCost({ unit, onSave }: { unit: string; onSave: (baseCents: number) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { per, label } = pricingUnit(unit);

  async function save() {
    const base = humanPriceToBaseCents(uahInputToCents(text), unit);
    if (base <= 0) {
      setError(per > 1 ? `Замало: крок 10 ₴ за ${label}` : 'Вкажіть ціну');
      return;
    }
    setBusy(true);
    try {
      await onSave(base);
      setOpen(false);
    } catch {
      setError('Не збереглося');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-[14px] font-semibold text-amber-700 underline decoration-dotted underline-offset-2"
        onClick={() => setOpen(true)}
        data-testid="recipe-set-cost"
      >
        вказати ціну
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          className="sq-input !min-h-9 !w-20 text-right tabular-nums"
          inputMode="decimal"
          placeholder={`₴/${label}`}
          aria-label={`Ціна закупівлі за ${label}, грн`}
          value={text}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          data-testid="recipe-cost-input"
        />
        <button
          type="button"
          className="min-h-9 px-2 rounded-lg text-[14px] font-semibold text-sq-blue hover:bg-sq-sidebar disabled:opacity-40"
          disabled={busy}
          onClick={() => void save()}
          data-testid="recipe-cost-save"
        >
          OK
        </button>
      </span>
      <span className={`text-[12px] ${error ? 'text-red-600' : 'text-sq-muted'}`}>
        {error ?? 'зберігається одразу, для всіх рецептів'}
      </span>
    </span>
  );
}

/** «Скопіювати рецепт…» — another size of this dish, scaled, or another dish's. */
function CopyRecipeDialog({
  sources,
  replacing,
  onPick,
  onClose,
}: {
  sources: RecipeSource[];
  /** How many lines the copy will replace. */
  replacing: number;
  onPick: (components: ProductComponentInput[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [factor, setFactor] = useState('1');
  const words = queryWords(query);
  const shown = sources.filter((s) => matchesWords(s.title, words)).slice(0, 30);
  const k = Number(factor.trim().replace(',', '.'));
  const factorOk = Number.isFinite(k) && k > 0 && k <= 100;

  return (
    <Dialog
      title="Скопіювати рецепт"
      description={
        replacing > 0
          ? `Теперішні рядки (${replacing}) буде замінено. Нічого не збережеться, доки ви не збережете.`
          : 'Рядки підставляться сюди — їх можна поправити до збереження.'
      }
      onClose={onClose}
      testId="recipe-copy-dialog"
    >
      <div className="space-y-3 pb-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[12rem]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none" />
            <input
              className="sq-input !pl-9"
              placeholder="Назва страви…"
              aria-label="Пошук рецепта"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="recipe-copy-search"
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-sq-muted">Помножити кількості на</span>
            <input
              className="sq-input !w-28 tabular-nums"
              inputMode="decimal"
              aria-label="Множник"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              data-testid="recipe-copy-factor"
            />
          </label>
        </div>
        <p className="text-[13px] text-sq-muted">
          Для більшого розміру — наприклад, 1,5: кожна кількість помножиться й округлиться до цілого.
        </p>
        <ul className="space-y-2">
          {shown.map((source) => (
            <li key={source.key}>
              <button
                type="button"
                disabled={!factorOk || source.components.length === 0}
                onClick={() => onPick(scaleRecipe(source.components, k))}
                data-testid={`recipe-copy-${source.key}`}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl ring-1 ring-inset ring-sq-divider hover:bg-sq-sidebar disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span className="min-w-0 flex-1 text-[15px] font-semibold text-sq-text truncate">{source.title}</span>
                {source.sibling && <span className={`${chipClass} bg-sq-blue/10 text-sq-blue-press`}>цей товар</span>}
                <span className="shrink-0 text-[13px] text-sq-muted tabular-nums">{source.components.length} рядків</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="py-6 text-center text-[15px] text-sq-secondary">Рецептів не знайдено.</li>}
        </ul>
      </div>
    </Dialog>
  );
}

/**
 * What one unit of a dish is made of — and, beside every line, what it costs.
 *
 * It replaces a list with a native `<select>` of every variant in the store
 * and no money on screen at all: the cost of a dish appeared only after the
 * card was saved. Here a line is added by TYPING into the last row (Enter
 * picks, Enter again goes on to the next line and never saves the card), an
 * ingredient that does not exist is made from the search, one with no
 * purchase price gets it on the spot, and the total, the food cost and the
 * price that would meet the owner's target move with every keystroke.
 *
 * Edited as a whole and saved as a whole, like the attribute bag: the server
 * replaces the composition wholesale, so removing a component is expressible.
 * Without `money` it is the bare list — a place that has no catalogue to
 * price from still composes.
 */
export function RecipeEditor({
  value,
  options,
  onChange,
  money,
  create,
  sources,
  emptyText = 'Порожньо. Складений товар без складу продати не можна.',
}: {
  value: ProductComponentInput[];
  /** What may go into this recipe — already without itself and within the vertical's depth. */
  options: ComponentOption[];
  onChange: (next: ProductComponentInput[]) => void;
  money?: RecipeMoney;
  /** Offer «Створити інгредієнт» from the search. */
  create?: { units: readonly string[]; onCreated: (product: Product) => void };
  /** Recipes this one can be copied from. */
  sources?: RecipeSource[];
  emptyText?: string;
}) {
  const [creating, setCreating] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [focusQty, setFocusQty] = useState<number | null>(null);
  const qtyRefs = useRef(new Map<number, HTMLInputElement>());
  const pickerRef = useRef<HTMLInputElement>(null);

  const byVariant = useMemo(() => new Map(options.map((option) => [option.variant_id, option])), [options]);
  const used = useMemo(() => new Set(value.map((row) => row.component_variant_id)), [value]);
  const available = useMemo(() => options.filter((option) => !used.has(option.variant_id)), [options, used]);
  const cost = useMemo(
    () => (money ? recipeCost(money.index, value, money.selfId) : null),
    [money, value]
  );

  // A line that was just picked hands the caret to its quantity.
  useEffect(() => {
    if (focusQty == null) return;
    const input = qtyRefs.current.get(focusQty);
    if (input) {
      input.focus();
      input.select();
      setFocusQty(null);
    }
  }, [focusQty, value]);

  function add(variantId: number) {
    if (used.has(variantId)) return;
    onChange([...value, { component_variant_id: variantId, quantity: 1 }]);
    setFocusQty(variantId);
  }

  const bps = cost && money ? foodCostBps(cost, money.priceCents) : null;
  const suggested =
    cost && money && money.targetBps != null && !cost.unpriced ? priceForTarget(cost.cents, money.targetBps) : null;
  const overTarget = bps != null && money?.targetBps != null && bps > money.targetBps;
  const loss = bps != null && bps >= 10000;

  return (
    <div className="space-y-2" data-testid="recipe-editor">
      {value.length > 0 && (
        <div className="hidden sm:flex items-end gap-3 text-[12px] leading-4 text-sq-muted" aria-hidden>
          <span className="flex-1" />
          <span className="w-32">кількість</span>
          {money && <span className="w-28 text-right">ціна закупівлі</span>}
          {money && <span className="w-24 text-right">сума</span>}
          <span className="w-9" />
        </div>
      )}

      {value.length === 0 && <p className="py-1 text-[15px] text-sq-muted">{emptyText}</p>}

      <ul>
        {value.map((row, idx) => {
          const option = byVariant.get(row.component_variant_id);
          const node = money?.index.get(row.component_variant_id);
          const line = cost?.lines[idx];
          const caption = option?.caption ?? node?.caption ?? `Варіант ${row.component_variant_id}`;
          const unit = option?.unit ?? node?.unit ?? '';
          const emptyPrep = !!node && node.derived && node.components.length === 0;
          return (
            <li
              key={row.component_variant_id}
              data-testid="composition-row"
              className={`sq-row flex flex-wrap items-center gap-x-3 gap-y-1 min-h-12 py-1.5 ${
                line?.unpriced ? 'bg-amber-50/60 -mx-2 px-2 rounded-lg' : ''
              }`}
            >
              <span className="flex-1 basis-44 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[15px] text-sq-text truncate">{caption}</span>
                {node?.recipe && <span className={`${chipClass} bg-sq-blue/10 text-sq-blue-press`}>заготовка</span>}
                {emptyPrep && <span className={`${chipClass} bg-amber-50 text-amber-800`}>порожній рецепт</span>}
              </span>

              <span className="w-32 flex items-center gap-1.5">
                <input
                  ref={(el) => {
                    if (el) qtyRefs.current.set(row.component_variant_id, el);
                    else qtyRefs.current.delete(row.component_variant_id);
                  }}
                  className="sq-input text-right tabular-nums"
                  inputMode="numeric"
                  aria-label="Кількість"
                  value={row.quantity > 0 ? String(row.quantity) : ''}
                  onChange={(e) => {
                    const next = [...value];
                    next[idx] = { ...row, quantity: Number(e.target.value.replace(/\D/g, '')) || 0 };
                    onChange(next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    // Never the card's «Зберегти»: Enter goes on to the next line.
                    e.preventDefault();
                    pickerRef.current?.focus();
                  }}
                />
                <span className="w-7 text-[13px] text-sq-muted shrink-0">{unit}</span>
              </span>

              {money && (
                <span className="w-28 text-right text-[14px] text-sq-secondary tabular-nums" data-testid="recipe-unit-price">
                  {line?.unpriced ? (
                    node && !node.derived && money.onSetCost ? (
                      <SetCost unit={unit} onSave={(base) => money.onSetCost!(row.component_variant_id, base)} />
                    ) : (
                      <span className="text-amber-700">немає ціни</span>
                    )
                  ) : (
                    unitPriceText(line?.unitCents ?? 0, unit)
                  )}
                </span>
              )}
              {money && (
                <span className="w-24 text-right text-[15px] font-medium text-sq-text tabular-nums" data-testid="recipe-line-sum">
                  {line?.unpriced ? '—' : moneyText(line?.lineCents ?? 0)}
                </span>
              )}

              <button
                type="button"
                className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0"
                aria-label={`Прибрати «${caption}»`}
                onClick={() => onChange(value.filter((_, i) => i !== idx))}
                data-testid="recipe-remove"
              >
                <X size={18} />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 pt-1">
        <div className="flex-1 basis-64 min-w-0">
          <IngredientPicker
            options={available}
            value={null}
            onChange={(variantId) => {
              if (variantId != null) add(variantId);
            }}
            placeholder={value.length === 0 ? 'Перший складник: почніть набирати назву…' : 'Ще складник…'}
            ariaLabel="Додати складник"
            noteOf={
              money
                ? (option) => {
                    const one = money.index.get(option.variant_id);
                    return one && !one.derived && one.costCents > 0 ? unitPriceText(one.costCents, option.unit) : option.unit;
                  }
                : undefined
            }
            onCreate={create ? (name) => setCreating(name) : undefined}
            inputRef={pickerRef}
            surface="page"
            testId="recipe-add"
          />
        </div>
        {sources && sources.length > 0 && (
          <button
            type="button"
            className="min-h-11 px-3 rounded-[10px] text-[15px] font-semibold text-sq-blue hover:bg-sq-sidebar"
            onClick={() => setCopying(true)}
            data-testid="recipe-copy"
          >
            Скопіювати рецепт…
          </button>
        )}
      </div>

      {cost && money && value.length > 0 && (
        <div
          className={`mt-2 rounded-xl p-3.5 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 ${
            loss ? 'bg-red-50' : cost.unpriced ? 'bg-amber-50' : 'bg-sq-sidebar'
          }`}
          data-testid="recipe-totals"
        >
          <span className="text-[15px] text-sq-secondary">
            Собівартість{' '}
            <strong className="text-[17px] font-bold text-sq-heading tabular-nums">
              {cost.unpriced ? `від ${moneyText(cost.cents)}` : moneyText(cost.cents)}
            </strong>
          </span>
          {cost.unpriced ? (
            <span className="text-[14px] text-amber-800">
              Food cost невідомий — немає ціни: {cost.missing.slice(0, 3).join(', ')}
              {cost.missing.length > 3 ? ` і ще ${cost.missing.length - 3}` : ''}
            </span>
          ) : money.priceCents <= 0 ? (
            <span className="text-[14px] text-sq-muted">Вкажіть ціну продажу — зʼявиться food cost і маржа</span>
          ) : (
            <>
              <span className="text-[15px] text-sq-secondary">
                Food cost{' '}
                <strong
                  className={`text-[17px] font-bold tabular-nums ${
                    loss ? 'text-red-600' : overTarget ? 'text-amber-700' : 'text-sq-heading'
                  }`}
                  data-testid="recipe-food-cost"
                >
                  {bps == null ? '—' : foodCostPercent(bps)}
                </strong>
                {money.targetBps != null && (
                  <span className="text-[13px] text-sq-muted"> ціль {foodCostPercent(money.targetBps)}</span>
                )}
              </span>
              <span className="text-[15px] text-sq-secondary">
                Маржа{' '}
                <strong className={`text-[17px] font-bold tabular-nums ${loss ? 'text-red-600' : 'text-sq-heading'}`}>
                  {moneyText(money.priceCents - cost.cents)}
                </strong>
              </span>
              {suggested != null && overTarget && (
                <span className="text-[14px] text-sq-secondary" data-testid="recipe-suggested">
                  Для цілі {foodCostPercent(money.targetBps!)} ціна має бути від{' '}
                  <strong className="font-semibold text-sq-text tabular-nums">{moneyText(suggested)}</strong>
                </span>
              )}
            </>
          )}
          <span className="basis-full text-[12px] text-sq-muted">
            За останніми цінами закупівлі. Ціна за грам і мілілітр зберігається з кроком 1 коп — тобто 10 ₴ за кг чи
            літр.
          </span>
        </div>
      )}

      {creating != null && create && (
        <NewIngredientDialog
          name={creating}
          units={create.units}
          onCreated={(product) => {
            create.onCreated(product);
            const made = product.variants[0];
            if (made) add(made.id);
            setCreating(null);
          }}
          onClose={() => setCreating(null)}
        />
      )}

      {copying && sources && (
        <CopyRecipeDialog
          sources={sources}
          replacing={value.length}
          onPick={(components) => {
            // Only what this recipe may hold: never itself, never deeper than the vertical allows.
            const allowed = components.filter((c) => byVariant.has(c.component_variant_id));
            const seen = new Set<number>();
            onChange(allowed.filter((c) => (seen.has(c.component_variant_id) ? false : (seen.add(c.component_variant_id), true))));
            setCopying(false);
          }}
          onClose={() => setCopying(false)}
        />
      )}
    </div>
  );
}
