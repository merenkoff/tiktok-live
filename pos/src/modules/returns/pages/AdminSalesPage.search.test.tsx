// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Продажі» (clothing R3): the box and the two days are sent to the server,
// which does the matching; «Показати ще» asks for the next page of the same
// question.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { SaleListItem } from '../../../types';

const listSales = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => ({ id: 'clothing' }),
    api: { listSales: (...a: unknown[]) => listSales(...a), getSale: vi.fn() },
  };
});

const { AdminSalesPage } = await import('./AdminSalesPage');

function sale(id: number, receipt_number: string): SaleListItem {
  return {
    id,
    receipt_number,
    status: 'completed',
    total_cents: 100000,
    refunded_cents: 0,
    staff_name: 'Касирка',
    created_at: '2026-10-04T10:00:00Z',
    fiscal_status: 'none',
  } as SaleListItem;
}

const many = (n: number, start = 1) => Array.from({ length: n }, (_, i) => sale(start + i, `R-${String(start + i).padStart(5, '0')}`));

beforeEach(() => {
  listSales.mockReset();
  listSales.mockResolvedValue([sale(1, 'R-00001')]);
});

describe('AdminSalesPage — search', () => {
  it('asks the server for the first page, then for the phrase once it stops changing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminSalesPage />);
    await screen.findByText('R-00001');
    expect(listSales).toHaveBeenLastCalledWith({ limit: 100, q: undefined, from: undefined, to: undefined });

    listSales.mockResolvedValue([sale(7, 'R-00007')]);
    await user.type(screen.getByLabelText('Пошук продажів'), 'кепка');

    await waitFor(() => expect(listSales).toHaveBeenLastCalledWith({ limit: 100, q: 'кепка', from: undefined, to: undefined }));
    expect(await screen.findByText('R-00007')).toBeInTheDocument();
    // One request for the phrase, not one per letter.
    expect(listSales.mock.calls.filter((c) => c[0]?.q).length).toBe(1);
  });

  it('sends the two days and says so when nothing comes back', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminSalesPage />);
    await screen.findByText('R-00001');

    listSales.mockResolvedValue([]);
    await user.type(screen.getByLabelText('З дати'), '2026-10-01');
    await user.type(screen.getByLabelText('По дату'), '2026-10-03');

    await waitFor(() =>
      expect(listSales).toHaveBeenLastCalledWith({ limit: 100, q: undefined, from: '2026-10-01', to: '2026-10-03' })
    );
    expect(await screen.findByText('Нічого не знайдено.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Скинути' }));
    await waitFor(() => expect(listSales).toHaveBeenLastCalledWith({ limit: 100, q: undefined, from: undefined, to: undefined }));
  });

  it('pages with «Показати ще» on the same question', async () => {
    const user = userEvent.setup();
    listSales.mockResolvedValueOnce(many(100));
    renderWithProviders(<AdminSalesPage />);
    await screen.findByText('R-00100');

    listSales.mockResolvedValueOnce(many(3, 101));
    await user.click(screen.getByRole('button', { name: 'Показати ще' }));

    await waitFor(() => expect(listSales).toHaveBeenLastCalledWith({ limit: 100, offset: 100, q: undefined, from: undefined, to: undefined }));
    expect(await screen.findByText('R-00103')).toBeInTheDocument();
    expect(screen.getByText('R-00001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Показати ще' })).toBeNull();
  });
});
