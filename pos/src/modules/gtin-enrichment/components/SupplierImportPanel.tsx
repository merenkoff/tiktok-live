// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useRef, useState } from 'react';
import { api } from '@pos/platform';
import type { GtinLearnResult } from '@pos/platform';
import { parseDelimited, type DelimitedTable } from '../lib/parseDelimited';
import {
  buildPlan,
  chunk,
  guessMapping,
  type ColumnMapping,
  type ImportPlan,
} from '../lib/importPlan';

const BTN = 'rounded-sq border border-sq-divider bg-sq-surface px-3 py-2 text-sm disabled:opacity-50';
const BTN_PRIMARY = 'sq-btn-primary px-4 py-2 text-sm';
const SELECT = 'mt-1 w-full rounded-sq border border-sq-divider bg-sq-bg px-2 py-2 text-sm text-sq-text';

type Totals = { accepted: number; upserted: number; skipped: GtinLearnResult['skipped'] };

const FIELDS: Array<{ key: keyof ColumnMapping; label: string; required: boolean }> = [
  { key: 'gtin', label: 'Штрихкод', required: true },
  { key: 'name', label: 'Назва', required: true },
  { key: 'brand', label: 'Бренд', required: false },
];

function skipLabel(reason: string): string {
  if (reason === 'blocked') return 'запис очищено власником — спершу розблокуйте';
  if (reason === 'empty_name') return 'порожня назва';
  if (reason === 'bad_source') return 'невідоме джерело';
  if (reason.startsWith('bad_gtin:bad_check_digit')) return 'не сходиться контрольна цифра';
  if (reason.startsWith('bad_gtin:bad_length')) return 'невірна довжина штрихкоду';
  if (reason.startsWith('bad_gtin:')) return 'це не штрихкод';
  return reason;
}

/**
 * Load a supplier price list straight into the shared GTIN cache.
 *
 * For a clothing assortment the public databases are empty — the supplier's own
 * file is the only source that knows the goods. Rows land under the `supplier`
 * source, which outranks every automatic lookup but still yields to a cashier's
 * correction.
 */
export function SupplierImportPanel({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [table, setTable] = useState<DelimitedTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ gtin: -1, name: -1, brand: -1 });
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(buf: ArrayBuffer, header: boolean) {
    const parsed = parseDelimited(buf, { hasHeader: header });
    const guessed = header ? guessMapping(parsed.headers) : { gtin: -1, name: -1, brand: -1 };
    setTable(parsed);
    setMapping(guessed);
    setPlan(buildPlan(parsed, guessed));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setTotals(null);
    setProgress(null);
    try {
      const buf = await file.arrayBuffer();
      setFileName(file.name);
      setBuffer(buf);
      load(buf, hasHeader);
    } catch {
      setError('Не вдалося прочитати файл');
    }
  }

  function remap(next: ColumnMapping) {
    setMapping(next);
    if (table) setPlan(buildPlan(table, next));
  }

  function toggleHeader(next: boolean) {
    setHasHeader(next);
    if (buffer) load(buffer, next);
  }

  function reset() {
    setFileName(null);
    setBuffer(null);
    setTable(null);
    setPlan(null);
    setTotals(null);
    setProgress(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function onImport() {
    if (!plan || plan.items.length === 0) return;
    setError(null);
    setTotals(null);
    const batches = chunk(plan.items);
    const acc: Totals = { accepted: 0, upserted: 0, skipped: [] };
    setProgress({ done: 0, total: batches.length });
    try {
      for (let i = 0; i < batches.length; i++) {
        const res = await api.learnGtinBatch(batches[i]!);
        acc.accepted += res.accepted;
        acc.upserted += res.upserted;
        // The list is for the owner to act on — a few examples beat 4 000 lines.
        acc.skipped = acc.skipped.concat(res.skipped).slice(0, 50);
        setProgress({ done: i + 1, total: batches.length });
      }
      setTotals(acc);
      onImported();
    } catch {
      setError('Імпорт перервано. Уже надіслані рядки збережено — повторіть з тим самим файлом.');
    } finally {
      setProgress(null);
    }
  }

  const ready = mapping.gtin >= 0 && mapping.name >= 0 && (plan?.items.length ?? 0) > 0;
  const busy = progress != null;

  return (
    <section className="bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm">
      <div>
        <p className="sq-section-label">Імпорт прайсу постачальника</p>
        <p className="text-sq-secondary text-sm mt-1">
          CSV або TSV зі зв’язкою «штрихкод → назва». Для одягу це єдине джерело, яке справді
          знає ваш асортимент — у відкритих базах таких товарів немає. Назви з прайсу мають вищий
          пріоритет за автоматичний пошук, але нижчий за ручну правку касира.
        </p>
        <p className="text-xs text-sq-muted mt-1">
          З Excel: «Зберегти як» → CSV. Роздільник і кодування (зокрема windows-1251) визначаються
          самі.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button type="button" className={BTN} onClick={() => inputRef.current?.click()} disabled={busy}>
          Обрати файл
        </button>
        {fileName && <span className="text-sm text-sq-secondary truncate">{fileName}</span>}
        {fileName && (
          <button type="button" className={BTN} onClick={reset} disabled={busy}>
            Скинути
          </button>
        )}
      </div>

      {error && <div className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {table && (
        <div className="space-y-4 border-t border-sq-divider pt-4">
          <label className="flex items-center gap-2 text-sm text-sq-secondary">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={hasHeader}
              onChange={(e) => toggleHeader(e.target.checked)}
              disabled={busy}
            />
            Перший рядок — заголовки
          </label>

          <div className="grid sm:grid-cols-3 gap-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="text-sm text-sq-secondary">
                  {f.label}
                  {f.required ? '' : ' (необов’язково)'}
                </span>
                <select
                  className={SELECT}
                  value={mapping[f.key]}
                  disabled={busy}
                  onChange={(e) => remap({ ...mapping, [f.key]: Number(e.target.value) })}
                >
                  <option value={-1}>— не використовувати —</option>
                  {table.headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {plan && (
            <div className="space-y-2 text-sm">
              <p className="text-sq-text">
                Готово до імпорту: <strong>{plan.items.length}</strong> із {table.rows.length}
                {plan.droppedTotal > 0 && (
                  <span className="text-sq-secondary"> · пропущено {plan.droppedTotal}</span>
                )}
              </p>

              {plan.items.length > 0 && (
                <div className="overflow-x-auto border border-sq-divider rounded-sq">
                  <table className="w-full text-sm">
                    <thead className="bg-sq-bg text-sq-secondary">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Штрихкод</th>
                        <th className="text-left px-3 py-2 font-medium">Назва</th>
                        <th className="text-left px-3 py-2 font-medium">Бренд</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sq-divider">
                      {plan.items.slice(0, 5).map((it, i) => (
                        <tr key={`${it.gtin}-${i}`}>
                          <td className="px-3 py-2 font-mono text-sq-secondary">{it.gtin}</td>
                          <td className="px-3 py-2 text-sq-text">{it.name}</td>
                          <td className="px-3 py-2 text-sq-secondary">{it.brand ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {plan.dropped.length > 0 && (
                <details className="text-sq-secondary">
                  <summary className="cursor-pointer">Чому пропущено</summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {plan.dropped.map((d) => (
                      <li key={d.row}>
                        рядок {d.row} — {d.reason}
                      </li>
                    ))}
                    {plan.droppedTotal > plan.dropped.length && (
                      <li>…та ще {plan.droppedTotal - plan.dropped.length}</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => void onImport()}
              disabled={!ready || busy}
            >
              {busy ? `Імпорт… ${progress.done}/${progress.total}` : 'Імпортувати'}
            </button>
            {(mapping.gtin < 0 || mapping.name < 0) && (
              <span className="text-sm text-sq-secondary">
                Оберіть колонки зі штрихкодом і назвою.
              </span>
            )}
          </div>
        </div>
      )}

      {totals && (
        <div className="border-t border-sq-divider pt-4 space-y-2 text-sm">
          <p className="text-sq-text">
            Прийнято <strong>{totals.accepted}</strong>, оновлено в довіднику{' '}
            <strong>{totals.upserted}</strong>.
          </p>
          {totals.accepted > totals.upserted && (
            <p className="text-sq-secondary text-xs">
              Різниця — рядки, які нічого не змінили: така назва вже стояла, або запис має ручну
              правку, що має вищий пріоритет.
            </p>
          )}
          {totals.skipped.length > 0 && (
            <details className="text-sq-secondary">
              <summary className="cursor-pointer">
                Сервер відхилив {totals.skipped.length} рядків
              </summary>
              <ul className="mt-2 space-y-1 text-xs">
                {totals.skipped.map((sk, i) => (
                  <li key={`${sk.gtin}-${i}`}>
                    <span className="font-mono">{sk.gtin}</span> — {skipLabel(sk.reason)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
