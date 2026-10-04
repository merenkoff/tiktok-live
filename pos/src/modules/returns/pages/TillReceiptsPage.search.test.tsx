// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Чеки» on the till (clothing R3): the box, the period and a scan all ask
// the shell-aware list — the server online, the mirror offline.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { LocalSaleRow } from '../../../offline/db';

const listSales = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => ({ id: 'clothing' }),
    usePosShell: () => 'cashier',
    cashierApi: { listSales: (...a: unknown[]) => listSales(...a), getSale: vi.fn().mockResolvedValue(null) },
  };
});

const { TillReceiptsPage } = await import('./TillReceiptsPage');

function row(n: number): LocalSaleRow {
  return {
    client_uuid: `u${n}`,
    server_id: n,
    receipt_number: `R-${String(n).padStart(5, '0')}`,
    status: 'completed',
    total_cents: 45000,
    refunded_cents: 0,
    staff_name: 'Касирка',
    customer_name: null,
    created_at: '2026-10-04T10:00:00Z',
    fiscal_status: 'none',
  };
}

const today = new Intl.DateTimeFormat('en-CA').format(new Date());

beforeEach(() => {
  listSales.mockReset();
  listSales.mockResolvedValue([row(1)]);
});

describe('TillReceiptsPage — search', () => {
  it('loads the first page and re-asks with the phrase and the period', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TillReceiptsPage />);
    await screen.findByText('R-00001');
    expect(listSales).toHaveBeenLastCalledWith({ limit: 50, q: undefined, from: undefined });

    await user.type(screen.getByLabelText('Пошук чеків'), '42');
    await waitFor(() => expect(listSales).toHaveBeenLastCalledWith({ limit: 50, q: '42', from: undefined }));

    await user.click(screen.getByRole('button', { name: 'Сьогодні' }));
    await waitFor(() => expect(listSales).toHaveBeenLastCalledWith({ limit: 50, q: '42', from: today }));
  });

  it('takes a scan with nothing focused as the phrase', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TillReceiptsPage />);
    await screen.findByText('R-00001');

    // The wedge is the invisible input that holds the focus.
    await user.keyboard('4820000000028{Enter}');

    await waitFor(() => expect(listSales).toHaveBeenLastCalledWith({ limit: 50, q: '4820000000028', from: undefined }));
    expect(screen.getByLabelText('Пошук чеків')).toHaveValue('4820000000028');
  });

  it('says «Нічого не знайдено» only when something was asked', async () => {
    const user = userEvent.setup();
    listSales.mockResolvedValue([]);
    renderWithProviders(<TillReceiptsPage />);
    expect(await screen.findByText('Поки немає чеків.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Пошук чеків'), 'шарф');
    expect(await screen.findByText('Нічого не знайдено.')).toBeInTheDocument();
  });
});
