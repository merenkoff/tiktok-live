// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { ReceiptData } from './printer';
import { receiptLines, row, wrapText } from './receiptText';

function receipt(over: Partial<ReceiptData> = {}): ReceiptData {
  return {
    store_name: 'Evelin',
    kind: 'sale',
    receipt_number: 'R-000042',
    refund_of_receipt: null,
    created_at: '12.11.2026, 14:05:00',
    staff_name: 'Олена',
    customer_name: null,
    items: [
      {
        name: 'Сукня',
        variant_label: 'Рожевий · 98-104',
        quantity: 2,
        unit_price_cents: 45000,
        line_total_cents: 90000,
        tax_symbol: 'Б',
      },
    ],
    subtotal_cents: 90000,
    discount_cents: null,
    total_cents: 90000,
    payments: [{ method: 'cash', amount_cents: 100000 }],
    change_cents: 10000,
    ...over,
  };
}

const text = (lines: { text: string }[]) => lines.map((l) => l.text);

describe('wrapText / row', () => {
  it('wraps on words and cuts a word longer than a line', () => {
    expect(wrapText('один два три', 8)).toEqual(['один два', 'три']);
    expect(wrapText('  марка ABCD', 8)).toEqual(['  марка', 'ABCD']);
    expect(wrapText('абвгдежзик', 4)).toEqual(['абвг', 'дежз', 'ик']);
  });

  it('puts the figure flush right on the label’s last line', () => {
    expect(row('СУМА', '900.00', 20)).toEqual(['СУМА          900.00']);
    expect(row('  2 x 1.00', '2.00', 16)).toEqual(['  2 x 1.00  2.00']);
    const long = row('Дуже довга назва податку на рядок', '1.00', 16);
    expect(long.at(-1)!.endsWith('1.00')).toBe(true);
    expect(long.every((l) => l.length <= 16)).toBe(true);
  });
});

describe('receiptLines', () => {
  it('keeps the rows of the paper receipt, in its order', () => {
    const lines = text(receiptLines(receipt(), 32));
    expect(lines[0].trim()).toBe('Evelin');
    expect(lines).toContain('Чек R-000042');
    expect(lines).toContain('Сукня Рожевий · 98-104');
    expect(lines.some((l) => l.startsWith('  2 x 450.00') && l.endsWith('900.00 Б'))).toBe(true);
    const order = ['СУМА', 'ДО СПЛАТИ', 'ГОТІВКА', 'РЕШТА', 'Касир: Олена'].map((label) =>
      lines.findIndex((l) => l.startsWith(label))
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(lines.every((l) => l.length <= 32)).toBe(true);
  });

  it('carries the fiscal block of a registered receipt', () => {
    const lines = text(
      receiptLines(
        receipt({
          fiscal: {
            fiscal_code: '12345678',
            fiscal_date: '12.11.2026 14:05',
            tax_url: 'https://cabinet.tax.gov.ua/cashregs/check?id=12345678',
            register_fiscal_number: '4000123456',
            producer: 'Checkbox',
            mode: 'online',
          },
        }),
        32
      )
    );
    expect(lines.some((l) => l.startsWith('ФІСКАЛЬНИЙ ЧЕК') && l.endsWith('Checkbox'))).toBe(true);
    expect(lines).toContain('ОНЛАЙН');
    expect(lines.some((l) => l.startsWith('ЧЕК №') && l.endsWith('12345678'))).toBe(true);
    expect(lines.some((l) => l.startsWith('ФН ПРРО') && l.endsWith('4000123456'))).toBe(true);
  });

  it('prints the rounding and what was due after it', () => {
    const lines = text(receiptLines(receipt({ total_cents: 90020, subtotal_cents: 90020, rounding_cents: -20 }), 32));
    expect(lines.some((l) => l.startsWith('ЗАОКРУГЛЕННЯ') && l.endsWith('-0.20'))).toBe(true);
    expect(lines.some((l) => l.startsWith('ДО СПЛАТИ') && l.endsWith('900.00'))).toBe(true);
  });

  it('takes the provider’s own text as the receipt', () => {
    const lines = text(receiptLines(receipt({ provider_text: 'ТОВ «Евелін»\r\nЧЕК 1' }), 32));
    expect(lines).toEqual(['ТОВ «Евелін»', 'ЧЕК 1']);
  });
});
