// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The sell screen's frame renders the catalog its store's vertical supplies —
// and keeps selling when that module is missing or broken.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, makeAuthResponse, makeSaleDetail } from '../../test/utils';
import { cashierApi } from '../../offline/cashierApi';
import { printKitchenTickets } from '../../offline/kitchenTickets';
import { useAuthStore } from '../../hooks/useAuth';
import { useCartStore } from '../../hooks/useCart';
import { RegisterPage } from './RegisterPage';
import { remoteModules } from '../../modules/registry';
import type { SalesCatalogProps } from '../../modules/types';

// The success screen reads the station's printer from Dexie; jsdom has no
// IndexedDB, and an unconfigured printer is exactly the no-print path.
vi.mock('../../offline/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offline/db')>()),
  getMeta: vi.fn(async () => undefined),
}));
// The kitchen ticket goes through the offline mirror and a Tauri command;
// here only the decision to print — once per sale, café only — is under test.
vi.mock('../../offline/kitchenTickets', () => ({
  printKitchenTickets: vi.fn(async () => 'printed'),
}));

function installVertical(Catalog: (props: SalesCatalogProps) => JSX.Element): void {
  remoteModules.push({
    id: 'vertical-flowers',
    title: 'Квіти',
    shells: ['web', 'cashier'],
    alwaysEnabled: true,
    routes: [],
    nav: [],
    sales: { Catalog },
  });
}

function signIn(vertical: 'clothing' | 'flowers' | 'cafe'): void {
  const auth = makeAuthResponse();
  useAuthStore.setState({
    auth: {
      ...auth,
      store: {
        ...auth.store,
        vertical: {
          id: vertical,
          title: vertical === 'flowers' ? 'Квіти' : vertical === 'cafe' ? 'Кафе' : 'Одяг',
          attributes: [],
          units: ['шт'],
          defaultUnit: 'шт',
        },
      },
    },
    isAuthenticated: true,
  });
}

beforeEach(() => {
  // A vertical catalog that throws is a React error boundary catch; React logs
  // it regardless, and the noise buries the assertion.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  remoteModules.length = 0;
  useCartStore.getState().clear();
  vi.restoreAllMocks();
});

describe('RegisterPage as the sell-screen frame', () => {
  it('renders the bundled clothing catalog for a clothing store', async () => {
    signIn('clothing');
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();
  });

  it("renders the store vertical's own catalog when its module is loaded", async () => {
    signIn('flowers');
    installVertical(() => <div>КВІТКОВИЙ КАТАЛОГ</div>);
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByText('КВІТКОВИЙ КАТАЛОГ')).toBeInTheDocument();
  });

  it('falls back to the bundled catalog when the vertical module is not there', async () => {
    // The web shell for a remote that 404s: the module simply does not exist,
    // and the shop still has to be able to sell.
    signIn('flowers');
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();
  });

  it('falls back when the vertical catalog throws while rendering', async () => {
    signIn('flowers');
    installVertical(() => {
      throw new Error('boom');
    });
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await waitFor(() => expect(screen.getByPlaceholderText('Пошук')).toBeInTheDocument());
  });
});

describe('RegisterPage with a café line', () => {
  function ringOatLatte(): void {
    useCartStore.getState().restore({
      lines: [
        {
          uid: '7|12|гарячіше',
          variant_id: 7,
          product_name: 'Латте',
          variant_label: 'M · вівсяне',
          unit: 'шт',
          unit_price_cents: 8000,
          quantity: 1,
          max_quantity: 9,
          modifiers: [{ id: 12, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 }],
          note: 'гарячіше',
        },
      ],
    });
  }

  it('shows the kitchen note under the caption, and the caption already names the answers', async () => {
    signIn('cafe');
    ringOatLatte();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();

    expect(screen.getAllByText('M · вівсяне').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('cart-line-note')[0]).toHaveTextContent('гарячіше');
  });

  it('refuses to park a line with modifiers in the server’s words, without opening the sheet', async () => {
    // Parked carts have no column for them until К3; the server refuses such
    // a line, and dropping the answers on the way would be worse than refusing.
    signIn('cafe');
    ringOatLatte();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId('park-cart')[0]);

    expect(screen.queryByTestId('park-cart-sheet')).toBeNull();
    expect(
      await screen.findByText('Позицію з модифікаторами поки не можна відкласти')
    ).toBeInTheDocument();
  });
});

describe('RegisterPage success screen — the order number (К3d)', () => {
  function ringEspresso(): void {
    useCartStore.getState().restore({
      lines: [
        {
          uid: '3',
          variant_id: 3,
          product_name: 'Еспресо',
          variant_label: '',
          unit: 'шт',
          unit_price_cents: 4500,
          quantity: 1,
          max_quantity: 9,
        },
      ],
    });
  }

  async function payCash(): Promise<void> {
    fireEvent.click(screen.getAllByRole('button', { name: /^Сплатити/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Оплата' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Готівка' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Готово' }));
  }

  it('shows the till’s own «К1» with its caption on a sale queued offline', async () => {
    signIn('cafe');
    ringEspresso();
    vi.spyOn(cashierApi, 'completeSale').mockResolvedValue(
      makeSaleDetail({ order_no: null, local_order_no: 1, receipt_number: 'OFF-ABCD1234' })
    );
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();

    await payCash();
    expect(await screen.findByTestId('order-no')).toHaveTextContent('К1');
    expect(screen.getByTestId('order-no-local')).toHaveTextContent('сервер призначить свій');
    expect(screen.getByText('Чек OFF-ABCD1234')).toBeInTheDocument();
  });

  it('shows the server’s number bare, with no caption, once there is one', async () => {
    signIn('cafe');
    ringEspresso();
    vi.spyOn(cashierApi, 'completeSale').mockResolvedValue(
      makeSaleDetail({ order_no: 42, receipt_number: 'ЧК-000042' })
    );
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();

    await payCash();
    expect(await screen.findByTestId('order-no')).toHaveTextContent('42');
    expect(screen.queryByTestId('order-no-local')).toBeNull();
  });

  it('shows no number of either kind outside a café', async () => {
    signIn('clothing');
    ringEspresso();
    vi.spyOn(cashierApi, 'completeSale').mockResolvedValue(
      makeSaleDetail({ order_no: null, local_order_no: 1, receipt_number: 'OFF-ABCD1234' })
    );
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();

    await payCash();
    expect(await screen.findByText('Чек')).toBeInTheDocument();
    expect(screen.queryByTestId('order-no')).toBeNull();
    expect(screen.getByText('OFF-ABCD1234')).toBeInTheDocument();
  });
});

describe('RegisterPage success screen — the kitchen ticket (К3e)', () => {
  function ringEspresso(): void {
    useCartStore.getState().restore({
      lines: [
        { uid: '3', variant_id: 3, product_name: 'Еспресо', variant_label: '', unit: 'шт', unit_price_cents: 4500, quantity: 1, max_quantity: 9 },
      ],
    });
  }

  async function payCash(): Promise<void> {
    fireEvent.click(screen.getAllByRole('button', { name: /^Сплатити/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Оплата' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Готівка' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Готово' }));
  }

  it('sends a café sale to the kitchen once, the moment it is rung, and offers to print again', async () => {
    signIn('cafe');
    ringEspresso();
    const sold = makeSaleDetail({ order_no: 42, receipt_number: 'ЧК-000042', client_uuid: 'u-42' });
    vi.spyOn(cashierApi, 'completeSale').mockResolvedValue(sold);
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();

    await payCash();
    expect(await screen.findByTestId('kitchen-status')).toHaveTextContent('Тікет надіслано на кухню');
    expect(printKitchenTickets).toHaveBeenCalledTimes(1);
    expect(printKitchenTickets).toHaveBeenCalledWith(expect.objectContaining({ receipt_number: 'ЧК-000042' }));

    fireEvent.click(screen.getByTestId('print-kitchen-ticket'));
    await waitFor(() => expect(printKitchenTickets).toHaveBeenCalledTimes(2));
  });

  it('says nothing and offers nothing on a device with no kitchen printer', async () => {
    signIn('cafe');
    ringEspresso();
    vi.mocked(printKitchenTickets).mockResolvedValueOnce('no-printer');
    vi.spyOn(cashierApi, 'completeSale').mockResolvedValue(makeSaleDetail({ order_no: 42 }));
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();

    await payCash();
    expect(await screen.findByTestId('order-no')).toHaveTextContent('42');
    expect(screen.queryByTestId('kitchen-status')).toBeNull();
    expect(screen.queryByTestId('print-kitchen-ticket')).toBeNull();
  });

  it('never sends a boutique’s sale to a kitchen', async () => {
    signIn('clothing');
    ringEspresso();
    vi.spyOn(cashierApi, 'completeSale').mockResolvedValue(makeSaleDetail({ receipt_number: 'ЧК-000001' }));
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();

    await payCash();
    expect(await screen.findByText('ЧК-000001')).toBeInTheDocument();
    expect(printKitchenTickets).not.toHaveBeenCalled();
  });
});
