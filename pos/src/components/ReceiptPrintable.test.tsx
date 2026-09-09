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
    expect(screen.getByText('Фіскальний чек')).toBeInTheDocument();
    expect(screen.getByText('TEST-fKbevQ')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://cabinet.tax.gov.ua/x');
    expect(screen.getByText('Дякуємо за покупку!')).toBeInTheDocument();
  });

  it('shows no fiscal block for a store that does not fiscalise', () => {
    render(<ReceiptPrintable receipt={receipt()} />);
    expect(screen.queryByText('Фіскальний чек')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('ignores whitespace-only provider text', () => {
    render(<ReceiptPrintable receipt={receipt({ provider_text: '  \n' })} />);
    expect(screen.getByText('Дякуємо за покупку!')).toBeInTheDocument();
  });
});
