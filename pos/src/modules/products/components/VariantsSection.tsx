// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { formatUahCompact } from '@pos/platform';
import { MoreHorizontal, Plus, SectionHead } from '@pos/platform/ui';
import { GenerateBarcodeButton } from './GenerateBarcodeButton';
import { rowName, type VariantDraft } from '../lib/productDraft';

const cell = 'sq-input !min-h-10 !h-10 !py-0 text-[15px] min-w-0';

/**
 * The card's variants as a TABLE — one row each, the fields an owner touches
 * every day (price, article, barcode) typed in place, and everything else
 * (markdown, purchase price, pack, recipe, archive) behind «Ще». The old form
 * drew every variant as a fully expanded block of a dozen fields, so a garment
 * in ten sizes was a screen seven thousand pixels tall.
 */
export function VariantsSection({
  variants,
  derived,
  composite,
  rowErrors,
  onPatch,
  onOpen,
  onAdd,
  addLabel,
}: {
  variants: VariantDraft[];
  /** A derived composite: the stock column is what the components allow. */
  derived: boolean;
  composite: boolean;
  /** Why a row could not be saved, by variant id — the server's own words. */
  rowErrors: Record<number, string>;
  onPatch: (id: number, patch: Partial<VariantDraft>) => void;
  /** «Ще» — the whole field set in a sheet. */
  onOpen: (id: number) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <section className="space-y-3">
      <SectionHead
        title="Варіанти"
        count={variants.length || undefined}
        action={
          <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 min-h-9">
            <Plus size={18} />
            {addLabel}
          </button>
        }
      />
      {variants.length === 0 ? (
        <p className="text-[15px] text-sq-muted">Варіантів немає — додайте перший.</p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="sq-table">
            <thead>
              <tr>
                <th>Варіант</th>
                <th>Ціна, грн</th>
                <th className="!text-right whitespace-nowrap">{derived ? 'Можна зібрати' : 'Залишок'}</th>
                <th>Артикул</th>
                <th>Штрихкод</th>
                <th className="!pr-0" aria-label="Ще" />
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => {
                const name = rowName(v);
                const error = rowErrors[v.id];
                const marked = v.compareAtCents != null && v.compareAtCents > 0;
                return (
                  <VariantRow
                    key={v.id}
                    v={v}
                    name={name}
                    error={error}
                    marked={marked}
                    derived={derived}
                    composite={composite}
                    onPatch={onPatch}
                    onOpen={onOpen}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function VariantRow({
  v,
  name,
  error,
  marked,
  derived,
  composite,
  onPatch,
  onOpen,
}: {
  v: VariantDraft;
  name: string;
  error: string | undefined;
  marked: boolean;
  derived: boolean;
  composite: boolean;
  onPatch: (id: number, patch: Partial<VariantDraft>) => void;
  onOpen: (id: number) => void;
}) {
  return (
    <>
      <tr className={error ? '!border-b-0' : ''}>
        <td className="align-middle">
          <button
            type="button"
            onClick={() => onOpen(v.id)}
            className="text-left text-[15px] font-medium text-sq-text hover:text-sq-blue"
          >
            {name}
          </button>
          {composite && (
            <span className="block text-[13px] text-sq-muted">Склад · {v.components.length}</span>
          )}
        </td>
        <td className="align-middle">
          <input
            className={`${cell} tabular-nums w-24`}
            inputMode="decimal"
            aria-label={`Ціна · ${name}`}
            value={v.price}
            onChange={(e) => onPatch(v.id, { price: e.target.value })}
          />
          {marked && (
            <span className="block text-[11px] text-sq-muted tabular-nums mt-0.5">
              було {formatUahCompact(v.compareAtCents!)}
            </span>
          )}
        </td>
        <td className="align-middle text-right tabular-nums whitespace-nowrap">
          {derived ? 'до ' : ''}
          {v.quantity}
          {v.unit ? <span className="text-[13px] text-sq-muted"> {v.unit}</span> : null}
        </td>
        <td className="align-middle">
          <input
            className={`${cell} w-28`}
            aria-label={`Артикул · ${name}`}
            value={v.sku}
            onChange={(e) => onPatch(v.id, { sku: e.target.value })}
          />
        </td>
        <td className="align-middle">
          {/* A row with no code offers to mint one in place of the empty box;
              a row that has one shows it — the sheet has both side by side. */}
          {v.barcode === '' ? (
            <GenerateBarcodeButton
              label="Згенерувати"
              className="text-[15px] font-semibold text-sq-blue whitespace-nowrap min-h-10 px-1"
              onGenerated={(barcode) => onPatch(v.id, { barcode })}
            />
          ) : (
            <input
              className={`${cell} tabular-nums w-36`}
              inputMode="numeric"
              aria-label={`Штрихкод · ${name}`}
              value={v.barcode}
              onChange={(e) => onPatch(v.id, { barcode: e.target.value })}
            />
          )}
        </td>
        <td className="align-middle !pr-0">
          <button
            type="button"
            onClick={() => onOpen(v.id)}
            aria-label={`Ще · ${name}`}
            title="Усі поля варіанта: знижка, закупівельна ціна, фасування, склад"
            className="w-9 h-9 grid place-items-center rounded-lg text-sq-secondary hover:bg-sq-sidebar hover:text-sq-text"
          >
            <MoreHorizontal size={20} />
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} className="!pt-0 text-sm text-red-600" role="alert">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
