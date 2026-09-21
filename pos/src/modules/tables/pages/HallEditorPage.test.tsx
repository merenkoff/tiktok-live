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

beforeEach(() => {
  halls = [{ id: 1, name: 'Зала', sort_order: 0, is_active: true, tables: [table()] }];
  posRequest.mockReset();
  posRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'get' && path === '/halls') return { halls };
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

  it('points a store with no halls at the first step', async () => {
    halls = [];
    renderWithProviders(<HallEditorPage />);
    expect(await screen.findByTestId('editor-empty')).toHaveTextContent('Залів ще немає');
  });
});
