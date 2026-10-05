// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Receiving by matrix (clothing S1, TechDocs/POS_CLOTHING.md): one model,
// its colours down the side, its sizes across the top, a received count in
// every cell — the size run of a supplier's invoice, typed once instead of a
// line per size. A card the shop already has opens with its own colours and
// sizes on the grid (a size it does not have yet is a new cell); a name the
// shop does not have is a new card. Nothing is created here: existing sizes
// become ordinary lines, new ones become stubs, and the server makes the
// card or the variants when the document is posted — exactly like the
// one-variant stub, so a draft receipt still creates nothing.
//
// The axes are the product card's own (`products/components/MatrixAxes`),
// rendered from another module on purpose, like `PriceTagsDialog` on the
// document page: the stock remote's stylesheet lists these files
// (`vite.stock-remote.config.ts`, `check:stock-css-coverage`).

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, formatUah, uahInputToCents } from '@pos/platform';
import type { Product, VerticalPublicConfig } from '@pos/platform';
import { Dialog } from '../../products/components/Dialog';
import { ColourAxis, SizeAxis } from '../../products/components/MatrixAxes';
import { matrixCaption, useMatrixAxes } from '../../products/lib/useMatrixAxes';
import { axesOfVariants, cellKey, colourVocabulary, type ColourUse } from '../../products/lib/variantMatrix';
import {
  buildReceiveLines,
  cellLabel,
  commonPriceCents,
  receiveCells,
  type ReceiveCard,
  type ReceiveMatrixResult,
} from '../lib/receiveMatrix';

export type { ReceiveMatrixResult } from '../lib/receiveMatrix';

function apiError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (msg) return msg;
  }
  if (err instanceof Error) return err.message;
  return 'Помилка';
}

/** The step where the owner says WHICH model: a card the shop has, or a new name. */
function PickCard({
  products,
  loadError,
  onPick,
  onNew,
}: {
  products: Product[] | null;
  loadError: string | null;
  onPick: (card: Product) => void;
  onNew: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!products || !needle) return [];
    return products
      .filter((p) => p.is_active !== false && p.kind !== 'composite' && p.name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [products, needle]);
  const exact = hits.some((p) => p.name.trim().toLowerCase() === needle);

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1.5">
        <span className={matrixCaption}>Назва товару</span>
        <input
          className="sq-input"
          aria-label="Назва товару"
          placeholder="Почніть вводити назву — картка або новий товар"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (hits.length === 1 && exact) onPick(hits[0]);
              else if (needle) onNew(query.trim());
            }
          }}
        />
      </label>
      {loadError && <p className="text-[13px] text-amber-800 bg-amber-50 rounded-sq px-3 py-2">{loadError}</p>}
      {products === null && !loadError && <p className="text-[13px] text-sq-muted">Завантажуємо картки…</p>}
      {hits.length > 0 && (
        <ul className="space-y-1" aria-label="Картки магазину">
          {hits.map((p) => {
            const live = p.variants.filter((v) => v.is_active !== false).length;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="sq-row w-full min-h-11 text-left px-2 py-2 text-[15px] flex items-center justify-between gap-3 hover:bg-sq-sidebar/60"
                >
                  <span className="text-sq-text">{p.name}</span>
                  <span className="text-[13px] text-sq-muted tabular-nums whitespace-nowrap">
                    {live === 1 ? '1 варіант' : `${live} варіантів`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {needle && !exact && (
        <button type="button" onClick={() => onNew(query.trim())} className="sq-btn-quiet">
          Новий товар «{query.trim()}»
        </button>
      )}
    </div>
  );
}

/** The grid for ONE model. Mounted with a `key`, so a different card seeds fresh axes. */
function Grid({
  card,
  name,
  vertical,
  vocabulary,
  onAdd,
  onBack,
}: {
  card: ReceiveCard | null;
  name: string;
  vertical: VerticalPublicConfig;
  vocabulary: ColourUse[];
  onAdd: (result: ReceiveMatrixResult) => void;
  onBack: () => void;
}) {
  const axes = useMatrixAxes({ vocabulary, initial: card ? axesOfVariants(card.variants) : undefined });
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const common = useMemo(() => commonPriceCents(card), [card]);
  const [price, setPrice] = useState(() => (common == null ? '' : String(common / 100)));
  const [cost, setCost] = useState('');
  const [attempted, setAttempted] = useState(false);

  const cells = useMemo(() => receiveCells(axes.colours, axes.sizes, card), [axes.colours, axes.sizes, card]);
  const hasNew = cells.some((c) => c.variant == null);
  const result = useMemo(
    () =>
      buildReceiveLines({
        card,
        name,
        cells,
        quantities,
        priceCents: price.trim() === '' ? null : uahInputToCents(price),
        costCents: cost.trim() === '' ? null : uahInputToCents(cost),
        unit: vertical.defaultUnit,
      }),
    [card, name, cells, quantities, price, cost, vertical.defaultUnit]
  );

  // The grid is drawn colour by colour; without colours it is one row, without
  // sizes one column — a hat is still received.
  const rows = axes.colours.length ? axes.colours : [''];
  const cols = axes.sizes.length ? axes.sizes : [''];
  const byKey = useMemo(() => new Map(cells.map((c) => [c.key, c])), [cells]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAttempted(true);
    if (result.problem) return;
    onAdd(result);
  }

  return (
    <Dialog
      title={card ? card.name : `Новий товар «${name}»`}
      description={
        card
          ? 'Впишіть, скільки приїхало кожного розміру. Розмір, якого на картці ще немає, створиться при проведенні.'
          : 'Кольори, розміри й кількість кожного — картка зʼявиться в каталозі лише після «Провести».'
      }
      onClose={onBack}
      onSubmit={submit}
      size="lg"
      testId="receive-matrix-dialog"
      footer={
        <>
          <button type="button" className="sq-btn-quiet" onClick={onBack}>
            Назад
          </button>
          <button type="submit" className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]">
            Додати в прихід
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ColourAxis axes={axes} vocabulary={vocabulary} />
        <SizeAxis axes={axes} />

        <div className="overflow-x-auto -mx-1 px-1">
          <table className="sq-table" aria-label="Кількість за розмірами">
            <thead>
              <tr>
                <th>{axes.colours.length ? 'Колір' : ''}</th>
                {cols.map((size) => (
                  <th key={size || '—'} className="!text-center whitespace-nowrap">
                    {size || 'К-сть'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((color) => (
                <tr key={color || '—'}>
                  <td className="whitespace-nowrap text-sq-text">{color || (axes.colours.length ? '' : '—')}</td>
                  {cols.map((size) => {
                    const cell = byKey.get(cellKey({ color, size }));
                    if (!cell) return <td key={size || '—'} />;
                    const label = cellLabel(cell.cell);
                    return (
                      <td key={size || '—'} className="!px-1">
                        <input
                          className="sq-input tabular-nums text-center w-20"
                          inputMode="numeric"
                          aria-label={`К-сть: ${label}`}
                          title={cell.variant ? `На складі ${cell.variant.quantity} ${cell.variant.unit}` : 'Новий розмір — створиться при проведенні'}
                          placeholder={cell.variant ? `є ${cell.variant.quantity}` : '+ новий'}
                          value={quantities[cell.key] ?? ''}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [cell.key]: e.target.value }))}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-sq-muted">
          Порожня клітинка — не приймаємо. «є N» — стільки на складі зараз; «+ новий» — розміру ще немає, він створиться
          при проведенні.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {hasNew && (
            <label className="flex flex-col gap-1.5">
              <span className={matrixCaption}>{card ? 'Ціна продажу нових розмірів, грн *' : 'Ціна продажу, грн *'}</span>
              <input
                className="sq-input tabular-nums"
                inputMode="decimal"
                aria-label="Ціна продажу, грн"
                placeholder="грн"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              {card && common != null && (
                <span className="text-[13px] text-sq-muted">Наявні розміри лишають свою ціну; на картці найчастіше {formatUah(common)}.</span>
              )}
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className={matrixCaption}>Закупівельна за {vertical.defaultUnit}, грн</span>
            <input
              className="sq-input tabular-nums"
              inputMode="decimal"
              aria-label="Закупівельна ціна, грн"
              placeholder="необовʼязково"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
        </div>

        <p className="text-[13px] text-sq-secondary" aria-live="polite" data-testid="receive-matrix-summary">
          До документа: {result.units} {vertical.defaultUnit}
          {result.newCells > 0 && ` · нових розмірів: ${result.newCells}`}
        </p>
        {attempted && result.problem && (
          <p role="status" className="text-[13px] text-sq-danger">
            {result.problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * «Матрицею» on the receiving page: pick the model, fill the grid, and hand
 * the page its lines. Cards come from `GET /products` (the one place that
 * carries every variant's attributes); without them the new-card path still
 * works, and the refusal is said in words rather than blocking the grid.
 */
export function ReceiveMatrixDialog({
  vertical,
  onAdd,
  onClose,
}: {
  vertical: VerticalPublicConfig;
  onAdd: (result: ReceiveMatrixResult) => void;
  onClose: () => void;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [card, setCard] = useState<Product | null>(null);
  const [newName, setNewName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getProducts()
      .then((list) => {
        if (alive) setProducts(list);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setProducts([]);
        setLoadError(`Картки не завантажились (${apiError(err)}) — можна додати лише новий товар.`);
      });
    return () => {
      alive = false;
    };
  }, []);

  const vocabulary = useMemo(() => colourVocabulary(products ?? []), [products]);

  if (card || newName != null) {
    return (
      <Grid
        key={card ? `card-${card.id}` : 'new'}
        card={card}
        name={newName ?? ''}
        vertical={vertical}
        vocabulary={vocabulary}
        onAdd={onAdd}
        onBack={() => {
          setCard(null);
          setNewName(null);
        }}
      />
    );
  }

  return (
    <Dialog
      title="Прихід матрицею"
      description="Одна модель — кольори, розміри й кількість кожного в одній сітці."
      onClose={onClose}
      size="md"
      testId="receive-matrix-dialog"
      footer={
        <button type="button" className="sq-btn-quiet" onClick={onClose}>
          Закрити
        </button>
      }
    >
      <PickCard products={products} loadError={loadError} onPick={setCard} onNew={setNewName} />
    </Dialog>
  );
}
