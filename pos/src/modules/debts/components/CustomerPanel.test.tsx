// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The debt under the chosen customer and on the customer's card — and the
// owner's limit there, which is where a customer is given credit at all.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { default: CustomerPanel } = await import('./CustomerPanel');
const { formatUah, useAuthStore } = await import('@pos/platform');
const { resetCreditCache } = await import('../lib/useCredit');
const { makeAuthResponse, renderWithProviders } = await import('../../../test/utils');

let credit: Record<string, unknown>;

// `toHaveTextContent` folds every space, the thousands' narrow one included.
const uah = (cents: number) => formatUah(cents).replace(/\s/g, ' ');

function signIn(role: 'owner' | 'seller') {
  useAuthStore.setState({
    auth: makeAuthResponse({ staff: { role } }),
    isAuthenticated: true,
    bootstrapped: true,
  });
}

beforeEach(() => {
  resetCreditCache();
  signIn('seller');
  credit = {
    customer_id: 7,
    limit_cents: 300000,
    locked: false,
    balance_cents: 124000,
    available_cents: 176000,
    set_at: '2026-10-20T10:00:00Z',
    set_by_name: 'Власник',
  };
  posRequest.mockReset();
  posRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
    if (method === 'get' && path === '/debts/customers/7/balance') return credit;
    if (method === 'patch' && path === '/debts/customers/7/credit') {
      credit = { ...credit, ...('credit_limit_cents' in (body ?? {}) ? { limit_cents: body!.credit_limit_cents } : {}) };
      if (typeof body?.credit_locked === 'boolean') credit = { ...credit, locked: body.credit_locked };
      return credit;
    }
    throw new Error(`unexpected ${method} ${path}`);
  });
});

describe('CustomerPanel in the cart', () => {
  it('says the debt and what is left, linking to the statement', async () => {
    renderWithProviders(<CustomerPanel customerId={7} place="cart" />, { route: '/register' });
    const strip = await screen.findByTestId('debts-customer-strip');
    expect(strip).toHaveTextContent(`Борг ${uah(124000)} · ще можна ${uah(176000)}`);
    expect(strip).toHaveAttribute('href', '/debts/7');
  });

  it('draws nothing for a customer who owes nothing and may not take credit', async () => {
    credit = { ...credit, limit_cents: null, available_cents: null, balance_cents: 0 };
    const { container } = renderWithProviders(<CustomerPanel customerId={7} place="cart" />);
    await waitFor(() => expect(posRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('draws nothing when the debt cannot be read', async () => {
    posRequest.mockImplementation(() => Promise.reject(new Error('network')));
    const { container } = renderWithProviders(<CustomerPanel customerId={7} place="cart" />);
    await waitFor(() => expect(posRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CustomerPanel on the card', () => {
  it('links to the statement in the owner’s cabinet when opened there', async () => {
    signIn('owner');
    renderWithProviders(<CustomerPanel customerId={7} place="card" />, { route: '/admin/customers' });
    const card = await screen.findByTestId('debts-customer-card');
    expect(screen.getByRole('link', { name: 'Виписка' })).toHaveAttribute('href', '/admin/debts/7');
    expect(card).toHaveTextContent(uah(124000));
  });

  it('shows the seller the debt, never the limit editor', async () => {
    renderWithProviders(<CustomerPanel customerId={7} place="card" />);
    await screen.findByTestId('debts-customer-card');
    expect(screen.queryByTestId('debts-limit-editor')).toBeNull();
  });

  it('lets the owner give credit to a customer who has none yet', async () => {
    signIn('owner');
    credit = { ...credit, limit_cents: null, available_cents: null, balance_cents: 0 };
    const user = userEvent.setup();
    renderWithProviders(<CustomerPanel customerId={7} place="card" />);
    expect(await screen.findByTestId('debts-customer-card')).toHaveTextContent('Під запис не дозволено');

    await user.type(screen.getByLabelText('Ліміт під запис, гривень'), '2 000');
    await user.click(screen.getByRole('button', { name: 'Дозволити' }));
    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith('patch', '/debts/customers/7/credit', { credit_limit_cents: 200000 })
    );
    expect(await screen.findByText('Ліміт збережено')).toBeInTheDocument();
  });

  it('refuses a limit outside the server’s bounds without asking it', async () => {
    signIn('owner');
    const user = userEvent.setup();
    renderWithProviders(<CustomerPanel customerId={7} place="card" />);
    const field = await screen.findByLabelText('Ліміт під запис, гривень');
    await user.clear(field);
    await user.type(field, '200000');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(screen.getByText(/Ліміт — від/)).toBeInTheDocument();
    expect(posRequest.mock.calls.some((c) => c[0] === 'patch')).toBe(false);
  });

  it('locks new handovers and takes credit away, each in one tap', async () => {
    signIn('owner');
    const user = userEvent.setup();
    renderWithProviders(<CustomerPanel customerId={7} place="card" />);
    await user.click(await screen.findByRole('button', { name: 'Заблокувати нові записи' }));
    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith('patch', '/debts/customers/7/credit', { credit_locked: true })
    );
    expect(await screen.findByRole('button', { name: 'Розблокувати записи' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Заборонити під запис' }));
    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith('patch', '/debts/customers/7/credit', { credit_limit_cents: null })
    );
  });
});
