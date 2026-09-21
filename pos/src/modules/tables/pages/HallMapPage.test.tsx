// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The hall map end to end inside the module: the room draws, a tile says what
// the table is doing, one tap seats it, and «Потрібна мережа» when there is
// none.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';

const posRequest = vi.fn();
const navigate = vi.fn();

const HALLS = [
  {
    id: 1,
    name: 'Зала',
    sort_order: 0,
    is_active: true,
    tables: [
      {
        id: 11,
        hall_id: 1,
        name: '5',
        seats: 4,
        pos_x: 0,
        pos_y: 0,
        width: 2,
        height: 2,
        shape: 'rect',
        is_active: true,
      },
      {
        id: 12,
        hall_id: 1,
        name: '6',
        seats: 2,
        pos_x: 2,
        pos_y: 0,
        width: 2,
        height: 2,
        shape: 'round',
        is_active: true,
      },
    ],
  },
  {
    id: 2,
    name: 'Тераса',
    sort_order: 1,
    is_active: true,
    tables: [
      {
        id: 21,
        hall_id: 2,
        name: 'T1',
        seats: 2,
        pos_x: 0,
        pos_y: 0,
        width: 2,
        height: 2,
        shape: 'rect',
        is_active: true,
      },
    ],
  },
];

let bills: Array<Record<string, unknown>> = [];

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...real, useNavigate: () => navigate };
});

const { HallMapPage } = await import('./HallMapPage');
const { useOfflineStatus } = await import('@pos/platform');

beforeEach(() => {
  navigate.mockReset();
  useOfflineStatus.setState({ online: true });
  bills = [
    {
      id: 90,
      bill_no: 3,
      table_id: 11,
      guests: 2,
      opened_at: new Date(Date.now() - 42 * 60_000).toISOString(),
      opened_by_name: 'Марта',
      precheck_printed_at: null,
      fired_total_cents: 24000,
      draft_count: 1,
      prep_status: 'ready',
    },
  ];
  posRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'get' && path === '/halls') return { halls: HALLS };
    if (method === 'get' && path === '/bills') return { bills };
    if (method === 'post' && path === '/bills') return { bill: { id: 91 } };
    throw new Error(`unexpected ${method} ${path}`);
  });
});

describe('HallMapPage', () => {
  it('draws the room and says what each table is doing', async () => {
    renderWithProviders(<HallMapPage />);
    const seated = await screen.findByTestId('table-tile-11');
    expect(seated).toHaveAttribute('data-tone', 'ready');
    expect(seated).toHaveTextContent('5');
    expect(seated).toHaveTextContent('240');
    expect(seated).toHaveTextContent('42 хв');
    // The dot that says «є ненадіслані позиції».
    expect(screen.getByTestId('table-draft-11')).toBeInTheDocument();

    const free = screen.getByTestId('table-tile-12');
    expect(free).toHaveAttribute('data-tone', 'free');
    expect(free).toHaveTextContent('2 місць');
  });

  it('opens the bill on one tap, whether the table was free or not', async () => {
    renderWithProviders(<HallMapPage />);
    await userEvent.click(await screen.findByTestId('table-tile-12'));
    // The server answers with the bill already there for an occupied table,
    // so the screen never has to ask which the waiter meant.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/tables/91'));
    expect(posRequest).toHaveBeenCalledWith('post', '/bills', { table_id: 12 });
  });

  it('shows the refusal from the server instead of swallowing it', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/halls') return { halls: HALLS };
      if (method === 'get' && path === '/bills') return { bills };
      throw { response: { data: { error: 'Столи не налаштовано' } } };
    });
    renderWithProviders(<HallMapPage />);
    await userEvent.click(await screen.findByTestId('table-tile-12'));
    expect(await screen.findByTestId('tables-banner')).toHaveTextContent('Столи не налаштовано');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('switches halls without re-reading the room', async () => {
    renderWithProviders(<HallMapPage />);
    await screen.findByTestId('table-tile-11');
    await userEvent.click(screen.getByTestId('hall-tab-2'));
    expect(await screen.findByTestId('table-tile-21')).toBeInTheDocument();
    expect(screen.queryByTestId('table-tile-11')).not.toBeInTheDocument();
  });

  it('says so plainly when there is no network', async () => {
    useOfflineStatus.setState({ online: false });
    renderWithProviders(<HallMapPage />);
    expect(await screen.findByTestId('tables-offline')).toHaveTextContent('Потрібна мережа');
    expect(posRequest).not.toHaveBeenCalled();
  });

  it('points the owner at the admin when the room is empty', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/halls') return { halls: [] };
      return { bills: [] };
    });
    renderWithProviders(<HallMapPage />);
    expect(await screen.findByTestId('tables-empty')).toHaveTextContent('Зали ще не створені');
  });
});
