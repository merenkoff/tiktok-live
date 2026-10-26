// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useRef, useState } from 'react';
import { formatUah } from '@pos/platform';
import { parseDelimited, readFileBytes } from '../../../lib/parseDelimited';
import { downloadCsv, toCsv } from '../../../lib/csv';
import { importTechCards, type TechCardImportResult } from '../data/techCardsApi';
import { tableToRows, TECH_CARD_SAMPLE, type TechCardRowOut } from '../lib/techCardTable';
import { Dialog } from './Dialog';

const pct = (bps: number) => `${(bps / 100).toLocaleString('uk-UA', { maximumFractionDigits: 1 })} %`;

/**
 * «Імпорт з таблиці» on «Техкарти» (TechDocs/POS_ONBOARDING.md, O3): the
 * owner's table of dish → ingredient → quantity → purchase price becomes
 * recipes. The file is read here; every judgement — which dish, which unit,
 * what it costs — is the server's plan, shown before anything is written. The
 * write is all or nothing, so the button is there only for a plan with no
 * error, and every row to fix is named.
 */
export function TechCardsImportDialog({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<TechCardRowOut[] | null>(null);
  const [plan, setPlan] = useState<TechCardImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setFileName(file.name);
    setPlan(null);
    setError(null);
    try {
      const table = parseDelimited(await readFileBytes(file), { keepEmptyRows: true });
      const { rows: read } = tableToRows(table);
      if (read.length === 0) {
        setRows(null);
        setError('У файлі немає рядків з техкартами');
        return;
      }
      setRows(read);
      setBusy(true);
      setPlan(await importTechCards(read, false));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importTechCards(rows, true);
      setPlan(result);
      if (result.applied) onApplied();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const dishErrors = plan?.dishes.filter((d) => d.error) ?? [];
  return (
    <Dialog
      title="Імпорт техкарт з таблиці"
      description="Страва, варіант, складник, кількість (г, мл, шт), ціна закупівлі за кг, л чи шт. Складники, яких немає, створяться поза меню; страви стануть техкартами. Ціни замінить перший прихід."
      onClose={onClose}
      size="lg"
      testId="tech-cards-import"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="text-sm text-sq-blue font-semibold"
            onClick={() => downloadCsv('tekhkarty-zrazok.csv', toCsv(TECH_CARD_SAMPLE))}
          >
            Завантажити зразок
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="sq-btn-quiet">
              {plan?.applied ? 'Готово' : 'Скасувати'}
            </button>
            {plan && !plan.applied && (
              <button
                type="button"
                disabled={busy || !plan.ok}
                onClick={() => void apply()}
                className="sq-btn-primary"
              >
                {busy ? 'Застосовую…' : `Застосувати (${plan.totals.dishes})`}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            aria-label="Файл техкарт"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pick(file);
              e.target.value = '';
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="sq-btn-quiet">
            {fileName ? 'Інший файл' : 'Обрати файл CSV'}
          </button>
          {fileName && <span className="text-sq-secondary">{fileName}{rows ? ` · рядків: ${rows.length}` : ''}</span>}
          {busy && !plan && <span className="text-sq-secondary">Перевіряю…</span>}
        </div>

        {error && <p className="rounded-sq bg-red-50 px-3 py-2 text-red-700">{error}</p>}

        {plan?.applied && (
          <p role="status" className="rounded-sq bg-emerald-50 px-3 py-2 text-emerald-900">
            Готово: техкарт {plan.totals.dishes}, нових складників {plan.totals.ingredients_new}, цін записано{' '}
            {plan.totals.prices_set}.
          </p>
        )}

        {plan && !plan.applied && (
          <p className="text-sq-text" data-testid="tech-cards-import-totals">
            Страв: {plan.totals.dishes} (стануть техкартами: {plan.totals.becomes_derived}, оновляться:{' '}
            {plan.totals.replaced}) · нових складників: {plan.totals.ingredients_new} · цін: {plan.totals.prices_set}
          </p>
        )}

        {plan && (plan.errors.length > 0 || dishErrors.length > 0) && (
          <div className="rounded-sq bg-red-50 px-3 py-2 text-red-800" data-testid="tech-cards-import-errors">
            <p className="font-semibold">Виправте в таблиці й завантажте знову — поки є помилки, нічого не записується:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {plan.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
              {dishErrors.map((d) => (
                <li key={`${d.dish}|${d.variant ?? ''}`}>{d.error}</li>
              ))}
            </ul>
          </div>
        )}

        {plan && plan.warnings.length > 0 && (
          <ul className="space-y-0.5 rounded-sq bg-amber-50 px-3 py-2 text-amber-900">
            {plan.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        {plan && plan.dishes.some((d) => !d.error) && (
          <table className="sq-table">
            <thead>
              <tr>
                <th>Страва</th>
                <th className="text-right">Складників</th>
                <th className="text-right">Собівартість</th>
                <th className="text-right">Ціна</th>
                <th className="text-right">Food cost</th>
              </tr>
            </thead>
            <tbody>
              {plan.dishes
                .filter((d) => !d.error)
                .map((d) => (
                  <tr key={`${d.dish}|${d.variant ?? ''}`}>
                    <td>
                      {d.dish}
                      {d.variant ? <span className="text-sq-secondary"> · {d.variant}</span> : null}
                      {d.becomes === 'replaced' ? <span className="text-sq-secondary"> · оновиться</span> : null}
                    </td>
                    <td className="text-right tabular-nums">{d.components.length}</td>
                    <td className="text-right tabular-nums">{d.cost_cents == null ? '—' : formatUah(d.cost_cents)}</td>
                    <td className="text-right tabular-nums">{d.price_cents == null ? '—' : formatUah(d.price_cents)}</td>
                    <td className="text-right tabular-nums">{d.food_cost_bps == null ? '—' : pct(d.food_cost_bps)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  );
}

function errorText(err: unknown): string {
  const body = (err as { response?: { data?: { error?: string } } })?.response?.data;
  if (body?.error) return body.error;
  return err instanceof Error ? err.message : 'Не вдалося перевірити таблицю';
}
