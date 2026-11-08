// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import {
  loadPrinterEncoding,
  printEncodingTest,
  savePrinterEncoding,
  type ReceiptPaperWidth,
} from '../lib/printer';
import {
  DEFAULT_PRINTER_ENCODING,
  ENCODING_PRESETS,
  ENCODING_TABLES,
  encodingTitle,
  parseEscT,
  presetCandidates,
  sameEncoding,
  sweepCandidates,
  tableInfo,
  type PrinterEncoding,
  type PrinterEncodingTable,
} from '../lib/printerEncoding';

/** What a failed print says: the command's own sentence, else a generic one. */
function whyNot(e: unknown): string {
  return typeof e === 'string' && e ? e : 'Не вдалося надрукувати.';
}

/**
 * «Кодування кирилиці» for one printer (`HardwarePage`).
 *
 * Many 58 mm receipt printers do not number their character tables the way
 * Epson does, so the usual profile prints Cyrillic as box-drawing symbols
 * («Σ π ╖»). There is no way to ask the printer which table it has — so this
 * prints a test sheet with the likely profiles side by side, the person looks
 * at the paper and ticks the line that reads right, and the choice is kept for
 * that printer (`lib/printer.ts`), whichever document it prints.
 *
 * Folded away by default: a printer that works needs none of it, and the line
 * that is always visible says which profile is in force.
 */
export function PrinterEncodingPicker({
  printerName,
  paperWidth,
}: {
  printerName: string;
  paperWidth: ReceiptPaperWidth;
}) {
  const [encoding, setEncoding] = useState<PrinterEncoding>({ ...DEFAULT_PRINTER_ENCODING });
  const [open, setOpen] = useState(false);
  const [escText, setEscText] = useState('');
  const [escError, setEscError] = useState(false);
  const [from, setFrom] = useState('0');
  const [to, setTo] = useState('80');
  const [printing, setPrinting] = useState<'presets' | 'sweep' | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setStatus(null);
    void loadPrinterEncoding(printerName).then((saved) => {
      if (!alive) return;
      setEncoding(saved);
      setEscText(saved.esc_t === null ? '' : String(saved.esc_t));
      setEscError(false);
    });
    return () => {
      alive = false;
    };
  }, [printerName]);

  function apply(next: PrinterEncoding) {
    setEncoding(next);
    setStatus(null);
    void savePrinterEncoding(printerName, next);
  }

  function pickTable(table: PrinterEncodingTable) {
    apply({ ...encoding, table });
  }

  function typeEscT(text: string) {
    setEscText(text);
    const parsed = parseEscT(text);
    if (parsed === 'invalid') {
      setEscError(true);
      return;
    }
    setEscError(false);
    apply({ ...encoding, esc_t: parsed });
  }

  async function sheet(kind: 'presets' | 'sweep') {
    let candidates;
    if (kind === 'presets') {
      candidates = presetCandidates();
    } else {
      const lo = Number(from);
      const hi = Number(to);
      if (![lo, hi].every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
        setStatus('Номери мають бути цілими від 0 до 255.');
        return;
      }
      candidates = sweepCandidates(encoding.table, lo, hi);
    }
    setPrinting(kind);
    setStatus(null);
    try {
      await printEncodingTest(printerName, paperWidth, candidates);
      setStatus(
        kind === 'presets'
          ? 'Надіслано на друк. Знайдіть на аркуші рядки, де текст читається, і виберіть той варіант нижче.'
          : 'Надіслано на друк. Знайдіть рядок, де текст читається, і впишіть його номер у поле «Номер таблиці».'
      );
    } catch (e) {
      setStatus(`Помилка друку: ${whyNot(e)}`);
    } finally {
      setPrinting(null);
    }
  }

  const isDefault = sameEncoding(encoding, DEFAULT_PRINTER_ENCODING);
  const radioName = `printer-encoding-${printerName}`;

  return (
    <div className="mt-5" data-testid="printer-encoding">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full min-h-12 -mx-2 px-2 py-1 rounded-lg text-left hover:bg-sq-sidebar/60"
      >
        <span className="block text-[15px] font-semibold text-sq-heading">Кодування кирилиці</span>
        <span className="block text-[15px] text-sq-secondary" data-testid="printer-encoding-summary">
          {encodingTitle(encoding)}
          {isDefault ? ' (за замовчуванням)' : ''} · {open ? 'сховати' : 'змінити'}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-4">
          <p className="text-[15px] text-sq-secondary">
            Якщо на чеку замість літер знаки на кшталт «Σ π ╖», принтер читає текст в іншому кодуванні. Надрукуйте пробний
            аркуш і виберіть варіант, де текст читається.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => void sheet('presets')}
              disabled={printing !== null}
              className="sq-btn-quiet"
            >
              {printing === 'presets' ? 'Друк…' : 'Надрукувати пробний аркуш'}
            </button>
          </div>

          <fieldset>
            <legend className="text-[15px] font-semibold text-sq-heading">Який варіант на аркуші читається правильно?</legend>
            <ul className="mt-1">
              {ENCODING_PRESETS.map((preset) => {
                const on = sameEncoding(encoding, preset.encoding);
                return (
                  <li key={preset.letter} className="sq-row">
                    <label className="flex items-center gap-3 min-h-12 py-2 cursor-pointer">
                      <input
                        type="radio"
                        name={radioName}
                        checked={on}
                        onChange={() => apply({ ...preset.encoding })}
                        className="h-5 w-5 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className={`block text-base text-sq-text ${on ? 'font-semibold' : ''}`}>
                          {preset.letter} · {encodingTitle(preset.encoding)}
                        </span>
                        <span className="block text-[13px] text-sq-muted">{tableInfo(preset.encoding.table).note}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <div>
            <p className="text-[15px] font-semibold text-sq-heading">Жоден варіант не читається</p>
            <p className="text-[15px] text-sq-secondary">
              Деякі принтери мають ту саму таблицю під іншим номером. Надрукуйте всі номери в обраному кодуванні й
              впишіть номер рядка, де текст читається.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[13px] text-sq-muted mb-1">Кодування символів</span>
                <select
                  className="sq-input"
                  value={encoding.table}
                  onChange={(e) => pickTable(e.target.value as PrinterEncodingTable)}
                >
                  {ENCODING_TABLES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[13px] text-sq-muted mb-1">Номер таблиці (ESC t)</span>
                <input
                  className="sq-input"
                  inputMode="numeric"
                  value={escText}
                  placeholder={`${tableInfo(encoding.table).standard} — стандартний`}
                  onChange={(e) => typeEscT(e.target.value)}
                  aria-invalid={escError}
                />
                {escError && <span className="block text-[13px] text-red-600 mt-1">Ціле число від 0 до 255.</span>}
              </label>
            </div>

            <div className="mt-3 flex items-end gap-3 flex-wrap">
              <label className="block">
                <span className="block text-[13px] text-sq-muted mb-1">Номери від</span>
                <input
                  className="sq-input w-24"
                  inputMode="numeric"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="Номери від"
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-sq-muted mb-1">до</span>
                <input
                  className="sq-input w-24"
                  inputMode="numeric"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="Номери до"
                />
              </label>
              <button
                type="button"
                onClick={() => void sheet('sweep')}
                disabled={printing !== null}
                className="sq-btn-quiet"
              >
                {printing === 'sweep' ? 'Друк…' : 'Надрукувати номери'}
              </button>
            </div>
          </div>

          {status && (
            <p className="text-[15px] text-sq-secondary" role="status">
              {status}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
