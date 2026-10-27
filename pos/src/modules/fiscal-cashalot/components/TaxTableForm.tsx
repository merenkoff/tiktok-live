// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-cashalot/components/TaxTableForm.tsx
//
// «Ставки податку» and «Тестовий режим» — Cashalot's `config`. The owner
// copies the letters and names from the Cashalot cabinet (the developers'
// own advice): one row per rate, one of them the default every line is sold
// under. One button saves the table, the mode and the default code in ONE
// PATCH, because the default code is a row of this table and saving them
// apart could leave a code the table no longer has.
//
// Validation is the server's: its 400 («Ставка 2: літера…», «…лише при
// закритій зміні…», «Є чеки, що ще реєструються…») is shown verbatim.

import { useEffect, useState } from 'react';
import type { FiscalSettingsView } from '../../../types';
import {
  configFromDraft,
  defaultLetterFor,
  draftFromConfig,
  emptyRow,
  freeLetters,
  letterCode,
  MAX_TAX_ROWS,
  type CashalotConfigDraft,
} from '../lib/taxTable';

export interface TaxTableFormProps {
  settings: FiscalSettingsView;
  saving: boolean;
  onSave: (config: Record<string, unknown>, defaultTaxCode: string | null) => void;
}

const LABEL = 'text-[13px] font-semibold text-sq-secondary';
const CHECKBOX = 'w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]';

export function TaxTableForm({ settings, saving, onSave }: TaxTableFormProps) {
  const [draft, setDraft] = useState<CashalotConfigDraft>(() => draftFromConfig(settings.config));
  const [defaultLetter, setDefaultLetter] = useState<string | null>(() =>
    defaultLetterFor(settings.default_tax_code, draftFromConfig(settings.config).taxes)
  );

  // A save answers with the row as stored (letters upper-cased, rates as
  // numbers) — re-read it, so what the owner sees is what the till will use.
  useEffect(() => {
    const next = draftFromConfig(settings.config);
    setDraft(next);
    setDefaultLetter(defaultLetterFor(settings.default_tax_code, next.taxes));
  }, [settings.config, settings.default_tax_code]);

  const isVatPayer = settings.requisites?.organization.is_vat === true;
  const savedTaxes = draftFromConfig(settings.config).taxes;
  const savedCodeMissing =
    Boolean(settings.default_tax_code) &&
    savedTaxes.length > 0 &&
    defaultLetterFor(settings.default_tax_code, savedTaxes) === null;

  const setRow = (index: number, patch: Partial<CashalotConfigDraft['taxes'][number]>) =>
    setDraft((prev) => ({
      ...prev,
      taxes: prev.taxes.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

  const addRow = () =>
    setDraft((prev) => ({
      ...prev,
      taxes: [...prev.taxes, emptyRow(freeLetters(prev.taxes, prev.taxes.length)[0] ?? '')],
    }));

  const removeRow = (index: number) =>
    setDraft((prev) => ({ ...prev, taxes: prev.taxes.filter((_, i) => i !== index) }));

  function submit() {
    const letters = draft.taxes.map((t) => t.letter.trim().toUpperCase());
    // The default must be a row that is still there; with none chosen (or the
    // chosen one removed) the first row is the default, as the adapter's own
    // requisites say (`is_default: index === 0`). No rows — no code at all.
    const chosen = defaultLetter && letters.includes(defaultLetter) ? defaultLetter : letters[0];
    onSave(configFromDraft(draft), chosen ? letterCode(chosen) : null);
  }

  return (
    <div className="space-y-4">
      {savedCodeMissing && (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800">
          Збережений код ставки «{settings.default_tax_code}» не з цієї таблиці — кожен чек буде
          відхилено ще до відправки. Оберіть ставку за замовчуванням і збережіть.
        </p>
      )}
      {isVatPayer && draft.taxes.length === 0 && (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800">
          За реквізитами ПРРО ви платник ПДВ, а таблиця ставок порожня — чеки підуть без літер
          податку. Додайте ставки з кабінету Cashalot.
        </p>
      )}

      {draft.taxes.length === 0 ? (
        <p className="text-[15px] text-sq-secondary">
          Таблиця порожня: чек іде без літер податку — так продає ФОП без ПДВ.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[4rem_1fr_6rem_6.5rem_2.5rem] gap-2 px-1">
            <span className={LABEL}>Літера</span>
            <span className={LABEL}>Назва</span>
            <span className={LABEL}>%</span>
            <span className={LABEL}>За замовч.</span>
            <span />
          </div>
          {draft.taxes.map((row, index) => {
            const letter = row.letter.trim().toUpperCase();
            return (
              <div
                key={index}
                className="grid grid-cols-[4rem_1fr_6rem_6.5rem_2.5rem] gap-2 items-center"
              >
                <select
                  aria-label={`Літера ставки ${index + 1}`}
                  className="sq-input"
                  value={letter}
                  onChange={(e) => setRow(index, { letter: e.target.value })}
                >
                  {letter === '' && <option value="">—</option>}
                  {freeLetters(draft.taxes, index).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Назва ставки ${index + 1}`}
                  className="sq-input"
                  value={row.name}
                  placeholder="ПДВ"
                  onChange={(e) => setRow(index, { name: e.target.value })}
                />
                <input
                  aria-label={`Відсоток ставки ${index + 1}`}
                  className="sq-input tabular-nums"
                  inputMode="decimal"
                  value={row.rate}
                  placeholder="20"
                  onChange={(e) => setRow(index, { rate: e.target.value })}
                />
                <label className="min-h-11 flex items-center justify-center gap-2 text-[13px] text-sq-secondary">
                  <input
                    type="radio"
                    name="cashalot-default-tax"
                    aria-label={`Ставка ${index + 1} за замовчуванням`}
                    className={CHECKBOX}
                    checked={letter !== '' && defaultLetter === letter}
                    disabled={letter === ''}
                    onChange={() => setDefaultLetter(letter)}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Прибрати ставку ${index + 1}`}
                  className="min-h-11 text-[20px] leading-none text-sq-muted hover:text-red-600"
                  onClick={() => removeRow(index)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {draft.taxes.length < MAX_TAX_ROWS && (
        <button type="button" className="sq-btn-quiet" onClick={addRow}>
          + Додати ставку
        </button>
      )}
      <p className="text-[13px] text-sq-muted">
        Літери й назви — як у кабінеті Cashalot (Налаштування → Податки). Ставка за замовчуванням
        друкується на кожному рядку чека. Змінюються лише при закритій зміні.
      </p>

      <label className="min-h-11 flex items-center gap-3 text-[15px] text-sq-text">
        <input
          type="checkbox"
          className={CHECKBOX}
          checked={draft.testing}
          onChange={(e) => setDraft((prev) => ({ ...prev, testing: e.target.checked }))}
        />
        <span>Тестовий режим</span>
      </label>
      <p className="-mt-2 pl-8 text-[13px] text-sq-muted">
        Чеки й зміни йдуть у Cashalot як тестові — без фіскальної сили, для перевірки
        налаштувань. Вимкніть перед першим справжнім продажем; змінюється лише при закритій
        зміні й без чеків у черзі.
      </p>

      <button
        type="button"
        className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]"
        disabled={saving}
        onClick={submit}
      >
        {saving ? 'Збереження…' : 'Зберегти ставки й режим'}
      </button>
    </div>
  );
}
