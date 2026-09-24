// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The florist's bench — assembling a bouquet and its price as ONE action.
 *
 * Design doc: `TechDocs/POS_FLORIST_BENCH.md`. The decisions that show up as
 * layout here:
 *
 * - **Full screen** (§2). The catalog slot is ~600 px at `lg` (1024 − 360 cart
 *   − rail); two panels do not live there. A module may render `fixed inset-0`
 *   — `VariantPicker` already does — so the bench takes the whole surface with
 *   no change in the host. Assembling a bouquet is a task with a beginning and
 *   an end, an explicit "done" and an explicit "cancel": the one case where
 *   modality is right.
 * - **The price never hides** (§2). On the till it sits in the right panel; on
 *   a tablet it sits in the bar above the buttons, which is why the summary is
 *   duplicated rather than living only inside the sheet.
 * - **Tablet is one column** (§2): grid on top, composition as a sheet from the
 *   bottom, following `MobileCartSheet`.
 *
 * The composition lives in memory only, and deliberately still does. Handing a
 * bouquet to another till is «Відкласти» on the cart (phase B4), reached by
 * finishing here first: the bench assembles, the cart is what can be put down
 * and picked up. A fifth button here would be a second way to do the same
 * thing, on the one screen in the app with no room for one.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookMarked, ChevronDown, Flower2, Search, Store, X } from '@pos/platform/ui';
import {
  api,
  buildPriceTags,
  formatUah,
  triggerPrint,
  uahInputToCents,
  useAuthStore,
  useOfflineStatus,
  useVertical,
} from '@pos/platform';
import type { CartLineComponent, CatalogItem, PriceTag, SalesCatalog } from '@pos/platform';
import { CatalogTagBar, PriceTagsPrintable, ScanWedge, VariantPicker } from '@pos/platform/ui';
import type { TagPaperWidth } from '@pos/platform/ui';
import { RecipeSheet } from './RecipeSheet';
import { ShowcaseSheet } from './ShowcaseSheet';
import { BudgetBar } from './BudgetBar';
import { CompositionPanel } from './CompositionPanel';
import { QuantityPad } from './QuantityPad';
import { StemGrid } from './StemGrid';
import { isAssemblable } from './stems';
import { budgetRead, useBench } from './useBench';

/**
 * Station-local, exactly as `PriceTagsDialog` treats it: the roll is a property
 * of the printer attached to THIS till, not of the store. Same key, so a shop
 * that set 80 mm on the admin screen does not have to set it again here.
 */
/** The server's own words when it refuses — they are Ukrainian and actionable. */
function errorText(error: unknown): string {
  const sent = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
  return sent || 'Не вдалося зробити букет. Спробуйте ще раз.';
}

function loadPaper(): TagPaperWidth {
  try {
    return localStorage.getItem('pos.priceTagPaperWidth') === '80' ? 80 : 58;
  } catch {
    return 58;
  }
}

export interface FloristBenchProps {
  /** The catalogue card this is rung on — a `derived` composite. */
  card: CatalogItem;
  labourBps: number;
  /** Shared with the sell screen so the bench browses the same rows. */
  catalog: SalesCatalog;
  onDone: (line: { unit_price_cents: number; components: CartLineComponent[] }) => void;
  /** A bouquet went to the window instead of the cart: nothing was rung. */
  onShowcased: (name: string, priceCents: number) => void;
  /** The composition was kept as a catalogue recipe; the bench stays open. */
  onRecipeSaved: (name: string) => void;
  onClose: () => void;
}

export function FloristBench({
  card,
  labourBps,
  catalog,
  onDone,
  onShowcased,
  onRecipeSaved,
  onClose,
}: FloristBenchProps) {
  const bench = useBench(labourBps);
  const vertical = useVertical();
  const [picker, setPicker] = useState<CatalogItem[] | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const online = useOfflineStatus((s) => s.online);
  const storeName = useAuthStore((s) => s.auth?.store.name ?? '');
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showcase, setShowcase] = useState<{ uuid: string } | null>(null);
  const [showcaseBusy, setShowcaseBusy] = useState(false);
  const [showcaseError, setShowcaseError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<PriceTag[] | null>(null);

  // The same handshake `PriceTagsDialog` uses: the printable is mounted, the OS
  // dialog is opened on the next frame, and the markup is torn down on
  // `afterprint`. Printing before the frame lands gives an empty sheet.
  useEffect(() => {
    if (!printing) return;
    const clear = () => setPrinting(null);
    window.addEventListener('afterprint', clear);
    const raf = requestAnimationFrame(triggerPrint);
    return () => {
      window.removeEventListener('afterprint', clear);
      cancelAnimationFrame(raf);
    };
  }, [printing]);

  async function makeForShowcase(input: {
    name: string | null;
    priceCents: number | null;
    imageUrl: string | null;
    print: boolean;
  }): Promise<void> {
    if (!showcase) return;
    setShowcaseBusy(true);
    setShowcaseError(null);
    try {
      const made = await api.assembleShowcase({
        // Minted when the sheet opened, not now: a double tap on a slow
        // connection has to come back with the same bouquet rather than tie a
        // second one out of stems that are no longer on the shelf.
        client_uuid: showcase.uuid,
        components: bench.components.map((c) => ({
          component_variant_id: c.component_variant_id,
          quantity: c.quantity,
        })),
        name: input.name,
        price_cents: input.priceCents,
        image_url: input.imageUrl,
      });

      if (input.print) {
        setPrinting(
          buildPriceTags(storeName, [
            {
              product: { name: made.name },
              variant: {
                id: made.variant_id,
                // The card carries no attributes, so it has no caption — the
                // name is «Букет №42» and that is the whole identity.
                label: '',
                unit: 'шт',
                price_cents: made.price_cents,
                sku: null,
                barcode: made.barcode,
                quantity: 1,
              },
              // One bouquet, one tag — not `defaultCopies`, which would print
              // one per unit on hand and is right only for a product line.
              copies: 1,
            },
          ])
        );
      }

      // The fridge changed and a new card exists, so the sell screen behind us
      // is now stale in two ways.
      void catalog.refresh();
      onShowcased(made.name, made.price_cents);
    } catch (error) {
      setShowcaseError(errorText(error));
    } finally {
      setShowcaseBusy(false);
    }
  }

  // Bouquet cards are not components (see `isAssemblable`), so they never reach
  // the grid. Filtering here rather than in `useSalesCatalog` keeps the sell
  // screen's own catalog — where a bouquet card is exactly what you want to
  // tap — unchanged.
  const grouped = useMemo(
    () =>
      catalog.grouped
        .map(([productId, variants]) => [productId, variants.filter(isAssemblable)] as const)
        .filter(([, variants]) => variants.length > 0)
        .map(([productId, variants]) => [productId, variants] as [number, CatalogItem[]]),
    [catalog.grouped]
  );

  // Tapping a bouquet card means «make me one of these», so the bench opens
  // with that card's recipe already on it — the florist adjusts rather than
  // retypes. A card with no stored recipe (the plain «Букет на замовлення»
  // template) simply opens empty, as before.
  //
  // Resolved against the loaded catalog because the recipe carries names and
  // counts but no prices or stock, and the bench needs both. A stem the shop no
  // longer lists is skipped rather than faked — and said out loud, because a
  // bouquet quietly missing a flower is worse than one that explains itself.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    const recipe = card.components ?? [];
    if (recipe.length === 0 || catalog.loading) return;
    seeded.current = true;

    const byId = new Map(
      catalog.grouped.flatMap(([, variants]) => variants).map((v) => [v.variant_id, v])
    );
    const rows = recipe
      .map((row) => {
        const item = byId.get(row.component_variant_id);
        return item ? { item, quantity: row.quantity } : null;
      })
      .filter((row): row is { item: CatalogItem; quantity: number } => row !== null);

    bench.loadComposition(rows);
    if (rows.length < recipe.length) {
      setNotice('Деяких квітів із рецепта вже немає — перевірте склад');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, catalog.loading, catalog.grouped]);

  const reference = bench.stems.length > 0 ? bench.stems[bench.stems.length - 1].item : null;
  const read = budgetRead(
    bench.totals.totalCents,
    bench.budgetCents,
    reference?.price_cents ?? null,
    labourBps
  );

  function pick(variants: CatalogItem[]): void {
    if (variants.length === 1) {
      bench.add(variants[0]);
      return;
    }
    setPicker(variants);
  }

  async function handleBarcode(code: string): Promise<void> {
    // Wrapping and sundries are the things that actually carry a barcode
    // (§3.9); a scan puts them in the bouquet, not in the cart.
    const items = (await catalog.lookupBarcode(code)).filter(isAssemblable);
    if (items.length === 1) bench.add(items[0]);
    else if (items.length > 1) setPicker(items);
  }

  const empty = bench.stems.length === 0;
  const selectedName =
    bench.stems.find((s) => s.item.variant_id === bench.selectedId)?.item.product_name ?? null;

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col" data-testid="florist-bench">
      <ScanWedge active={!picker && !budgetOpen} onScan={(code) => void handleBarcode(code)} />

      <header className="min-h-[72px] pl-6 pr-5 py-2 flex items-center gap-6 shrink-0 shadow-[0_1px_0_#E6E8EC]">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Flower2 size={24} />
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-sq-heading truncate">{card.product_name}</h2>
            <p className={`text-[13px] truncate ${notice ? 'text-amber-700' : 'text-sq-muted'}`}>
              {notice ??
                (bench.totals.stemCount > 0
                  ? `${bench.totals.stemCount} у букеті`
                  : 'Збираємо букет')}
            </p>
          </div>
        </div>
        <div className="hidden lg:block w-[380px] shrink-0">
          <BudgetBar
            totalCents={bench.totals.totalCents}
            budgetCents={bench.budgetCents}
            ratio={read.ratio}
            remainingCents={read.remainingCents}
            over={read.over}
            nextStems={read.nextStems}
            onOpenBudget={() => setBudgetOpen(true)}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0"
          aria-label="Закрити"
        >
          <X size={20} />
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        <section className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="px-5 pt-3.5 space-y-2.5 shrink-0">
            <div className="relative">
              <Search
                size={20}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
              />
              <input
                className="w-full h-11 rounded-xl bg-sq-empty pl-11 pr-3.5 text-[15px] text-sq-text outline-none border-0 focus:ring-2 focus:ring-sq-blue focus:bg-white placeholder:text-sq-muted"
                placeholder="Пошук стебла"
                value={catalog.query}
                onChange={(e) => catalog.setQuery(e.target.value)}
              />
            </div>
            {!catalog.query.trim() && (
              <CatalogTagBar
                tags={catalog.catalogBarTags}
                activeId={catalog.catalogBarActiveId}
                showBack={catalog.showBack}
                backLabel={catalog.backLabel}
                onSelect={catalog.selectCatalogBarTag}
                onBack={catalog.goBackOne}
              />
            )}
          </div>

          <StemGrid
            grouped={grouped}
            folderTiles={catalog.folderTiles}
            loading={catalog.loading}
            defaultUnit={vertical.defaultUnit}
            countOf={bench.countOf}
            onPick={pick}
            onEnterTag={catalog.enterTag}
          />
        </section>

        <aside className="hidden lg:flex w-[22rem] xl:w-[25rem] shrink-0 flex-col bg-sq-sidebar shadow-[-1px_0_0_#E6E8EC] min-h-0">
          <div className="px-5 pt-4 pb-2 flex items-baseline justify-between shrink-0">
            <h3 className="text-[17px] font-bold text-sq-heading">Склад букета</h3>
            {bench.stems.length > 0 && (
              <span className="text-[13px] text-sq-muted">{positionsWord(bench.stems.length)}</span>
            )}
          </div>
          <CompositionPanel
            stems={bench.stems}
            totals={bench.totals}
            labourBps={labourBps}
            selectedId={bench.selectedId}
            onSelect={bench.select}
            onStep={(variantId, delta) => {
              const stem = bench.stems.find((s) => s.item.variant_id === variantId);
              if (stem) bench.add(stem.item, delta);
            }}
            onRemove={(variantId) => bench.setQuantity(variantId, 0)}
          />
          <QuantityPad
            targetName={selectedName}
            onDigit={bench.typeDigit}
            onBackspace={bench.backspace}
            onClear={bench.clearTyped}
          />
        </aside>
      </div>

      {/* Tablet: the summary lives in the footer bar, because the sheet that
          holds the composition is closed most of the time and the price is the
          one thing that may never be out of sight. */}
      <div className="lg:hidden px-4 py-2.5 bg-white shrink-0 space-y-2 shadow-[0_-1px_0_#E6E8EC]">
        <BudgetBar
          totalCents={bench.totals.totalCents}
          budgetCents={bench.budgetCents}
          ratio={read.ratio}
          remainingCents={read.remainingCents}
          over={read.over}
          nextStems={read.nextStems}
          onOpenBudget={() => setBudgetOpen(true)}
        />
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="w-full min-h-12 flex items-center justify-between gap-3 rounded-xl bg-sq-sidebar px-4"
          data-testid="bench-open-sheet"
        >
          <span className="text-[15px] font-semibold text-sq-text">
            Склад букета · {bench.totals.stemCount || '—'}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-lg font-bold tabular-nums text-sq-heading" data-testid="bench-total-mobile">
              {formatUah(bench.totals.totalCents)}
            </span>
            <ChevronDown size={20} className="text-sq-muted rotate-180" />
          </span>
        </button>
      </div>

      <footer className="min-h-[76px] px-5 py-3 flex items-center gap-2.5 shrink-0 bg-white shadow-[0_-1px_0_#E6E8EC]">
        <button type="button" onClick={onClose} className={quietClass}>
          Скасувати
        </button>
        <button
          type="button"
          disabled={empty || !online}
          // Online only, and it says so rather than timing out: making the card
          // means the server issuing ids, which an offline till cannot do
          // (POS_FLORIST_BENCH.md §11.6). Selling still works without network.
          title={!online ? 'Потрібна мережа' : undefined}
          onClick={() => {
            setShowcaseError(null);
            setShowcase({ uuid: crypto.randomUUID() });
          }}
          className={quietClass}
          data-testid="bench-to-showcase"
        >
          <Store size={24} />
          <span className="hidden sm:inline">{online ? 'На вітрину' : 'Потрібна мережа'}</span>
        </button>
        <button
          type="button"
          disabled={empty || !online}
          title={!online ? 'Потрібна мережа' : undefined}
          onClick={() => setRecipeOpen(true)}
          className={quietClass}
          data-testid="bench-save-recipe"
        >
          <BookMarked size={20} />
          <span className="hidden lg:inline">Зберегти рецепт</span>
        </button>
        <button
          type="button"
          disabled={empty}
          onClick={() =>
            onDone({ unit_price_cents: bench.totals.totalCents, components: bench.components })
          }
          className="pos-btn-primary min-h-[52px] rounded-xl px-[22px] text-[17px] flex-1"
          data-testid="bench-add-to-cart"
        >
          Додати в чек · {formatUah(bench.totals.totalCents)}
        </button>
      </footer>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(28,32,38,.32)]"
            aria-label="Закрити склад"
            onClick={() => setSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] bg-sq-sidebar rounded-t-card shadow-[0_-12px_40px_rgba(0,20,60,.18)] flex flex-col animate-fade-up overflow-hidden">
            <div className="px-5 pt-2 pb-3 bg-white shrink-0 shadow-[0_1px_0_#E6E8EC]">
              <div aria-hidden className="w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-2" />
              <div className="flex items-center justify-between">
                <h3 className="text-[17px] font-bold text-sq-heading">Склад букета</h3>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="min-h-11 min-w-11 grid place-items-center text-sq-secondary"
                  aria-label="Закрити"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="mt-1">
                <BudgetBar
                  totalCents={bench.totals.totalCents}
                  budgetCents={bench.budgetCents}
                  ratio={read.ratio}
                  remainingCents={read.remainingCents}
                  over={read.over}
                  nextStems={read.nextStems}
                  onOpenBudget={() => setBudgetOpen(true)}
                />
              </div>
            </div>
            <CompositionPanel
              stems={bench.stems}
              totals={bench.totals}
              labourBps={labourBps}
              selectedId={bench.selectedId}
              onSelect={bench.select}
              onStep={(variantId, delta) => {
                const stem = bench.stems.find((s) => s.item.variant_id === variantId);
                if (stem) bench.add(stem.item, delta);
              }}
              onRemove={(variantId) => bench.setQuantity(variantId, 0)}
            />
            <QuantityPad
              targetName={selectedName}
              onDigit={bench.typeDigit}
              onBackspace={bench.backspace}
              onClear={bench.clearTyped}
            />
          </div>
        </div>
      )}

      {recipeOpen && (
        <RecipeSheet
          computedCents={bench.totals.totalCents}
          onClose={() => setRecipeOpen(false)}
          onSaved={(name) => {
            setRecipeOpen(false);
            onRecipeSaved(name);
          }}
          components={bench.components.map((c) => ({
            component_variant_id: c.component_variant_id,
            quantity: c.quantity,
          }))}
        />
      )}

      {showcase && (
        <ShowcaseSheet
          computedCents={bench.totals.totalCents}
          busy={showcaseBusy}
          error={showcaseError}
          onSubmit={(input) => void makeForShowcase(input)}
          onClose={() => setShowcase(null)}
        />
      )}

      <PriceTagsPrintable tags={printing} paperWidth={loadPaper()} />

      {budgetOpen && (
        <BudgetDialog
          valueCents={bench.budgetCents}
          onSubmit={(cents) => {
            bench.setBudgetCents(cents);
            setBudgetOpen(false);
          }}
          onClose={() => setBudgetOpen(false)}
        />
      )}

      {picker && (
        <VariantPicker
          productName={picker[0]?.product_name ?? ''}
          variants={picker}
          onPick={(item) => {
            bench.add(item);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/**
 * The budget, entered once. A dialog rather than a field in the header because
 * it is set at the start of the conversation and rarely touched again — and
 * because §3.1 says neither entry point is forced: the florist can put stems in
 * first and name a budget later, or the other way round.
 */
function BudgetDialog({
  valueCents,
  onSubmit,
  onClose,
}: {
  valueCents: number | null;
  onSubmit: (cents: number | null) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(valueCents != null ? String(valueCents / 100) : '');

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4">
      <div className="bg-white rounded-card w-full max-w-sm overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
          <h3 className="text-[19px] font-bold text-sq-heading">Бюджет клієнта</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 grid place-items-center text-sq-secondary"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-3">
          <input
            className="w-full h-12 rounded-[10px] bg-sq-empty px-3.5 text-lg font-semibold tabular-nums text-sq-text outline-none border-0 focus:ring-2 focus:ring-sq-blue focus:bg-white"
            inputMode="decimal"
            autoFocus
            placeholder="1500"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
            aria-label="Бюджет, ₴"
            data-testid="bench-budget-input"
          />
          <p className="text-xs text-sq-secondary">
            Підказка, а не ціна: смуга показує, скільки ще влізе. Ціна завжди рахується зі
            складу букета.
          </p>
          <div className="flex gap-2">
            {valueCents != null && (
              <button
                type="button"
                onClick={() => onSubmit(null)}
                className="min-h-12 px-4 rounded-xl bg-white ring-1 ring-sq-divider font-semibold text-sq-text"
              >
                Прибрати
              </button>
            )}
            <button
              type="button"
              onClick={() => onSubmit(uahInputToCents(text) || null)}
              className="pos-btn-primary min-h-12 rounded-xl flex-1"
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const quietClass =
  'min-h-[52px] px-[18px] rounded-xl bg-white ring-1 ring-sq-divider text-base font-semibold text-sq-text inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-sq-sidebar';

/** «3 позиції» — how many kinds of stem, not how many stems. */
function positionsWord(n: number): string {
  const tens = n % 100;
  const units = n % 10;
  if (tens >= 11 && tens <= 14) return `${n} позицій`;
  if (units === 1) return `${n} позиція`;
  if (units >= 2 && units <= 4) return `${n} позиції`;
  return `${n} позицій`;
}
