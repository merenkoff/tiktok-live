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

  it('invites a rating under the thanks as a link, and never on a refund (F7)', () => {
    const url = 'https://the-live.shop/m/shablya#feedback';
    const { unmount } = render(<ReceiptPrintable receipt={receipt({ feedback_url: url })} />);
    expect(screen.getByText(/Оцініть нас/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', url);
    unmount();
    render(
      <ReceiptPrintable receipt={receipt({ kind: 'refund', refund_of_receipt: 'R-00001', feedback_url: url })} />
    );
    expect(screen.queryByText(/Оцініть нас/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('prints no invitation without an address', () => {
    render(<ReceiptPrintable receipt={receipt()} />);
    expect(screen.queryByText(/Оцініть нас/)).not.toBeInTheDocument();
  });

  it('captions a return receipt «ВИДАТКОВИЙ ЧЕК», as Положення № 13 names it', () => {
    render(
      <ReceiptPrintable
        receipt={receipt({ kind: 'refund', receipt_number: 'RF-00007', refund_of_receipt: 'R-00042' })}
      />
    );
    expect(screen.getByText('ВИДАТКОВИЙ ЧЕК RF-00007')).toBeInTheDocument();
    expect(screen.getByText('до чека R-00042')).toBeInTheDocument();
    expect(screen.getByText('Кошти повернуто')).toBeInTheDocument();
    expect(screen.queryByText(/ЧЕК ПОВЕРНЕННЯ/)).not.toBeInTheDocument();
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

  it('prints «ЗАОКРУГЛЕННЯ» after the VAT line and the rounded «ДО СПЛАТИ» (Положення № 13 розд. II п. 9)', () => {
    const { container } = render(
      <ReceiptPrintable
        receipt={receipt({
          subtotal_cents: 22123,
          total_cents: 22123,
          rounding_cents: -23,
          payments: [{ method: 'cash', amount_cents: 50000 }],
          change_cents: 27900,
          vat_lines: [{ symbol: 'А', rate: 20, amount_cents: 3687 }],
        })}
      />
    );
    const text = container.textContent ?? '';
    expect(screen.getByTestId('receipt-rounding')).toHaveTextContent('ЗАОКРУГЛЕННЯ-0.23');
    expect(text).toContain('ДО СПЛАТИ221.00');
    expect(text.indexOf('ПДВ А 20%')).toBeLessThan(text.indexOf('ЗАОКРУГЛЕННЯ'));
    expect(text.indexOf('ЗАОКРУГЛЕННЯ')).toBeLessThan(text.indexOf('ДО СПЛАТИ'));
    // No discount: «СУМА» already is the sum before rounding.
    expect(text).not.toContain('УСЬОГО');
  });

  it('prints the sum before rounding as «УСЬОГО» when a discount came first', () => {
    const { container } = render(
      <ReceiptPrintable
        receipt={receipt({
          subtotal_cents: 23400,
          discount_cents: 1277,
          total_cents: 22123,
          rounding_cents: -23,
        })}
      />
    );
    expect(container.textContent).toContain('УСЬОГО221.23');
    expect(container.textContent).toContain('ДО СПЛАТИ221.00');
  });

  it('prints no rounding row when nothing was rounded', () => {
    render(<ReceiptPrintable receipt={receipt({ rounding_cents: null })} />);
    expect(screen.queryByTestId('receipt-rounding')).not.toBeInTheDocument();
  });

  it('ignores whitespace-only provider text', () => {
    render(<ReceiptPrintable receipt={receipt({ provider_text: '  \n' })} />);
    expect(screen.getByText('Дякуємо за покупку!')).toBeInTheDocument();
  });
});

describe('ReceiptPrintable — a weighed line (TechDocs/grocery/G4_WEIGHED.md)', () => {
  it('prints the row the payload brought and the hand-typed mark under it', () => {
    render(
      <ReceiptPrintable
        receipt={receipt({
          items: [
            {
              name: 'Сир твердий',
              variant_label: 'Гауда',
              quantity: 350,
              unit_price_cents: 18990,
              line_total_cents: 6647,
              quantity_text: '0.350 кг x 189.90',
              note: 'вагу введено вручну',
            },
          ],
          subtotal_cents: 6647,
          total_cents: 6647,
        })}
      />
    );
    expect(screen.getByText('0.350 кг x 189.90')).toBeInTheDocument();
    expect(screen.queryByText('350 x 189.90')).toBeNull();
    expect(screen.getByText('вагу введено вручну')).toHaveClass('receipt-print-note');
  });
});
