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
const updateState = vi.hoisted(() => ({ info: null as Record<string, unknown> | null }));
vi.mock('../hooks/useUpdateCheck', () => ({
  useUpdateStore: (selector: (s: { updateInfo: Record<string, unknown> | null }) => unknown) =>
    selector({ updateInfo: updateState.info }),
}));
vi.mock('../lib/updateToken', () => ({
  fetchUpdateToken: vi.fn(async () => 'v1.test-token-0123456789abcdef'),
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
  printSlip: vi.fn(async () => undefined),
}));

const { setMeta } = await import('../offline/db');
const { installUpdate } = await import('../lib/updates');
const { fetchUpdateToken } = await import('../lib/updateToken');
const { printKitchenTicket, printSlip } = await import('../lib/printer');
const { remoteModules } = await import('../modules/registry');
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
  remoteModules.length = 0;
  updateState.info = null;
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
    // «Про програму» (2.8.0) sits under «Версія програми» for every vertical.
    expect(screen.getByText('Про програму')).toBeInTheDocument();
    expect(screen.getByText('LiveShop POS')).toBeInTheDocument();
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

  it('remembers the «Чеки столів» printer and prints a test receipt to it (track ДК, Д13)', async () => {
    signIn('cafe');
    renderWithProviders(<HardwarePage />, { shell: 'cashier' });
    const tables = screen.getByTestId('station-printer-table-receipts');
    expect(tables).toHaveTextContent('Чеки столів');
    fireEvent.click(await within(tables).findByText('Kitchen-1'));
    expect(setMeta).toHaveBeenCalledWith('tableReceiptPrinterName', 'Kitchen-1');
    fireEvent.click(within(tables).getByRole('button', { name: 'Тестовий чек' }));
    expect(await within(tables).findByText('Надіслано на друк')).toBeInTheDocument();
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

describe('HardwarePage — a feature module station (Г2)', () => {
  function installDebts(): void {
    remoteModules.push({
      id: 'debts',
      title: 'Під запис',
      shells: ['web', 'cashier', 'tablet'],
      alwaysEnabled: true,
      routes: [],
      nav: [],
      hardware: {
        stations: [{ id: 'slip', title: 'Принтер квитанцій «під запис»', hint: 'Без нього квитанції не друкуються.' }],
      },
    });
  }

  it('draws the module printer for any store that has the module, under the module keys', async () => {
    installDebts();
    signIn('clothing');
    renderWithProviders(<HardwarePage />, { shell: 'cashier' });
    const card = await screen.findByTestId('station-printer-debts-slip');
    expect(within(card).getByText('Принтер квитанцій «під запис»')).toBeInTheDocument();

    fireEvent.click(await within(card).findByText('Kitchen-1'));
    expect(setMeta).toHaveBeenCalledWith('stationPrinter:debts:slip', 'Kitchen-1');

    fireEvent.click(within(card).getByRole('button', { name: 'Тестова квитанція' }));
    await waitFor(() => expect(printSlip).toHaveBeenCalledTimes(1));
    expect(printSlip).toHaveBeenCalledWith(
      'Kitchen-1',
      expect.objectContaining({ title: 'ТЕСТ ДРУКУ', lines: ['Принтер квитанцій «під запис»'] }),
      58
    );
    expect(await within(card).findByText('Надіслано на друк')).toBeInTheDocument();
  });

  it('draws nothing extra for a store without such a module', async () => {
    signIn('clothing');
    renderWithProviders(<HardwarePage />, { shell: 'cashier' });
    expect(await screen.findByText('Принтер чеків')).toBeInTheDocument();
    expect(screen.queryByTestId('station-printer-debts-slip')).toBeNull();
  });
});

// The in-place update (TechDocs/POS_LICENSING.md 2D-B): the press asks the
// deployment's server for its delivery token and hands it to the install command.
describe('HardwarePage in-place update', () => {
  const available = {
    current_version: '2.8.0',
    latest_version: '2.8.1',
    update_available: true,
    download_url: null,
    release_url: 'https://github.com/merenkoff/tiktok-live/releases/tag/pos-v2.8.1',
    notes: null,
    can_self_update: true,
  };

  it('fetches the deployment token at the press and gives it to the install command', async () => {
    updateState.info = available;
    signIn('clothing');
    renderWithProviders(<HardwarePage />, { shell: 'cashier' });
    fireEvent.click(await screen.findByRole('button', { name: /Встановити оновлення/ }));
    await waitFor(() => expect(installUpdate).toHaveBeenCalledWith('v1.test-token-0123456789abcdef'));
    expect(fetchUpdateToken).toHaveBeenCalledTimes(1);
  });

  it('says why in words when the command refuses, and leaves the button usable', async () => {
    updateState.info = available;
    vi.mocked(installUpdate).mockRejectedValueOnce(
      'Сервер оновлень не віддав нову версію: він недоступний або не підтвердив ліцензію цієї копії.'
    );
    signIn('clothing');
    renderWithProviders(<HardwarePage />, { shell: 'cashier' });
    fireEvent.click(await screen.findByRole('button', { name: /Встановити оновлення/ }));
    expect(await screen.findByText(/не підтвердив ліцензію цієї копії/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Встановити оновлення/ })).toBeEnabled();
  });
});
