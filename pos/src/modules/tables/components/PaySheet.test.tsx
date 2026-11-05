// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The waiter's pay sheet (track ДК, ДК3-Г): cash is taken like at the till —
// «Отримано», the change, the shortfall refused (Д15) — and in a store with a
// second register a part is two receipts, quoted by the server, «порівну»
// gone (Д6) and a card through each terminal in turn (Д14).

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaySheet } from './PaySheet';
import type { Bill, BillLine, BillRound } from '../lib/types';

const line = (over: Partial<BillLine> = {}): BillLine => ({
  id: 1,
  variant_id: 5,
  quantity: 1,
  product_name: 'Борщ',
  variant_label: '',
  unit: 'шт',
  unit_price_cents: 82_000,
  compare_at_unit_cents: null,
  preview_unit_price_cents: null,
  components: null,
  modifiers: [],
  note: '',
  sale_id: null,
  added_by: 1,
  added_by_name: 'Марта',
  sort_order: 0,
  ...over,
});

const round = (items: BillLine[]): BillRound => ({
  id: 7,
  seq: 1,
  fired_at: '2026-11-03T18:00:00.000Z',
  fired_by: 1,
  fired_by_name: 'Марта',
  prep_status: 'served',
  ready_at: null,
  served_at: null,
  cancelled_at: null,
  items,
  total_cents: items.reduce((sum, l) => sum + (l.unit_price_cents ?? 0) * l.quantity, 0),
});

const bill = (items: BillLine[]): Bill => ({
  id: 90,
  bill_no: 12,
  status: 'open',
  table_id: 11,
  table_name: '5',
  hall_id: 1,
  hall_name: 'Зала',
  guests: 2,
  note: null,
  customer_id: null,
  precheck_printed_at: null,
  opened_by: 1,
  opened_by_name: 'Марта',
  opened_at: '2026-11-03T18:00:00.000Z',
  closed_at: null,
  rounds: [round(items)],
  draft: [],
  fired_total_cents: 0,
  draft_preview_cents: 0,
});

describe('PaySheet — cash like the till (Д15)', () => {
  it('takes what the guest handed over and shows the change', () => {
    const onPay = vi.fn();
    render(<PaySheet bill={bill([line()])} onClose={vi.fn()} onPay={onPay} />);
    fireEvent.click(screen.getByTestId('pay-method-cash'));
    expect(screen.getByTestId('pay-received')).toHaveValue('820');

    fireEvent.change(screen.getByTestId('pay-received'), { target: { value: '1000' } });
    expect(screen.getByTestId('pay-change')).toHaveTextContent('Решта180,00 ₴');
    expect(screen.getByTestId('pay-submit')).toHaveTextContent('Прийняти 1 000,00 ₴ · решта 180,00 ₴');
    fireEvent.click(screen.getByTestId('pay-submit'));
    expect(onPay).toHaveBeenCalledWith([{ payments: [{ method: 'cash', amount_cents: 100_000 }] }], 0);
  });

  it('refuses too little money', () => {
    const onPay = vi.fn();
    render(<PaySheet bill={bill([line()])} onClose={vi.fn()} onPay={onPay} />);
    fireEvent.click(screen.getByTestId('pay-method-cash'));
    fireEvent.change(screen.getByTestId('pay-received'), { target: { value: '500' } });
    expect(screen.getByTestId('pay-change')).toHaveTextContent('Не вистачає320,00 ₴');
    expect(screen.getByTestId('pay-submit')).toBeDisabled();
  });

  it('keeps «порівну» as exact shares, with no «Отримано»', () => {
    const onPay = vi.fn();
    render(<PaySheet bill={bill([line()])} onClose={vi.fn()} onPay={onPay} />);
    fireEvent.click(screen.getByTestId('pay-method-cash'));
    fireEvent.click(screen.getByTestId('pay-ways-more'));
    expect(screen.queryByTestId('pay-received')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pay-submit'));
    expect(onPay.mock.calls[0][0][0].payments).toEqual([
      { method: 'cash', amount_cents: 41_000 },
      { method: 'cash', amount_cents: 41_000 },
    ]);
  });
});

describe('PaySheet — two registers (ДК3-Г)', () => {
  const twoReceipts = vi.fn(async () => ({
    receipts: [
      { register_no: 1, label: null, total_cents: 82_000, rounding_cents: 0, due_cents: 82_000 },
      { register_no: 2, label: 'Бар', total_cents: 36_000, rounding_cents: 0, due_cents: 36_000 },
    ],
    due_cents: 118_000,
  }));
  const items = [line(), line({ id: 2, variant_id: 6, product_name: 'Горілка', unit_price_cents: 36_000 })];

  it('offers no «порівну» and walks the card through each terminal, then pays once', async () => {
    const onPay = vi.fn();
    await act(async () => {
      render(<PaySheet bill={bill(items)} onClose={vi.fn()} onPay={onPay} quote={twoReceipts} />);
    });
    expect(screen.queryByTestId('pay-ways')).not.toBeInTheDocument();
    expect(await screen.findByTestId('pay-receipt-2')).toHaveTextContent('Каса 2 · Бар360,00 ₴');
    expect(screen.getByTestId('pay-due')).toHaveTextContent('1 180,00 ₴');

    fireEvent.click(screen.getByTestId('pay-submit'));
    expect(onPay).not.toHaveBeenCalled();
    expect(screen.getByTestId('pay-card-taken')).toHaveTextContent('820,00 ₴ на терміналі «Каса 1»');
    expect(screen.getByTestId('pay-submit')).toHaveTextContent('«Каса 2 · Бар» · 360,00 ₴');
    fireEvent.click(screen.getByTestId('pay-submit'));
    expect(onPay).toHaveBeenCalledWith([{ payments: [{ method: 'card', amount_cents: 118_000 }] }], 0);
  });

  it('takes cash for both receipts at once, with the change', async () => {
    const onPay = vi.fn();
    await act(async () => {
      render(<PaySheet bill={bill(items)} onClose={vi.fn()} onPay={onPay} quote={twoReceipts} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('pay-method-cash'));
    });
    await screen.findByTestId('pay-receipt-2');
    fireEvent.click(screen.getByTestId('pay-quick-200000'));
    expect(screen.getByTestId('pay-change')).toHaveTextContent('Решта820,00 ₴');
    fireEvent.click(screen.getByTestId('pay-submit'));
    expect(onPay).toHaveBeenCalledWith([{ payments: [{ method: 'cash', amount_cents: 200_000 }] }], 0);
  });
});

// ДК5-Г (Д18): a pour whose bottle the bar has not opened cannot be paid —
// the sheet says which, offers the rest, and shows the server's own refusal
// where the waiter can read it (the sheet covers the bill's banner).
describe('PaySheet — a pour waiting for the bar', () => {
  const borshch = line({ id: 1, product_name: 'Борщ', unit_price_cents: 20_000 });
  const shot = line({ id: 2, product_name: 'Горілка 50', unit_price_cents: 9_000, bottle_pending: true });

  it('marks the line, refuses to pay it, and pays the rest once it is taken off', () => {
    const onPay = vi.fn();
    render(<PaySheet bill={bill([borshch, shot])} onClose={() => {}} onPay={onPay} />);
    expect(screen.getByTestId('pay-line-waiting-2')).toHaveTextContent('чекає марку з бару');
    expect(screen.getByTestId('pay-waiting-bar')).toHaveTextContent('«Горілка 50»');
    expect(screen.getByTestId('pay-submit')).toBeDisabled();

    fireEvent.click(screen.getByTestId('pay-line-2'));
    expect(screen.queryByTestId('pay-waiting-bar')).toBeNull();
    fireEvent.click(screen.getByTestId('pay-submit'));
    expect(onPay).toHaveBeenCalledWith([{ line_ids: [1], payments: [{ method: 'card', amount_cents: 20_000 }] }], 0);
  });

  it('shows the server’s refusal on the sheet itself', () => {
    render(
      <PaySheet
        bill={bill([borshch])}
        onClose={() => {}}
        onPay={() => {}}
        error="Бар ще не відсканував марку нової пляшки «Горілка» — оплатити можна, щойно її відкриють"
      />
    );
    expect(screen.getByTestId('pay-error')).toHaveTextContent('Бар ще не відсканував марку');
  });
});
