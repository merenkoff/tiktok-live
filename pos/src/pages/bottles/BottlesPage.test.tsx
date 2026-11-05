// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Пляшки» (ДК5): the table waiting for a stamp comes first, a scan opens the
// bottle, a bottle still open turns the same sheet into «Замінити», and what
// was left in a bottle the count closed is written down.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { BottlesPage } = await import('./BottlesPage');
const { renderWithProviders } = await import('../../test/utils');

const STATE = {
  open: [
    {
      id: 5,
      variant_id: 7,
      product_name: 'Горілка · 500 мл',
      label: 'ANFC015604',
      capacity_ml: 500,
      poured_ml: 350,
      opened_at: new Date().toISOString(),
    },
  ],
  waiting: [{ variant_id: 9, product_name: 'Коньяк', ml: 40, bottle_ml: 500, tables: ['Стіл 3'] }],
  closed: [
    {
      id: 4,
      variant_id: 7,
      product_name: 'Горілка · 500 мл',
      label: 'AICY275034',
      capacity_ml: 500,
      poured_ml: 500,
      opened_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
      close_reason: 'empty',
      discrepancy_ml: null,
      note: null,
    },
  ],
  drinks: [
    { variant_id: 7, product_name: 'Горілка · 500 мл', bottle_ml: 500 },
    { variant_id: 9, product_name: 'Коньяк', bottle_ml: 500 },
    { variant_id: 11, product_name: 'Лікер', bottle_ml: 700 },
  ],
};

beforeEach(() => {
  posRequest.mockReset();
  posRequest.mockImplementation((method: string, path: string) =>
    method === 'get' && path === '/bottles' ? Promise.resolve(STATE) : Promise.reject(new Error(`unexpected ${path}`))
  );
});

describe('BottlesPage', () => {
  it('shows the table waiting for a stamp, what is open and what can be opened', async () => {
    renderWithProviders(<BottlesPage />);
    const waiting = await screen.findByTestId('bottles-waiting-9');
    expect(waiting).toHaveTextContent('Налити ще 40 мл · Стіл 3');
    expect(screen.getByTestId('bottle-5')).toHaveTextContent('залишилось 150 мл з 500 мл');
    // A drink with a bottle open is not offered to open again.
    expect(screen.queryByTestId('bottles-open-7')).toBeNull();
    expect(screen.getByTestId('bottles-open-11')).toBeInTheDocument();
  });

  it('opens the waiting bottle by its scanned stamp', async () => {
    renderWithProviders(<BottlesPage />);
    fireEvent.click(await screen.findByTestId('bottles-scan-9'));
    const sheet = screen.getByTestId('excise-sheet');
    expect(sheet).toHaveTextContent('Нова пляшка: Коньяк');
    posRequest.mockResolvedValueOnce({ ...STATE, waiting: [], bottle_id: 6, replayed: false });
    fireEvent.change(within(sheet).getByTestId('excise-input'), { target: { value: 'aate508932' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Додати' }));
    fireEvent.click(within(sheet).getByTestId('excise-done'));
    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith('post', '/bottles/open', { variant_id: 9, excise_label: 'AATE508932' })
    );
    await waitFor(() => expect(screen.queryByTestId('excise-sheet')).toBeNull());
    expect(screen.queryByTestId('bottles-waiting-9')).toBeNull();
  });

  it('turns the sheet into «Замінити» when a bottle of that drink is still open', async () => {
    renderWithProviders(<BottlesPage />);
    fireEvent.click(await screen.findByTestId('bottles-open-11'));
    const sheet = screen.getByTestId('excise-sheet');
    posRequest.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: 'Попередня пляшка ще відкрита — якщо в ній порожньо, натисніть «Замінити»', code: 'bottle_still_open' },
      },
    });
    fireEvent.change(within(sheet).getByTestId('excise-input'), { target: { value: 'ANFC015605' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Додати' }));
    fireEvent.click(within(sheet).getByTestId('excise-done'));
    await waitFor(() => expect(within(sheet).getByTestId('excise-error')).toHaveTextContent('ще відкрита'));
    expect(within(sheet).getByTestId('excise-done')).toHaveTextContent('Замінити пляшку');

    posRequest.mockResolvedValueOnce({ ...STATE, bottle_id: 8, replayed: false });
    fireEvent.click(within(sheet).getByTestId('excise-done'));
    await waitFor(() =>
      expect(posRequest).toHaveBeenLastCalledWith('post', '/bottles/open', {
        variant_id: 11,
        excise_label: 'ANFC015605',
        replace: true,
      })
    );
  });

  it('writes down what was left in a bottle the count closed as empty', async () => {
    renderWithProviders(<BottlesPage />);
    fireEvent.click(await screen.findByTestId('bottle-leftover-4'));
    posRequest.mockResolvedValueOnce({
      ...STATE,
      closed: [{ ...STATE.closed[0], discrepancy_ml: -30 }],
    });
    fireEvent.change(screen.getByTestId('bottle-leftover-input-4'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Записати' }));
    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('post', '/bottles/4/leftover', { ml: 30 }));
    await waitFor(() => expect(screen.getByTestId('bottle-closed-4')).toHaveTextContent('залишилось 30 мл'));
  });
});
