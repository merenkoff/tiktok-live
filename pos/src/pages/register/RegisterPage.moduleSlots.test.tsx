// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a feature module adds to the till's cart (phase Г2,
// TechDocs/grocery/PLAN.md §4): a way to finish the cart other than paying,
// beside «Оплатити», and a strip about the chosen customer — never on a
// pre-order, and never at the price of the till itself.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, makeAuthResponse } from '../../test/utils';
import { useAuthStore } from '../../hooks/useAuth';
import { useCartStore } from '../../hooks/useCart';
import { RegisterPage } from './RegisterPage';
import { remoteModules } from '../../modules/registry';
import type { CheckoutActionProps, CustomerPanelProps } from '../../modules/types';
import type { PosCustomer } from '../../types';

vi.mock('../../offline/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offline/db')>()),
  getMeta: vi.fn(async () => undefined),
}));
vi.mock('../../offline/kitchenTickets', () => ({
  printKitchenTickets: vi.fn(async () => 'printed'),
}));

const OLHA: PosCustomer = {
  id: 41,
  store_id: 1,
  name: 'Ольга',
  phone: '+380501112233',
  email: null,
  children_birthdays: [],
};

function DebtAction({ lines, customer, totalCents, onCompleted }: CheckoutActionProps) {
  return (
    <button type="button" disabled={!customer} onClick={onCompleted}>
      Під запис · {lines.length} · {totalCents}
    </button>
  );
}

function DebtPanel({ customerId, place }: CustomerPanelProps) {
  return (
    <p>
      Борг покупця {customerId} ({place})
    </p>
  );
}

function installDebts(Action: (props: CheckoutActionProps) => JSX.Element = DebtAction): void {
  remoteModules.push({
    id: 'debts',
    title: 'Під запис',
    shells: ['web', 'cashier', 'tablet'],
    alwaysEnabled: true,
    routes: [],
    nav: [],
    checkout: { Action },
    customer: { Panel: DebtPanel },
  });
}

function signIn(): void {
  useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
}

function fillCart(customer: PosCustomer | null = OLHA, preorderId: number | null = null): void {
  useCartStore.getState().restore({
    lines: [
      { uid: '1', variant_id: 1, product_name: 'Хліб', variant_label: '', unit: 'шт', unit_price_cents: 3200, quantity: 2, max_quantity: 9 },
    ],
    customer,
    preorderId,
  });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  remoteModules.length = 0;
  useCartStore.getState().clear();
  useCartStore.setState({ preorderId: null, customer: null });
  vi.restoreAllMocks();
});

describe('RegisterPage — feature modules in the cart', () => {
  it('draws the module action beside «Оплатити» with the cart it would finish', async () => {
    installDebts();
    signIn();
    fillCart();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    const actions = await screen.findByTestId('module-checkout-actions');
    expect(within(actions).getByRole('button', { name: 'Під запис · 1 · 6400' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: /^Оплатити/ }).length).toBeGreaterThan(0);
  });

  it('empties the cart when the module says it finished it', async () => {
    installDebts();
    signIn();
    fillCart();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    fireEvent.click(await screen.findByRole('button', { name: 'Під запис · 1 · 6400' }));
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it('shows the module strip under the chosen customer, and nothing without one', async () => {
    installDebts();
    signIn();
    fillCart(OLHA);
    const { unmount } = renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByText('Борг покупця 41 (cart)')).toBeInTheDocument();
    unmount();

    useCartStore.getState().clear();
    fillCart(null);
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByTestId('module-checkout-actions')).toBeInTheDocument();
    expect(screen.queryByText(/Борг покупця/)).toBeNull();
  });

  it('draws no module action on a pre-order: a promise is paid or put back', async () => {
    installDebts();
    signIn();
    fillCart(OLHA, 12);
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByTestId('preorder-put-back')).toBeInTheDocument();
    expect(screen.queryByTestId('module-checkout-actions')).toBeNull();
  });

  it('keeps selling when the module action throws', async () => {
    installDebts(() => {
      throw new Error('module bug');
    });
    signIn();
    fillCart();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect((await screen.findAllByRole('button', { name: /^Оплатити/ }))[0]).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Під запис/ })).toBeNull();
  });

  it('adds nothing to the cart of a store without such a module', async () => {
    signIn();
    fillCart();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect((await screen.findAllByRole('button', { name: /^Оплатити/ }))[0]).toBeInTheDocument();
    expect(screen.queryByTestId('module-checkout-actions')).toBeNull();
  });
});
