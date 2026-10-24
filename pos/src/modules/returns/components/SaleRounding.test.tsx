// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A rounded receipt in «Чеки» and «Продажі» (TechDocs/POS_CASH_ROUNDING.md):
// «Разом» stays the goods' value, a line under it says what was due, and a
// cash refund's row says what was handed back — which is also what decides
// whether an act is needed (more than 100 ₴ handed back, not of goods).

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SaleDetail } from '@pos/platform';
import { SaleRoundingLine } from './SaleRounding';
import { RefundRows } from './RefundRows';

describe('SaleRoundingLine', () => {
  it('names the rounding and what was due', () => {
    render(<SaleRoundingLine totalCents={22123} roundingCents={-23} />);
    expect(screen.getByTestId('sale-rounding')).toHaveTextContent(
      'Заокруглення готівки −0,23 ₴ · до сплати 221,00 ₴'
    );
  });

  it('says nothing without a rounding or from an older server', () => {
    const { container, rerender } = render(<SaleRoundingLine totalCents={22123} roundingCents={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SaleRoundingLine totalCents={22123} />);
    expect(container).toBeEmptyDOMElement();
  });
});

function saleWithRefund(refund: Partial<SaleDetail['refunds'][number]>): SaleDetail {
  return {
    refunds: [
      {
        id: 1,
        refund_number: 'П-1',
        total_cents: 10010,
        method: 'cash',
        reason: null,
        reason_code: 'size',
        created_at: '2026-10-23T10:00:00Z',
        ...refund,
      },
    ],
  } as unknown as SaleDetail;
}

describe('RefundRows — a rounded cash refund', () => {
  it('shows what was handed back and asks for no act at 100,00 ₴', () => {
    const onPrintAct = vi.fn();
    render(<RefundRows sale={saleWithRefund({ rounding_cents: -10 })} onPrintAct={onPrintAct} />);
    expect(screen.getByTestId('refund-row-rounding')).toHaveTextContent('заокругл. −0,10 ₴ · видано 100,00 ₴');
    // 100,10 ₴ of goods, 100,00 ₴ handed back: not more than 100 ₴, no act.
    expect(screen.queryByRole('button', { name: /Акт про видачу коштів/ })).not.toBeInTheDocument();
  });

  it('keeps the act where the cash handed back is above 100 ₴', () => {
    render(
      <RefundRows sale={saleWithRefund({ total_cents: 10040, rounding_cents: 10 })} onPrintAct={() => undefined} />
    );
    expect(screen.getByTestId('refund-row-rounding')).toHaveTextContent('видано 100,50 ₴');
    expect(screen.getByRole('button', { name: /Акт про видачу коштів/ })).toBeInTheDocument();
  });

  it('draws no rounding line for an unrounded refund', () => {
    render(<RefundRows sale={saleWithRefund({})} />);
    expect(screen.queryByTestId('refund-row-rounding')).not.toBeInTheDocument();
  });
});
