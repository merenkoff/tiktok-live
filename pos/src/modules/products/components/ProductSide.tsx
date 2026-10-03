// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModifierGroup, PosTag } from '@pos/platform';
import { SectionHead } from '@pos/platform/ui';
import { ModifierGroupChips } from './ModifierGroupChips';
import { TagDot } from './TagDot';
import { TechCardLine } from './TechCardLine';
import { captionClass, checkboxClass } from './formStyles';
import { tagPathLabel } from './tagLabels';
import type { TechCardRow } from '../data/techCardsApi';
import { rowName, type ProductDraft } from '../lib/productDraft';

type Fields = Pick<ProductDraft, 'sellable' | 'tagIds' | 'groupIds'>;

/** «Продається на касі» — the same switch on every card. */
export function SellableField({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-[15px] text-sq-text cursor-pointer sm:col-span-2">
      <input
        type="checkbox"
        className={`${checkboxClass} mt-1`}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Продається на касі
        <span className="block text-[13px] text-sq-muted">
          Вимкніть для інгредієнта чи заготовки: склад і рецепти його бачать, екран продажу — ні
        </span>
      </span>
    </label>
  );
}

/**
 * The card's side column: how the product shows at the till — on the sell
 * screen or not, under which tags, asking which questions — and, for a
 * composite, what each variant costs to assemble.
 */
export function ProductSide({
  value,
  onPatch,
  flatTags,
  groups,
  techCards,
  variants,
}: {
  value: Fields;
  onPatch: (patch: Partial<Fields>) => void;
  flatTags: PosTag[];
  groups: ModifierGroup[];
  /** What each composite variant costs to assemble, by variant id. */
  techCards?: Map<number, TechCardRow>;
  variants?: ProductDraft['variants'];
}) {
  function toggleTag(id: number) {
    onPatch({
      tagIds: value.tagIds.includes(id) ? value.tagIds.filter((x) => x !== id) : [...value.tagIds, id],
    });
  }

  const costLines = (variants ?? []).filter((v) => techCards?.has(v.id));

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <SectionHead title="На касі" />
        <SellableField checked={value.sellable} onChange={(sellable) => onPatch({ sellable })} />
      </section>

      <section className="space-y-3">
        <SectionHead title="Мітки" count={value.tagIds.length || undefined} />
        <div className="flex flex-wrap gap-2">
          {flatTags.map((t) => {
            const on = value.tagIds.includes(t.id);
            return (
              <label
                key={t.id}
                className={`inline-flex items-center gap-2 min-h-9 px-3 rounded-[10px] text-[15px] cursor-pointer transition-colors ${
                  on
                    ? 'bg-sq-blue/[0.08] ring-1 ring-inset ring-sq-blue/40 text-sq-text font-medium'
                    : 'bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text hover:bg-sq-sidebar'
                }`}
              >
                <input type="checkbox" className={checkboxClass} checked={on} onChange={() => toggleTag(t.id)} />
                <TagDot color={t.color} />
                {tagPathLabel(flatTags, t)}
              </label>
            );
          })}
          {flatTags.length === 0 && <span className="text-[15px] text-sq-muted">Немає міток</span>}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead title="Модифікатори" count={value.groupIds.length || undefined} />
        <ModifierGroupChips
          caption={null}
          groups={groups}
          value={value.groupIds}
          onChange={(groupIds) => onPatch({ groupIds })}
        />
      </section>

      {costLines.length > 0 && (
        <section className="space-y-2">
          <SectionHead title="Собівартість" />
          {costLines.map((v) => (
            <div key={v.id} className="space-y-0.5">
              {costLines.length > 1 && <p className={captionClass}>{rowName(v)}</p>}
              <TechCardLine card={techCards?.get(v.id)} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
