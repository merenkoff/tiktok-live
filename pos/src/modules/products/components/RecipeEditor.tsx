// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useRef, useState } from 'react';
import { uahInputToCents } from '@pos/platform';
import type { Product, ProductComponentInput } from '@pos/platform';
import { Printer, Search, X } from '@pos/platform/ui';
import { Dialog } from './Dialog';
import { IngredientPicker } from './IngredientPicker';
import { NewIngredientDialog } from './NewIngredientDialog';
import type { ComponentOption } from './componentOptions';
import { chipClass } from './formStyles';
import { foodCostPercent } from '../data/techCards';
import { matchesWords, queryWords } from '../lib/modifierWords';
import {
  foodCostBps,
  humanPriceToBaseMilli,
  moneyText,
  priceForTarget,
  pricingUnit,
  recipeCost,
  scaleRecipe,
  unitPriceText,
  type CostIndex,
} from '../lib/recipeCost';
import {
  grossFor,
  hasLosses,
  lossPercentText,
  netOf,
  parseLossPercent,
  recipeYield,
  yieldText,
} from '../lib/recipeLoss';

/** Whether this device shows the gross / loss / net columns for a recipe that has no losses yet. */
const GROSS_NET_KEY = 'products:recipeGrossNet';

function readGrossNetPref(): boolean {
  try {
    return window.localStorage.getItem(GROSS_NET_KEY) === '1';
  } catch {
    return false;
  }
}

function writeGrossNetPref(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(GROSS_NET_KEY, '1');
    else window.localStorage.removeItem(GROSS_NET_KEY);
  } catch {
    // A blocked storage only means the choice is not remembered.
  }
}

/** The money beside a recipe: what its parts cost and what the dish sells for. */
export interface RecipeMoney {
  index: CostIndex;
  /** The selling price of the variant being composed, as typed right now. */
  priceCents: number;
  /** The owner's own target (3000 = 30 %), or null while there is none. */
  targetBps: number | null;
  /** The variant being composed — so a draft that names itself is not walked forever. */
  selfId?: number;
  /**
   * Write an ingredient's purchase price at once — per BASE unit, in
   * thousandths of a kopeck (`lib/costUnits.ts`). Absent = read-only prices.
   */
  onSetCost?: (variantId: number, baseMilli: number) => Promise<void>;
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
function SetCost({ unit, onSave }: { unit: string; onSave: (baseMilli: number) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { label } = pricingUnit(unit);

  async function save() {
    const base = humanPriceToBaseMilli(uahInputToCents(text), unit);
    if (base <= 0) {
      setError('Вкажіть ціну');
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

/**
 * The loss of one line, as a percent. It keeps its own text so «12,» can be
 * typed on the way to «12,5»; every text that reads as 0…99 % is handed up at
 * once, and one that does not is ringed and changes nothing.
 */
function LossCell({ bps, caption, onChange, onEnter }: { bps: number; caption: string; onChange: (bps: number) => void; onEnter: () => void }) {
  const [text, setText] = useState(() => lossPercentText(bps));
  const textRef = useRef(text);
  textRef.current = text;
  // The loss changed from outside — a copied recipe, an ingredient's usual loss.
  useEffect(() => {
    if (parseLossPercent(textRef.current) !== bps) setText(lossPercentText(bps));
  }, [bps]);
  const invalid = parseLossPercent(text) == null;
  return (
    <input
      className={`sq-input !px-2 text-right tabular-nums ${invalid ? 'ring-2 ring-inset ring-red-500' : ''}`}
      inputMode="decimal"
      placeholder="0"
      aria-label={`Втрати «${caption}», %`}
      aria-invalid={invalid}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseLossPercent(e.target.value);
        if (parsed != null) onChange(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        onEnter();
      }}
      data-testid="recipe-loss"
    />
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
  onPrint,
  losses = false,
  emptyText = 'Порожньо. Складений товар без складу продати не можна.',
  batch,
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
  /** «Друк техкарти»: the sheet for the kitchen — offered once the recipe has a line. */
  onPrint?: () => void;
  /**
   * Offer «Брутто / нетто». A kitchen's question — a florist's stems lose
   * nothing on the way into a bouquet — so only a caller that knows it is a
   * kitchen asks for it. A recipe that already HAS a loss shows it anywhere.
   */
  losses?: boolean;
  emptyText?: string;
  /**
   * A kitchen's «вихід» (migration 116): the recipe is written for a batch —
   * «шия 2000 г … вихід 1900 г» — and the server divides it into what one unit
   * takes. Asked only where a recipe may hold a recipe (the café); `value` is
   * the box's text, '' = for one unit.
   */
  batch?: { value: string; unit: string; onChange: (next: string) => void };
}) {
  const [creating, setCreating] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [focusQty, setFocusQty] = useState<number | null>(null);
  const qtyRefs = useRef(new Map<number, HTMLInputElement>());
  const netRefs = useRef(new Map<number, HTMLInputElement>());
  const pickerRef = useRef<HTMLInputElement>(null);
  // Gross / loss / net: three columns a coffee shop never needs, so they are
  // off until asked for — and on by themselves the moment a line has a loss,
  // because a loss nobody can see is a weight nobody can explain.
  const lossy = hasLosses(value);
  const [shown, setShown] = useState(() => lossy || (losses && readGrossNetPref()));
  // Once shown they stay for as long as this recipe is open: emptying the one
  // loss box of a recipe must not take the box away from under the caret.
  useEffect(() => {
    if (lossy) setShown(true);
  }, [lossy]);
  // Derived as well as remembered, so the columns are there in the very
  // render a lossy line arrives in — the caret is handed to «Нетто» in it.
  const grossNet = shown || lossy;

  const byVariant = useMemo(() => new Map(options.map((option) => [option.variant_id, option])), [options]);
  const used = useMemo(() => new Set(value.map((row) => row.component_variant_id)), [value]);
  const available = useMemo(() => options.filter((option) => !used.has(option.variant_id)), [options, used]);
  // The recipe is for this many units of the dish; one unit is its share.
  const perUnits = batch && Number(batch.value) > 1 ? Number(batch.value) : 1;
  const cost = useMemo(
    () => (money ? recipeCost(money.index, value, money.selfId, perUnits) : null),
    [money, value, perUnits]
  );

  // A line that was just picked hands the caret to its quantity.
  useEffect(() => {
    if (focusQty == null) return;
    // A line that came with its ingredient's usual loss is typed as the cook's
    // card states it — the net — and the gross is worked out from it.
    const row = value.find((line) => line.component_variant_id === focusQty);
    const input =
      (grossNet && (row?.loss_bps ?? 0) > 0 ? netRefs.current.get(focusQty) : undefined) ?? qtyRefs.current.get(focusQty);
    if (input) {
      input.focus();
      input.select();
      setFocusQty(null);
    }
  }, [focusQty, value, grossNet]);

  function add(variantId: number) {
    if (used.has(variantId)) return;
    // The ingredient's usual loss (its card says «відходи 20 %») comes with it.
    const usual = money?.index.get(variantId)?.prepLossBps ?? 0;
    onChange([...value, { component_variant_id: variantId, quantity: 1, loss_bps: usual }]);
    setFocusQty(variantId);
  }

  function setLine(idx: number, patch: Partial<ProductComponentInput>) {
    const next = [...value];
    next[idx] = { ...value[idx]!, ...patch };
    onChange(next);
  }

  const toPicker = () => pickerRef.current?.focus();
  const portion = money && grossNet ? yieldText(recipeYield(money.index, value)) : '';
  // The net of the lines is what a batch comes to: offered as its «вихід».
  const netWeight = money && batch && (batch.unit === 'г' || batch.unit === 'мл') ? recipeYield(money.index, value).weight : 0;
  // One unit of a batch costs a kopeck; 100 г (or 1 шт) is the figure a cook reads.
  const shareStep = batch && (batch.unit === 'г' || batch.unit === 'мл') ? 100 : 1;

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
          <span className={grossNet ? 'w-24' : 'w-32'}>{grossNet ? 'брутто' : 'кількість'}</span>
          {grossNet && <span className="w-14 whitespace-nowrap">втрати %</span>}
          {grossNet && <span className="w-24">нетто</span>}
          {money && <span className="w-28 text-right">ціна закупівлі</span>}
          {money && <span className={`${grossNet ? 'w-20' : 'w-24'} text-right`}>сума</span>}
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
              {/* On a phone the three boxes take a line of their own under the name. */}
              <span
                className={`flex-1 ${grossNet ? 'basis-full sm:basis-32' : 'basis-44'} min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5`}
              >
                <span className="text-[15px] text-sq-text truncate">{caption}</span>
                {node?.recipe && <span className={`${chipClass} bg-sq-blue/10 text-sq-blue-press`}>заготовка</span>}
                {emptyPrep && <span className={`${chipClass} bg-amber-50 text-amber-800`}>порожній рецепт</span>}
              </span>

              <span className={grossNet ? 'basis-[30%] grow sm:grow-0 sm:basis-auto sm:w-24 flex flex-col gap-0.5' : 'w-32 flex flex-col'}>
                {grossNet && <span className="sm:hidden text-[12px] leading-4 text-sq-muted">брутто</span>}
                <span className="flex items-center gap-1.5">
                <input
                  ref={(el) => {
                    if (el) qtyRefs.current.set(row.component_variant_id, el);
                    else qtyRefs.current.delete(row.component_variant_id);
                  }}
                  // Three boxes share the row: each keeps room for «12500».
                  className={`sq-input text-right tabular-nums ${grossNet ? '!px-2' : ''}`}
                  inputMode="numeric"
                  // The one weight the line keeps: what leaves the shelf.
                  aria-label={grossNet ? 'Брутто' : 'Кількість'}
                  value={row.quantity > 0 ? String(row.quantity) : ''}
                  onChange={(e) => setLine(idx, { quantity: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    // Never the card's «Зберегти»: Enter goes on to the next line.
                    e.preventDefault();
                    toPicker();
                  }}
                />
                <span className="w-7 text-[13px] text-sq-muted shrink-0">{unit}</span>
                </span>
              </span>

              {grossNet && (
                <span className="basis-[20%] grow sm:grow-0 sm:basis-auto sm:w-14 flex flex-col gap-0.5">
                  <span className="sm:hidden text-[12px] leading-4 text-sq-muted">втрати %</span>
                  <LossCell
                    bps={row.loss_bps ?? 0}
                    caption={caption}
                    onChange={(loss_bps) => setLine(idx, { loss_bps })}
                    onEnter={toPicker}
                  />
                </span>
              )}
              {grossNet && (
                <span className="basis-[30%] grow sm:grow-0 sm:basis-auto sm:w-24 flex flex-col gap-0.5">
                  <span className="sm:hidden text-[12px] leading-4 text-sq-muted">нетто</span>
                  <span className="flex items-center gap-1.5">
                  <input
                    ref={(el) => {
                      if (el) netRefs.current.set(row.component_variant_id, el);
                      else netRefs.current.delete(row.component_variant_id);
                    }}
                    className="sq-input !px-2 text-right tabular-nums"
                    inputMode="numeric"
                    aria-label="Нетто"
                    // Derived, never stored: what reaches the dish. Typing it
                    // works the gross out — 100 г at 20 % is 125 г off the shelf.
                    value={row.quantity > 0 ? String(netOf(row.quantity, row.loss_bps ?? 0)) : ''}
                    onChange={(e) =>
                      setLine(idx, {
                        quantity: grossFor(Number(e.target.value.replace(/\D/g, '')) || 0, row.loss_bps ?? 0),
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      toPicker();
                    }}
                    data-testid="recipe-net"
                  />
                  <span className="w-7 text-[13px] text-sq-muted shrink-0">{unit}</span>
                  </span>
                </span>
              )}

              {money && (
                <span className="w-28 text-right text-[14px] text-sq-secondary tabular-nums" data-testid="recipe-unit-price">
                  {line?.unpriced ? (
                    node && !node.derived && money.onSetCost ? (
                      <SetCost unit={unit} onSave={(base) => money.onSetCost!(row.component_variant_id, base)} />
                    ) : (
                      <span className="text-amber-700">немає ціни</span>
                    )
                  ) : (
                    unitPriceText(line?.unitMilli ?? 0, unit)
                  )}
                </span>
              )}
              {money && (
                <span
                  className={`${grossNet ? 'w-20' : 'w-24'} text-right text-[15px] font-medium text-sq-text tabular-nums`}
                  data-testid="recipe-line-sum"
                >
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
                    return one && !one.derived && one.costMilli > 0 ? unitPriceText(one.costMilli, option.unit) : option.unit;
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
        {(losses || lossy) && value.length > 0 && (
          <button
            type="button"
            aria-pressed={grossNet}
            // A recipe that has losses always shows them.
            disabled={lossy}
            title={lossy ? 'У рецепті є втрати — колонки показуються завжди' : 'Показати вагу до обробки, втрати й вагу в страві'}
            className={`min-h-11 px-3 rounded-[10px] text-[15px] font-semibold ${
              grossNet ? 'bg-sq-blue/10 text-sq-blue-press' : 'text-sq-blue hover:bg-sq-sidebar'
            } disabled:cursor-default`}
            onClick={() => {
              writeGrossNetPref(!grossNet);
              setShown(!grossNet);
            }}
            data-testid="recipe-gross-net"
          >
            Брутто / нетто
          </button>
        )}
        {onPrint && value.length > 0 && (
          <button
            type="button"
            className="min-h-11 px-3 rounded-[10px] inline-flex items-center gap-1.5 text-[15px] font-semibold text-sq-blue hover:bg-sq-sidebar"
            onClick={onPrint}
            data-testid="recipe-print"
          >
            <Printer size={18} />
            Друк
          </button>
        )}
      </div>

      {batch && value.length > 0 && (
        <div className="space-y-1" data-testid="recipe-batch">
          <label className="flex flex-wrap items-center gap-2 text-[15px] text-sq-secondary">
            <span>Склад записано на</span>
            <input
              className="sq-input w-28 text-right tabular-nums"
              inputMode="numeric"
              aria-label="Вихід"
              placeholder="1"
              value={batch.value}
              onChange={(e) => batch.onChange(e.target.value.replace(/\D/g, ''))}
              data-testid="recipe-batch-yield"
            />
            <span>{batch.unit} виходу</span>
            {batch.value === '' && netWeight > 1 && (
              <button
                type="button"
                className="min-h-11 px-2 text-[15px] font-semibold text-sq-blue hover:bg-sq-sidebar rounded-[10px]"
                onClick={() => batch.onChange(String(netWeight))}
                data-testid="recipe-batch-take-net"
              >
                вписати нетто {netWeight} {batch.unit}
              </button>
            )}
          </label>
          <p className="text-[13px] text-sq-muted leading-snug">
            Як у техкарті на варку: «шия 2000 г, сіль 10 г… вихід 1900 г» — кількості вище на всю варку, а страва
            бере з неї свої грами. Порожньо — склад на 1 {batch.unit}.
          </p>
        </div>
      )}

      {grossNet && value.length > 0 && (
        <p className="text-[13px] text-sq-muted leading-snug" data-testid="recipe-gross-net-hint">
          Брутто — скільки береться зі складу (воно списується й рахується в собівартість). Нетто — скільки
          потрапляє в страву. Впишіть нетто й відсоток втрат — брутто порахується само.
          {portion && (
            <>
              {' '}
              <strong className="font-semibold text-sq-text tabular-nums" data-testid="recipe-yield">
                Вихід {portion}
              </strong>
            </>
          )}
        </p>
      )}

      {cost && money && value.length > 0 && (
        <div
          className={`mt-2 rounded-xl p-3.5 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 ${
            loss ? 'bg-red-50' : cost.unpriced ? 'bg-amber-50' : 'bg-sq-sidebar'
          }`}
          data-testid="recipe-totals"
        >
          {perUnits > 1 ? (
            // A batch: what the whole of it costs, and the share a cook reads.
            <span className="text-[15px] text-sq-secondary" data-testid="recipe-batch-cost">
              Собівартість варки{' '}
              <strong className="text-[17px] font-bold text-sq-heading tabular-nums">
                {cost.unpriced ? `від ${moneyText(cost.batchCents)}` : moneyText(cost.batchCents)}
              </strong>
              <span className="text-[13px] text-sq-muted">
                {' '}
                · {shareStep} {batch!.unit} — {moneyText(Math.round((cost.milli * shareStep) / 1000))}
              </span>
            </span>
          ) : (
            <span className="text-[15px] text-sq-secondary">
              Собівартість{' '}
              <strong className="text-[17px] font-bold text-sq-heading tabular-nums">
                {cost.unpriced ? `від ${moneyText(cost.cents)}` : moneyText(cost.cents)}
              </strong>
            </span>
          )}
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
            За останніми цінами закупівлі.
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
