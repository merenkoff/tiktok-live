// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A «внесок» toward goods taken «під запис» (migration 078) is a sale with no
// goods lines: «Продажі» names it in the list and in place of its lines, and
// offers no refund — it is undone in «Борги».

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { SaleDetail, SaleListItem } from '../../../types';

const listSales = vi.fn();
const getSale = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => ({ id: 'grocery' }),
    api: { listSales: (...a: unknown[]) => listSales(...a), getSale: (...a: unknown[]) => getSale(...a) },
    getMeta: vi.fn().mockResolvedValue(null),
  };
});

const { AdminSalesPage } = await import('./AdminSalesPage');

const item: SaleListItem = {
  id: 56,
  receipt_number: 'R-00056',
  status: 'completed',
  total_cents: 30000,
  refunded_cents: 0,
  staff_name: 'Касирка',
  created_at: '2026-10-25T10:00:00Z',
  fiscal_status: 'none',
  debt_prepayment: true,
};

const detail = {
  id: 56,
  receipt_number: 'R-00056',
  status: 'completed',
  subtotal_cents: 30000,
  total_cents: 30000,
  refunded_cents: 0,
  staff_name: 'Касирка',
  created_at: '2026-10-25T10:00:00Z',
  items: [],
  payments: [{ id: 1, method: 'cash', amount_cents: 30000 }],
  refunds: [],
  fiscal_status: 'none',
  repays_debt: true,
  debt_prepayment: { line_id: 3, product_name: 'Кепка', variant_label: 'L', amount_cents: 30000 },
} as unknown as SaleDetail;

beforeEach(() => {
  listSales.mockReset().mockResolvedValue([item]);
  getSale.mockReset().mockResolvedValue(detail);
});

describe('AdminSalesPage — a «внесок» toward a debt', () => {
  it('says what it is, which goods it went to, and offers no refund', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminSalesPage />);
    expect(await screen.findByText('Внесок за борг')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /R-00056/ }));
    expect(await screen.findByTestId('sale-debt-prepayment')).toHaveTextContent('Внесок за борг: «Кепка · L»');
    expect(screen.queryByRole('button', { name: /Повернення/ })).toBeNull();
  });
});
