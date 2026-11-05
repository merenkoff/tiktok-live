// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * «Пляшка за маркою, мл» (track ДК, ДК5, Д10): this variant is poured by the
 * millilitre out of a bottle the bar opens by its excise stamp, and this is
 * how much one bottle holds. Its own field rather than the purchase pack,
 * because the pack may be a case of six — the pack only offers its number
 * when it is one bottle.
 *
 * The server says the same in words, but the owner should see it before
 * saving: only a variant counted in мл, only excise goods with a УКТ ЗЕД code,
 * and never goods sold whole with a stamp per bottle.
 */
export function BottleField({
  value,
  unit,
  pack,
  excise,
  onChange,
}: {
  /** Raw input text; '' = not poured from a stamped bottle. */
  value: string;
  unit: string;
  /** The purchase pack, to offer its size when it is one bottle. */
  pack: { qty: string; label: string };
  /** The product's excise fields as they stand in the card's draft. */
  excise: { on: boolean; perUnit: boolean; uktzed: string };
  onChange: (next: string) => void;
}) {
  const packQty = Number(pack.qty);
  const fromPack =
    value.trim() === '' && Number.isInteger(packQty) && packQty > 0 && /пляш/i.test(pack.label) ? packQty : null;
  const problem =
    value.trim() === ''
      ? null
      : unit !== 'мл'
        ? 'Лише для товару, який рахують у мл'
        : !excise.on || excise.uktzed.trim() === ''
          ? 'Позначте товар підакцизним і вкажіть код УКТ ЗЕД — без них картку не збережуть'
          : excise.perUnit
            ? 'Товар із маркою на кожну одиницю продається цілими пляшками і не наливається'
            : null;

  return (
    <div className="space-y-2" data-testid="variant-bottle">
      <p className="sq-section-label">Розлив з пляшки за маркою</p>
      <label className="flex flex-col gap-1.5 sm:max-w-[50%]">
        <span className="text-[13px] font-medium text-sq-secondary">Пляшка за маркою, мл</span>
        <input
          type="number"
          min={1}
          max={100000}
          inputMode="numeric"
          placeholder="500"
          className="sq-input tabular-nums"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid="variant-bottle-ml"
        />
      </label>
      {fromPack != null && (
        <button
          type="button"
          className="text-[14px] font-semibold text-sq-blue"
          onClick={() => onChange(String(fromPack))}
          data-testid="variant-bottle-from-pack"
        >
          Як у фасуванні: {fromPack} мл
        </button>
      )}
      <p className={`text-[13px] ${problem ? 'text-amber-700' : 'text-sq-muted'}`}>
        {problem ??
          (value.trim() === ''
            ? 'Заповніть для алкоголю на розлив: каса попросить марку нової пляшки, коли налито стільки, скільки в ній є, і внесе марку в чек першої порції з неї.'
            : 'Склад і далі рахується в мл. Марку нової пляшки сканують на касі або в «Пляшках» на барі.')}
      </p>
    </div>
  );
}
