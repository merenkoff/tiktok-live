// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The station printers a café configures on this device (К3e) — and that a
// boutique never sees them. Tauri is mocked at the command bridge.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, makeAuthResponse } from '../test/utils';
import { useAuthStore } from '../hooks/useAuth';

vi.mock('../lib/hardware', () => ({ listHardware: vi.fn(async () => []) }));
vi.mock('../lib/updates', () => ({ installUpdate: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('../hooks/useUpdateCheck', () => ({
  useUpdateStore: (selector: (s: { updateInfo: null }) => unknown) => selector({ updateInfo: null }),
}));
vi.mock('../hooks/usePrintableReceipt', () => ({
  usePrintableReceipt: () => ({ printToPdf: vi.fn(), printablePortal: null }),
}));
vi.mock('../offline/db', () => ({
  getMeta: vi.fn(async () => undefined),
  setMeta: vi.fn(async () => undefined),
}));
vi.mock('../lib/printer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/printer')>()),
  listPrinters: vi.fn(async () => [
    { name: 'Kitchen-1', is_default: false },
    { name: 'Bar-1', is_default: true },
  ]),
  printReceipt: vi.fn(async () => undefined),
  printKitchenTicket: vi.fn(async () => undefined),
}));

const { setMeta } = await import('../offline/db');
const { printKitchenTicket } = await import('../lib/printer');
const { HardwarePage } = await import('./HardwarePage');

function signIn(vertical: 'clothing' | 'cafe'): void {
  const auth = makeAuthResponse();
  useAuthStore.setState({
    auth: {
      ...auth,
      store: {
        ...auth.store,
        vertical: { id: vertical, title: vertical === 'cafe' ? 'Кафе' : 'Одяг', attributes: [], units: ['шт'], defaultUnit: 'шт' },
      },
    },
    isAuthenticated: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  useAuthStore.setState({ auth: null, isAuthenticated: false });
});

describe('HardwarePage station printers', () => {
  it('shows a kitchen and a bar printer to a café, next to the receipt printer', async () => {
    signIn('cafe');
    renderWithProviders(<HardwarePage />, { shell: 'cashier' });
    expect(await screen.findByText('Принтер кухні')).toBeInTheDocument();
    expect(screen.getByText('Принтер бару')).toBeInTheDocument();
    expect(screen.getByText('Принтер чеків')).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByTestId('station-printer-kitchen')).getByText('Kitchen-1')).toBeInTheDocument());
  });

  it('shows neither to a boutique', async () => {
    signIn('clothing');
    renderWithProviders(<HardwarePage />, { shell: 'cashier' });
    expect(await screen.findByText('Принтер чеків')).toBeInTheDocument();
    expect(screen.queryByText('Принтер кухні')).toBeNull();
    expect(screen.queryByText('Принтер бару')).toBeNull();
  });

  it('remembers the kitchen printer on this device and prints a test ticket to it', async () => {
    signIn('cafe');
    renderWithProviders(<HardwarePage />, { shell: 'cashier' });
    const kitchen = screen.getByTestId('station-printer-kitchen');
    fireEvent.click(await within(kitchen).findByText('Kitchen-1'));
    expect(setMeta).toHaveBeenCalledWith('kitchenPrinterName', 'Kitchen-1');

    fireEvent.click(within(kitchen).getByRole('button', { name: '80 мм' }));
    expect(setMeta).toHaveBeenCalledWith('kitchenPaperWidthMm', 80);

    fireEvent.click(within(kitchen).getByRole('button', { name: 'Тестовий тікет' }));
    await waitFor(() => expect(printKitchenTicket).toHaveBeenCalledTimes(1));
    expect(printKitchenTicket).toHaveBeenCalledWith(
      'Kitchen-1',
      expect.objectContaining({ station: 'КУХНЯ', order_label: '17' }),
      80
    );
    expect(await within(kitchen).findByText('Надіслано на друк')).toBeInTheDocument();
  });

  it('lets the bar follow the kitchen again by forgetting its own printer', async () => {
    signIn('cafe');
    renderWithProviders(<HardwarePage />, { shell: 'cashier' });
    const bar = screen.getByTestId('station-printer-bar');
    fireEvent.click(await within(bar).findByText('Bar-1'));
    expect(setMeta).toHaveBeenCalledWith('barPrinterName', 'Bar-1');

    fireEvent.click(within(bar).getByRole('button', { name: 'Той самий, що кухня' }));
    expect(setMeta).toHaveBeenCalledWith('barPrinterName', null);
    expect(within(bar).queryByRole('button', { name: 'Тестовий тікет' })).toBeNull();
  });
});
