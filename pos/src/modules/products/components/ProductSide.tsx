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
import type { RegisterChoice } from '../lib/registerChoices';

type Fields = Pick<
  ProductDraft,
  'sellable' | 'menuHidden' | 'fiscalRegister' | 'fiscalExcise' | 'excisePerUnit' | 'uktzed' | 'tagIds' | 'groupIds'
>;

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
 * «Не показувати в QR-меню» — for a kitchen vertical only, the one kind of
 * store with a guest menu: the cork fee the waiter rings, a bag, a deposit.
 * The till still sells it; the guest never reads it (migration 083).
 */
export function MenuHiddenField({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-[15px] text-sq-text cursor-pointer sm:col-span-2">
      <input
        type="checkbox"
        className={`${checkboxClass} mt-1`}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Не показувати в QR-меню
        <span className="block text-[13px] text-sq-muted">
          Для коркового збору, пакета чи депозиту: касир і офіціант додають його в чек, а гість у меню не бачить
        </span>
      </span>
    </label>
  );
}

/**
 * «Каса» — which register (which ФОП) the product is sold through (track ДК,
 * TechDocs/POS_DUAL_REGISTER.md §4.2). Only in a store with a register 2.
 */
export function RegisterField({
  value,
  choices,
  onChange,
}: {
  value: number;
  choices: RegisterChoice[];
  onChange: (next: number) => void;
}) {
  // A product put on a register that has since been switched off still says so.
  const known = choices.some((c) => c.registerNo === value);
  return (
    <label className="block sm:col-span-2">
      <span className={captionClass}>Каса</span>
      <select
        className="mt-1 w-full min-h-11 rounded-[10px] bg-sq-surface ring-1 ring-inset ring-sq-divider px-3 text-[15px] text-sq-text"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid="product-fiscal-register"
      >
        {choices.map((c) => (
          <option key={c.registerNo} value={c.registerNo}>
            {c.label}
          </option>
        ))}
        {!known && <option value={value}>Каса {value} (вимкнена — продається через касу 1)</option>}
      </select>
      <span className="block mt-1 text-[13px] text-sq-muted">
        Через яку касу пробивається: усе підакцизне (алкоголь, пиво) — на касу ФОП, що має ліцензію
      </span>
    </label>
  );
}

/**
 * Excise goods (track ДК, ДК4, decision Д17 — every store with ПРРО): beer
 * and alcohol carry the 5 % retail excise on their receipt line, with the
 * УКТ ЗЕД; a bottle sold whole also carries its stamp, scanned at the sale.
 */
export function ExciseFields({
  value,
  onPatch,
}: {
  value: Pick<ProductDraft, 'fiscalExcise' | 'excisePerUnit' | 'uktzed'>;
  onPatch: (patch: Partial<Pick<ProductDraft, 'fiscalExcise' | 'excisePerUnit' | 'uktzed'>>) => void;
}) {
  return (
    <div className="space-y-3" data-testid="product-excise">
      <label className="flex items-start gap-2.5 text-[15px] text-sq-text cursor-pointer">
        <input
          type="checkbox"
          className={`${checkboxClass} mt-1`}
          checked={value.fiscalExcise}
          onChange={(e) => onPatch({ fiscalExcise: e.target.checked })}
          data-testid="product-excise-flag"
        />
        <span>
          Підакцизний (алкоголь, пиво, тютюн)
          <span className="block text-[13px] text-sq-muted">
            У чеку — рядок акцизу 5 %. Підакцизне пробивається касою ФОП, що має ліцензію
          </span>
        </span>
      </label>
      {value.fiscalExcise && (
        <>
          <label className="block">
            <span className={captionClass}>УКТ ЗЕД</span>
            <input
              className="mt-1 w-full min-h-11 rounded-[10px] bg-sq-surface ring-1 ring-inset ring-sq-divider px-3 text-[15px] tabular-nums"
              inputMode="numeric"
              placeholder="2208601100"
              value={value.uktzed}
              onChange={(e) => onPatch({ uktzed: e.target.value.replace(/[^\d\s]/g, '') })}
              data-testid="product-uktzed"
            />
            <span className="block mt-1 text-[13px] text-sq-muted">Від 4 до 10 цифр, з накладної постачальника</span>
          </label>
          <label className="flex items-start gap-2.5 text-[15px] text-sq-text cursor-pointer">
            <input
              type="checkbox"
              className={`${checkboxClass} mt-1`}
              checked={value.excisePerUnit}
              onChange={(e) => onPatch({ excisePerUnit: e.target.checked })}
              data-testid="product-excise-per-unit"
            />
            <span>
              Марка на кожну одиницю (ціла пляшка)
              <span className="block text-[13px] text-sq-muted">
                Касир чи офіціант сканує акцизну марку кожної пляшки — її номер іде в чек. Для розливу не ставте
              </span>
            </span>
          </label>
        </>
      )}
    </div>
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
  askMenuHidden = false,
  registers = [],
  askExcise = false,
}: {
  value: Fields;
  onPatch: (patch: Partial<Fields>) => void;
  /** Offer «Не показувати в QR-меню» — only where the store has a guest menu. */
  askMenuHidden?: boolean;
  /** The store's registers; empty (one register) asks nothing. */
  registers?: RegisterChoice[];
  /** Ask the excise questions — in a store that fiscalises (Д17). */
  askExcise?: boolean;
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
        {askMenuHidden && (
          <MenuHiddenField checked={value.menuHidden} onChange={(menuHidden) => onPatch({ menuHidden })} />
        )}
        {registers.length > 1 && (
          <RegisterField
            value={value.fiscalRegister}
            choices={registers}
            onChange={(fiscalRegister) => onPatch({ fiscalRegister })}
          />
        )}
        {askExcise && <ExciseFields value={value} onPatch={onPatch} />}
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
