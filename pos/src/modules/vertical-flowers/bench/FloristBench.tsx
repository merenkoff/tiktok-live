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
 * v1 keeps the composition in memory only. Parking a half-built bouquet for
 * another till is phase B4, and the button says so rather than pretending.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search, Store, X } from 'lucide-react';
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
  onClose: () => void;
}

export function FloristBench({
  card,
  labourBps,
  catalog,
  onDone,
  onShowcased,
  onClose,
}: FloristBenchProps) {
  const bench = useBench(labourBps);
  const vertical = useVertical();
  const [picker, setPicker] = useState<CatalogItem[] | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const online = useOfflineStatus((s) => s.online);
  const storeName = useAuthStore((s) => s.auth?.store.name ?? '');
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

      <header className="px-4 py-3 border-b border-sq-divider flex items-center gap-3 shrink-0">
        <div className="min-w-0">
          <h2 className="font-semibold text-sq-text truncate">{card.product_name}</h2>
          <p className="text-xs text-sq-secondary">
            {bench.totals.stemCount > 0 ? `${bench.totals.stemCount} у букеті` : 'Збираємо букет'}
          </p>
        </div>
        <div className="hidden lg:block w-80 xl:w-96 ml-auto">
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
          className="min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-secondary hover:text-sq-text lg:ml-0 ml-auto shrink-0"
          aria-label="Закрити"
        >
          <X size={20} />
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        <section className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="px-3 pt-3 pb-2 space-y-2 border-b border-sq-divider shrink-0">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
              />
              <input
                className="pos-field text-sm !pl-10 !bg-sq-bg !border-sq-divider"
                placeholder="Пошук"
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

        <aside className="hidden lg:flex w-[22rem] xl:w-[26rem] shrink-0 flex-col border-l border-sq-divider bg-sq-sidebar min-h-0">
          <h3 className="px-4 py-3 text-sm font-semibold text-sq-text border-b border-sq-divider bg-white shrink-0">
            Склад букета
          </h3>
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
          />
        </aside>
      </div>

      {/* Tablet: the summary lives in the footer bar, because the sheet that
          holds the composition is closed most of the time and the price is the
          one thing that may never be out of sight. */}
      <div className="lg:hidden border-t border-sq-divider px-4 py-2 bg-white shrink-0 space-y-2">
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
          className="w-full min-h-12 flex items-center justify-between gap-3 rounded-sq border border-sq-divider px-3"
          data-testid="bench-open-sheet"
        >
          <span className="text-sm text-sq-secondary">
            Склад · {bench.totals.stemCount || '—'}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-lg font-semibold tabular-nums" data-testid="bench-total-mobile">
              {formatUah(bench.totals.totalCents)}
            </span>
            <ChevronDown size={18} className="text-sq-muted rotate-180" />
          </span>
        </button>
      </div>

      <footer className="border-t border-sq-divider px-4 py-3 flex items-center gap-3 shrink-0 bg-white">
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text"
        >
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
          className="min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text disabled:opacity-50 flex items-center gap-2"
          data-testid="bench-to-showcase"
        >
          <Store size={18} />
          <span className="hidden sm:inline">{online ? 'На вітрину' : 'Потрібна мережа'}</span>
        </button>
        <button
          type="button"
          disabled={empty}
          onClick={() =>
            onDone({ unit_price_cents: bench.totals.totalCents, components: bench.components })
          }
          className="sq-btn-primary min-h-12 flex-1"
          data-testid="bench-add-to-cart"
        >
          Додати в чек · {formatUah(bench.totals.totalCents)}
        </button>
      </footer>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Закрити склад"
            onClick={() => setSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] bg-sq-sidebar rounded-t-sq flex flex-col animate-fade-up">
            <div className="px-4 py-3 border-b border-sq-divider bg-white shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sq-text">Склад букета</h3>
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
            />
          </div>
        </div>
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
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4">
      <div className="bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg">
        <div className="px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sq-text">Бюджет клієнта</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 grid place-items-center text-sq-secondary"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <input
            className="pos-field text-lg"
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
                className="min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text"
              >
                Прибрати
              </button>
            )}
            <button
              type="button"
              onClick={() => onSubmit(uahInputToCents(text) || null)}
              className="sq-btn-primary min-h-12 flex-1"
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
