// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReceiptPrintable } from './ReceiptPrintable';
import type { ReceiptData } from '../lib/printer';

function receipt(over: Partial<ReceiptData> = {}): ReceiptData {
  return {
    store_name: 'Demo',
    kind: 'sale',
    receipt_number: 'R-00001',
    refund_of_receipt: null,
    created_at: '09.09.2026, 14:59:03',
    staff_name: 'Олена',
    customer_name: null,
    items: [
      { name: 'Футболка', variant_label: 'M', quantity: 1, unit_price_cents: 10000, line_total_cents: 10000 },
    ],
    subtotal_cents: 10000,
    discount_cents: null,
    total_cents: 10000,
    payments: [{ method: 'cash', amount_cents: 10000 }],
    ...over,
  };
}

describe('ReceiptPrintable', () => {
  it('renders the provider text verbatim and nothing of the layout', () => {
    render(<ReceiptPrintable receipt={receipt({ provider_text: '=== ЧЕК ===\nСУМА 100.00' })} />);
    const pre = screen.getByText((_, el) => el?.tagName === 'PRE' && el.textContent === '=== ЧЕК ===\nСУМА 100.00');
    expect(pre).toBeInTheDocument();
    expect(screen.queryByText('Дякуємо за покупку!')).not.toBeInTheDocument();
    expect(screen.queryByText(/Касир/)).not.toBeInTheDocument();
  });

  it('prints the fiscal block with a verification link on the local layout', () => {
    render(
      <ReceiptPrintable
        receipt={receipt({
          fiscal: {
            fiscal_code: 'TEST-fKbevQ',
            fiscal_date: '09.09.2026, 14:59:03',
            tax_url: 'https://cabinet.tax.gov.ua/x',
          },
        })}
      />
    );
    expect(screen.getByText('ФІСКАЛЬНИЙ ЧЕК')).toBeInTheDocument();
    expect(screen.getByText('TEST-fKbevQ')).toBeInTheDocument();
    // Рядок 31 is printed on an online receipt too.
    expect(screen.getByText('ОНЛАЙН')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://cabinet.tax.gov.ua/x');
    expect(screen.getByText('Дякуємо за покупку!')).toBeInTheDocument();
  });

  it('shows no fiscal block for a store that does not fiscalise', () => {
    render(<ReceiptPrintable receipt={receipt()} />);
    expect(screen.queryByText('ФІСКАЛЬНИЙ ЧЕК')).not.toBeInTheDocument();
    expect(screen.queryByText('ОНЛАЙН')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('prints the requisites header, rate letters, VAT and change (Положення № 13)', () => {
    render(
      <ReceiptPrintable
        receipt={receipt({
          header: {
            org_name: 'ТОВ «Тест»',
            point_name: 'Магазин №1',
            address: 'м. Київ, вул. Хрещатик, 1',
            tax_id_line: 'ПН 123456789012',
          },
          items: [
            {
              name: 'Футболка',
              variant_label: 'M',
              quantity: 1,
              unit_price_cents: 10000,
              line_total_cents: 10000,
              tax_symbol: 'А',
            },
          ],
          vat_lines: [{ symbol: 'А', rate: 20, amount_cents: 1667 }],
          payments: [{ method: 'cash', amount_cents: 15000 }],
          change_cents: 5000,
        })}
      />
    );
    expect(screen.getByText('ТОВ «Тест»')).toBeInTheDocument();
    expect(screen.getByText('ПН 123456789012')).toBeInTheDocument();
    expect(screen.getByText('100.00 А')).toBeInTheDocument();
    expect(screen.getByText('ПДВ А 20%')).toBeInTheDocument();
    expect(screen.getByText('16.67')).toBeInTheDocument();
    expect(screen.getByText('ГОТІВКА')).toBeInTheDocument();
    expect(screen.getByText('РЕШТА')).toBeInTheDocument();
    expect(screen.getByText('50.00')).toBeInTheDocument();
    expect(screen.getByText('ДО СПЛАТИ')).toBeInTheDocument();
  });

  it('marks an offline receipt and prints the register number and producer', () => {
    render(
      <ReceiptPrintable
        receipt={receipt({
          fiscal: {
            fiscal_code: 'OFF-0002',
            fiscal_date: null,
            tax_url: null,
            mode: 'offline',
            control_number: '9933',
            register_fiscal_number: '4001118166',
            producer: 'ПРРО Checkbox',
          },
        })}
      />
    );
    expect(screen.getByText('ОФЛАЙН')).toBeInTheDocument();
    expect(screen.queryByText('ОНЛАЙН')).not.toBeInTheDocument();
    expect(screen.getByText('9933')).toBeInTheDocument();
    expect(screen.getByText('4001118166')).toBeInTheDocument();
    expect(screen.getByText('ПРРО Checkbox')).toBeInTheDocument();
    expect(screen.getByText('QR буде після синхронізації з ПРРО')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('labels card and QR payments as cashless', () => {
    render(
      <ReceiptPrintable
        receipt={receipt({
          payments: [
            { method: 'card', amount_cents: 5000 },
            { method: 'qr', amount_cents: 5000 },
          ],
        })}
      />
    );
    expect(screen.getByText('БЕЗГОТІВКОВА (картка)')).toBeInTheDocument();
    expect(screen.getByText('БЕЗГОТІВКОВА (QR)')).toBeInTheDocument();
  });

  it('ignores whitespace-only provider text', () => {
    render(<ReceiptPrintable receipt={receipt({ provider_text: '  \n' })} />);
    expect(screen.getByText('Дякуємо за покупку!')).toBeInTheDocument();
  });
});
