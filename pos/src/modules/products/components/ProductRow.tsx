// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Link } from 'react-router-dom';
import { assetUrl } from '@pos/platform';
import type { PosTag, Product } from '@pos/platform';
import { ChevronDown, PackageLine } from '@pos/platform/ui';
import { TagDot } from './TagDot';
import { VariantsTable } from './VariantsTable';
import { checkboxClass, chipClass } from './formStyles';
import { productSummary } from '../lib/productSummary';

/**
 * One product in the list (C1e, PR3): a row, not a card with a table under it.
 * The name opens the card, the chevron unfolds the variants in place, «Архів»
 * asks first. The checkbox is the bulk selection the tag bar and the price-tag
 * dialog read.
 */
export function ProductRow({
  product,
  flatTags,
  selected,
  onToggleSelect,
  expanded,
  onToggleExpand,
  onArchive,
  cardState,
}: {
  product: Product;
  flatTags: PosTag[];
  selected: boolean;
  onToggleSelect: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onArchive: () => void;
  /** What the card gets so «← Товари» lands on this same view. */
  cardState: { list: string };
}) {
  const active = product.variants.filter((v) => v.is_active);
  const derived = product.kind === 'composite' && product.stock_mode === 'derived';
  const panelId = `variants-${product.id}`;

  return (
    <article role="listitem" className="sq-row">
      <div className="grid grid-cols-[auto_40px_minmax(0,1fr)_auto_auto] items-center gap-3 min-h-14 py-2.5">
        <input
          type="checkbox"
          aria-label={`Обрати «${product.name}»`}
          className={checkboxClass}
          checked={selected}
          onChange={onToggleSelect}
        />
        <div className="w-10 h-10 rounded-lg bg-sq-empty overflow-hidden grid place-items-center">
          {product.image_url ? (
            <img src={assetUrl(product.image_url) ?? undefined} alt="" className="w-full h-full object-cover" />
          ) : (
            <PackageLine size={20} className="text-sq-muted" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to={`/admin/products/${product.id}`}
              state={cardState}
              className="text-[15px] font-semibold text-sq-text hover:text-sq-blue truncate"
            >
              {product.name}
            </Link>
            {product.needs_review && (
              <span className={`${chipClass} bg-amber-50 text-amber-800`}>Потребує перевірки</span>
            )}
            {product.kind === 'composite' && (
              <span className={`${chipClass} bg-sq-blue/10 text-sq-blue-press`}>
                {derived ? 'Складений · при продажу' : 'Складений · збираємо'}
              </span>
            )}
            {product.sellable === false && (
              <span className={`${chipClass} ring-1 ring-inset ring-sq-divider text-sq-secondary`}>Не на касі</span>
            )}
            {(product.modifier_group_ids?.length ?? 0) > 0 && (
              <span className={`${chipClass} bg-sq-blue/10 text-sq-blue-press`}>
                Модифікатори · {product.modifier_group_ids?.length}
              </span>
            )}
            {(product.tag_ids ?? []).map((tid) => {
              const tag = flatTags.find((t) => t.id === tid);
              return (
                <span key={tid} className={`${chipClass} gap-1.5 ring-1 ring-inset ring-sq-divider text-sq-secondary`}>
                  <TagDot color={tag?.color} />
                  {tag?.name ?? tid}
                </span>
              );
            })}
          </div>
          <p className="text-[13px] text-sq-secondary tabular-nums mt-0.5">{productSummary(product)}</p>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`Варіанти «${product.name}»`}
          onClick={onToggleExpand}
          className="w-9 h-9 grid place-items-center rounded-lg text-sq-secondary hover:bg-sq-sidebar hover:text-sq-text"
        >
          <ChevronDown size={20} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={onArchive}
          className="min-h-9 px-2.5 rounded-lg text-[15px] font-semibold text-sq-secondary hover:text-red-600 hover:bg-red-50"
        >
          Архів
        </button>
      </div>
      {expanded && (
        <div id={panelId} className="pl-[76px] pb-3">
          {active.length === 0 ? (
            <p className="text-[13px] text-sq-muted">Активних варіантів немає.</p>
          ) : (
            <VariantsTable variants={active} derived={derived} />
          )}
        </div>
      )}
    </article>
  );
}
