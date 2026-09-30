// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The floor plan the owner draws: a table is dragged, the layout is written
// once when the finger lets go, and a tap that is not a drag opens the form.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import { CELL_PX } from '../lib/layout';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { HallEditorPage } = await import('./HallEditorPage');

const table = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

let halls: Array<Record<string, unknown>>;
/** What `GET /store/public-menu` answers; `undefined` = a backend that never heard of it. */
let menu: Record<string, unknown> | undefined;

const MENU_URL = 'https://the-live.shop/m/tok_ABCdef123456';
const PRINT = `1790750000.${'C'.repeat(43)}`;
const publishedMenu = { available: true, enabled: true, token: 'tok_ABCdef123456', url: MENU_URL, tables: 1, print: PRINT };

beforeEach(() => {
  halls = [{ id: 1, name: 'Зала', sort_order: 0, is_active: true, tables: [table()] }];
  menu = undefined;
  posRequest.mockReset();
  posRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'get' && path === '/halls') return { halls };
    if (method === 'get' && path === '/store/public-menu') {
      if (!menu) throw { response: { status: 404 } };
      return menu;
    }
    return { ok: true };
  });
});

/** A press, a move past the 6 px threshold, and a release. */
function dragBy(el: HTMLElement, dxPx: number, dyPx: number): void {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: dxPx, clientY: dyPx });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: dxPx, clientY: dyPx });
}

describe('HallEditorPage', () => {
  it('writes the layout once, when the owner lets go', async () => {
    renderWithProviders(<HallEditorPage />);
    const tile = await screen.findByTestId('editor-table-11');
    dragBy(tile, CELL_PX * 2, CELL_PX);
    await waitFor(() => {
      const move = posRequest.mock.calls.find((c) => c[1] === '/tables/positions');
      expect(move?.[2]).toEqual({
        positions: [{ id: 11, pos_x: 2, pos_y: 1, width: 2, height: 2 }],
      });
    });
    // One batch, not one request per pointer-move.
    expect(posRequest.mock.calls.filter((c) => c[1] === '/tables/positions')).toHaveLength(1);
  });

  it('does not open the form on the click that ends a drag', async () => {
    renderWithProviders(<HallEditorPage />);
    const tile = await screen.findByTestId('editor-table-11');
    dragBy(tile, CELL_PX * 2, 0);
    fireEvent.click(tile);
    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('patch', '/tables/positions', expect.anything()));
    expect(screen.queryByTestId('editor-form')).toBeNull();
  });

  it('opens the form on a tap that never became a drag', async () => {
    renderWithProviders(<HallEditorPage />);
    const tile = await screen.findByTestId('editor-table-11');
    // Two pixels: a thumb wobbles, and that is still a tap.
    fireEvent.pointerDown(tile, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 2, clientY: 0 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 2, clientY: 0 });
    fireEvent.click(tile);
    expect(await screen.findByTestId('editor-form')).toBeInTheDocument();
    expect(screen.getByTestId('editor-form-name')).toHaveValue('5');
    expect(posRequest.mock.calls.some((c) => c[1] === '/tables/positions')).toBe(false);
  });

  it('adds a table where the owner can then drag it', async () => {
    renderWithProviders(<HallEditorPage />);
    await userEvent.click(await screen.findByTestId('editor-table-add'));
    await userEvent.type(screen.getByTestId('editor-form-name'), '7');
    await userEvent.click(screen.getByTestId('editor-form-save'));
    await waitFor(() => {
      const created = posRequest.mock.calls.find((c) => c[1] === '/tables');
      expect(created?.[2]).toMatchObject({ hall_id: 1, name: '7', pos_x: 0, pos_y: 0 });
    });
  });

  it('retires a table instead of deleting it', async () => {
    renderWithProviders(<HallEditorPage />);
    const tile = await screen.findByTestId('editor-table-11');
    await userEvent.click(tile);
    await userEvent.click(await screen.findByTestId('editor-form-retire'));
    // What was sold at this table has to stay readable, so the plan loses it
    // and the history does not.
    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith('patch', '/tables/11', { is_active: false })
    );
    expect(posRequest.mock.calls.some((c) => c[0] === 'delete')).toBe(false);
  });

  it('says the server’s words when it refuses', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/halls') return { halls };
      throw { response: { data: { error: 'Стіл «5» вже є' } } };
    });
    renderWithProviders(<HallEditorPage />);
    await userEvent.type(await screen.findByTestId('editor-hall-name'), 'Тераса');
    await userEvent.click(screen.getByTestId('editor-hall-add'));
    expect(await screen.findByTestId('editor-banner')).toHaveTextContent('Стіл «5» вже є');
  });

  describe('the QR of a table (guest menu, Q2)', () => {
    const openTable = async (id = 11) => {
      await userEvent.click(await screen.findByTestId(`editor-table-${id}`));
      return screen.findByTestId('editor-form');
    };

    it('reads the owner’s menu settings through the host client, once', async () => {
      menu = publishedMenu;
      renderWithProviders(<HallEditorPage />);
      await screen.findByTestId('editor-table-11');
      await waitFor(() => expect(posRequest).toHaveBeenCalledWith('get', '/store/public-menu', undefined));
      expect(posRequest.mock.calls.filter((c) => c[1] === '/store/public-menu')).toHaveLength(1);
    });

    it('links the table being edited to the card the server draws for it', async () => {
      menu = publishedMenu;
      renderWithProviders(<HallEditorPage />);
      await openTable();
      const link = await screen.findByTestId('editor-form-qr');
      expect(link).toHaveTextContent('QR цього столу');
      // The id, not the name: the owner can rename a table, the printed QR must not die with it.
      expect(link).toHaveAttribute('href', `${MENU_URL}/qr?t=11&p=${PRINT}`);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('follows the table: another table, another QR', async () => {
      menu = publishedMenu;
      halls = [
        {
          id: 1,
          name: 'Зала',
          sort_order: 0,
          is_active: true,
          tables: [table(), table({ id: 12, name: '6', pos_x: 3 })],
        },
      ];
      renderWithProviders(<HallEditorPage />);
      await openTable(11);
      expect(await screen.findByTestId('editor-form-qr')).toHaveAttribute('href', `${MENU_URL}/qr?t=11&p=${PRINT}`);
      await userEvent.click(screen.getByTestId('editor-table-12'));
      await waitFor(() =>
        expect(screen.getByTestId('editor-form-qr')).toHaveAttribute('href', `${MENU_URL}/qr?t=12&p=${PRINT}`)
      );
    });

    it('links the header to the sheet with a QR for every table', async () => {
      menu = publishedMenu;
      renderWithProviders(<HallEditorPage />);
      const link = await screen.findByTestId('editor-qr-sheet');
      expect(link).toHaveTextContent('QR для всіх столів');
      expect(link).toHaveAttribute('href', `${MENU_URL}/tables?p=${PRINT}`);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('says where to switch the menu on when it is off, and links nothing', async () => {
      menu = { available: true, enabled: false, token: null, url: null, tables: 1 };
      renderWithProviders(<HallEditorPage />);
      await openTable();
      expect(await screen.findByTestId('editor-form-qr-hint')).toHaveTextContent('«Налаштуваннях»');
      expect(screen.queryByTestId('editor-form-qr')).toBeNull();
      expect(screen.queryByTestId('editor-qr-sheet')).toBeNull();
    });

    it('says nothing at all for a store with no guest menu, or a backend older than it', async () => {
      // No kitchen: the feature is not this shop's.
      menu = { available: false, enabled: false, token: null, url: null, tables: 0 };
      const first = renderWithProviders(<HallEditorPage />);
      await openTable();
      await waitFor(() => expect(posRequest).toHaveBeenCalledWith('get', '/store/public-menu', undefined));
      expect(screen.queryByTestId('editor-form-qr')).toBeNull();
      expect(screen.queryByTestId('editor-form-qr-hint')).toBeNull();
      expect(screen.queryByTestId('editor-qr-sheet')).toBeNull();
      first.unmount();

      // A backend that answers 404: the floor plan works exactly as it did.
      menu = undefined;
      renderWithProviders(<HallEditorPage />);
      await openTable();
      expect(screen.queryByTestId('editor-form-qr')).toBeNull();
      expect(screen.queryByTestId('editor-form-qr-hint')).toBeNull();
      expect(screen.queryByTestId('editor-qr-sheet')).toBeNull();
      expect(screen.getByTestId('editor-form-name')).toHaveValue('5');
    });

    it('offers no QR for a table that is not on the plan, nor for one not yet saved', async () => {
      menu = publishedMenu;
      halls = [
        {
          id: 1,
          name: 'Зала',
          sort_order: 0,
          is_active: true,
          tables: [table(), table({ id: 13, name: '9', pos_x: 3, is_active: false })],
        },
      ];
      renderWithProviders(<HallEditorPage />);
      // A retired table: the guest page would ignore its id.
      await openTable(13);
      expect(screen.queryByTestId('editor-form-qr')).toBeNull();
      // A new one has no id yet.
      await userEvent.click(screen.getByTestId('editor-table-add'));
      expect(screen.queryByTestId('editor-form-qr')).toBeNull();
      // …and the live one still has it.
      await userEvent.click(screen.getByTestId('editor-table-11'));
      expect(await screen.findByTestId('editor-form-qr')).toBeInTheDocument();
    });

    it('offers the sheet only when some table is on the plan', async () => {
      menu = publishedMenu;
      halls = [{ id: 1, name: 'Зала', sort_order: 0, is_active: true, tables: [table({ is_active: false })] }];
      renderWithProviders(<HallEditorPage />);
      await screen.findByTestId('editor-table-11');
      await waitFor(() => expect(posRequest).toHaveBeenCalledWith('get', '/store/public-menu', undefined));
      expect(screen.queryByTestId('editor-qr-sheet')).toBeNull();
    });

    it('never lets the QR link get in the way of a drag: it is not on the tile', async () => {
      menu = publishedMenu;
      renderWithProviders(<HallEditorPage />);
      const tile = await screen.findByTestId('editor-table-11');
      expect(tile.querySelector('a')).toBeNull();
    });
  });

  it('points a store with no halls at the first step', async () => {
    halls = [];
    renderWithProviders(<HallEditorPage />);
    expect(await screen.findByTestId('editor-empty')).toHaveTextContent('Залів ще немає');
  });
});
