// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The «ПІД ЗАПИС» slip: what it says, that it never says what only a fiscal
// receipt may, and that it prints only where the till named a printer.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const printSlip = vi.fn();
const resolveModuleStationPrinter = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    printSlip: (...a: unknown[]) => printSlip(...a),
    resolveModuleStationPrinter: (...a: unknown[]) => resolveModuleStationPrinter(...a),
  };
});

const { buildIssueSlip, printIssueSlip, slipLinesFromServer } = await import('./slip');

const base = {
  storeName: 'Крамниця «Колосок»',
  customer: { name: 'Оксана', phone: '+380671234567' },
  staffName: 'Олена',
  at: new Date('2026-10-24T09:15:00.000Z'),
  lines: [{ title: 'Хліб · 500 г', quantity: 2, unit: 'шт', unitPriceCents: 3200, totalCents: 6400 }],
  discountCents: 0,
  totalCents: 6400,
  balanceAfterCents: 26400,
  note: 'до зарплати',
};

// The words `print_slip` refuses (src-tauri/src/hardware/slip.rs).
const TITLE_FORBIDDEN = ['ЧЕК', 'ФІСКАЛЬН'];
const TOTAL_FORBIDDEN = ['ДО СПЛАТИ', 'ПДВ', 'РЕШТА', 'ФІСКАЛЬН'];

beforeEach(() => {
  printSlip.mockReset();
  resolveModuleStationPrinter.mockReset();
});

describe('buildIssueSlip', () => {
  it('names who took what, under which journal entry, and the debt after', () => {
    const slip = buildIssueSlip({ ...base, entryId: 41 });
    expect(slip.title).toBe('ПІД ЗАПИС');
    expect(slip.store_name).toBe('Крамниця «Колосок»');
    expect(slip.lines).toEqual(
      expect.arrayContaining(['Покупець: Оксана', 'Телефон: +380671234567', 'Касир: Олена', 'Запис № 41', 'Примітка: до зарплати'])
    );
    expect(slip.items).toEqual([{ name: 'Хліб · 500 г', quantity: '2 шт', unit_price_cents: 3200, line_total_cents: 6400 }]);
    expect(slip.totals).toEqual([
      { label: 'Під запис', amount_cents: 6400 },
      { label: 'Борг після', amount_cents: 26400 },
    ]);
    expect(slip.footer?.[0]).toContain('Фіскальний чек');
  });

  it('says a handover written down offline is the till’s, and the debt after is the till’s reckoning', () => {
    const slip = buildIssueSlip({ ...base, entryId: null, discountCents: 640, totalCents: 5760, balanceAfterCents: 25760 });
    expect(slip.lines).toContain('Записано на касі без мережі');
    expect(slip.lines?.some((line) => line.startsWith('Запис №'))).toBe(false);
    expect(slip.totals).toEqual([
      { label: 'Знижка', amount_cents: 640 },
      { label: 'Під запис', amount_cents: 5760 },
      { label: 'Борг після, за даними каси', amount_cents: 25760 },
    ]);
  });

  it('leaves out what it does not know', () => {
    const slip = buildIssueSlip({ ...base, entryId: 1, customer: { name: 'Оксана' }, note: null, balanceAfterCents: null });
    expect(slip.lines?.some((line) => line.startsWith('Телефон') || line.startsWith('Примітка'))).toBe(false);
    expect(slip.totals).toEqual([{ label: 'Під запис', amount_cents: 6400 }]);
  });

  it('never words itself like a fiscal receipt — the Rust side would refuse it', () => {
    for (const slip of [
      buildIssueSlip({ ...base, entryId: 1 }),
      buildIssueSlip({ ...base, entryId: null, discountCents: 100 }),
    ]) {
      const title = slip.title.toUpperCase();
      expect(TITLE_FORBIDDEN.some((word) => title.includes(word))).toBe(false);
      for (const total of slip.totals ?? []) {
        expect(TOTAL_FORBIDDEN.some((word) => total.label.toUpperCase().includes(word))).toBe(false);
      }
    }
  });

  it('takes the server’s lines at their locked totals, the cart discount already inside', () => {
    const lines = slipLinesFromServer([
      { product_name: 'Хліб', variant_label: '500 г', quantity: 2, unit: 'шт', unit_price_cents: 3200, line_total_cents: 5760 } as never,
    ]);
    expect(lines).toEqual([{ title: 'Хліб · 500 г', quantity: 2, unit: 'шт', unitPriceCents: 3200, totalCents: 5760 }]);
  });
});

describe('printIssueSlip', () => {
  const slip = () => buildIssueSlip({ ...base, entryId: 1 });

  it('prints nothing, and says nothing, where the till named no printer for the station', async () => {
    resolveModuleStationPrinter.mockResolvedValue(null);
    expect(await printIssueSlip(slip())).toEqual({ kind: 'none' });
    expect(printSlip).not.toHaveBeenCalled();
    expect(resolveModuleStationPrinter).toHaveBeenCalledWith(expect.any(Function), 'debts', 'slips');
  });

  it('prints to the station’s printer at its paper width', async () => {
    resolveModuleStationPrinter.mockResolvedValue({ name: 'XP-58', paperWidth: 58 });
    expect(await printIssueSlip(slip())).toEqual({ kind: 'printed', printer: 'XP-58' });
    expect(printSlip).toHaveBeenCalledWith('XP-58', expect.objectContaining({ title: 'ПІД ЗАПИС' }), 58);
  });

  it('reports a jammed printer instead of throwing — the handover already happened', async () => {
    resolveModuleStationPrinter.mockResolvedValue({ name: 'XP-58', paperWidth: 80 });
    printSlip.mockRejectedValue(new Error('Принтер не відповідає'));
    expect(await printIssueSlip(slip())).toEqual({ kind: 'failed', printer: 'XP-58', error: 'Принтер не відповідає' });
  });
});
