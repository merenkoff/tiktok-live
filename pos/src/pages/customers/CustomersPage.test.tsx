// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/customers/CustomersPage.test.tsx
//
// One page, two shells. The personal discount is the owner's to give, so the
// field exists only in the web admin; at the till it is shown and never sent.
// (The server refuses a cashier's change with a 403 either way —
// src/__tests__/pos.routes.customers.test.ts — this is the screen not offering it.)

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PosCustomer } from '../../types';
import { makeCustomer, renderWithProviders } from '../../test/utils';

const listCustomers = vi.fn<[string?], Promise<PosCustomer[]>>();
const createCustomer = vi.fn<[Record<string, unknown>], Promise<PosCustomer>>();
const updateCustomer = vi.fn<[number, Record<string, unknown>], Promise<PosCustomer>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: { deleteCustomer: vi.fn() },
    cashierApi: {
      listCustomers: (q?: string) => listCustomers(q),
      createCustomer: (payload: Record<string, unknown>) => createCustomer(payload),
      updateCustomer: (id: number, payload: Record<string, unknown>) => updateCustomer(id, payload),
    },
  };
});

const { CustomersPage } = await import('./CustomersPage');

const gold = makeCustomer({ id: 1, name: 'Золота Марія', phone: '380671111111', discount_percent: 10 });
const plain = makeCustomer({ id: 2, name: 'Звичайний Іван', phone: '380672222222', discount_percent: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  listCustomers.mockResolvedValue([gold, plain]);
  createCustomer.mockImplementation(async (payload) => makeCustomer({ id: 9, ...(payload as object) }));
  updateCustomer.mockImplementation(async (id, payload) => makeCustomer({ id, ...(payload as object) }));
});

async function openCard(name: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByText(name));
  return user;
}

describe('CustomersPage — the list', () => {
  it('marks a customer who has a discount, and only that one', async () => {
    renderWithProviders(<CustomersPage />);

    expect(await screen.findByText('−10%')).toBeInTheDocument();
    expect(screen.getAllByText(/^−\d+%$/)).toHaveLength(1);
  });

  it('shows the same badge at the till', async () => {
    renderWithProviders(<CustomersPage cashierShell />);

    expect(await screen.findByText('−10%')).toBeInTheDocument();
  });
});

describe('CustomersPage — the owner (web admin)', () => {
  it('shows the discount on the card and saves a changed one', async () => {
    renderWithProviders(<CustomersPage />);
    const user = await openCard('Золота Марія');

    const field = screen.getByLabelText('Знижка клієнта, %');
    expect(field).toHaveValue(10);
    await user.clear(field);
    await user.type(field, '15');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
    expect(updateCustomer.mock.calls[0]![0]).toBe(1);
    expect(updateCustomer.mock.calls[0]![1]).toMatchObject({ name: 'Золота Марія', discount_percent: 15 });
  });

  it('sends 0 for a card whose discount was cleared', async () => {
    renderWithProviders(<CustomersPage />);
    const user = await openCard('Золота Марія');

    await user.clear(screen.getByLabelText('Знижка клієнта, %'));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
    expect(updateCustomer.mock.calls[0]![1]).toMatchObject({ discount_percent: 0 });
  });

  it('opens a new card at 0 and creates it with the discount typed in', async () => {
    renderWithProviders(<CustomersPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Новий клієнт/ }));

    expect(screen.getByLabelText('Знижка клієнта, %')).toHaveValue(0);
    await user.type(screen.getByLabelText(/Ім’я \*/), 'Нова');
    await user.type(screen.getByLabelText(/Телефон \*/), '380673333333');
    await user.clear(screen.getByLabelText('Знижка клієнта, %'));
    await user.type(screen.getByLabelText('Знижка клієнта, %'), '7');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    expect(createCustomer.mock.calls[0]![0]).toMatchObject({ name: 'Нова', discount_percent: 7 });
  });

  it.each(['150', '-3', '2.5'])('will not send %s: the field itself is invalid', async (typed) => {
    renderWithProviders(<CustomersPage />);
    const user = await openCard('Золота Марія');

    const field = screen.getByLabelText('Знижка клієнта, %');
    await user.clear(field);
    await user.type(field, typed);
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    // min/max/step hold it in the browser; the save handler re-checks the same
    // range for anything that gets past (a shell without constraint validation).
    expect(field).toBeInvalid();
    expect(updateCustomer).not.toHaveBeenCalled();
  });
});

describe('CustomersPage — the cashier (till)', () => {
  it('shows the discount as a fact, with no field to change it', async () => {
    renderWithProviders(<CustomersPage cashierShell />);
    await openCard('Золота Марія');

    expect(screen.queryByLabelText('Знижка клієнта, %')).toBeNull();
    expect(screen.getByText(/змінює власник/)).toBeInTheDocument();
  });

  it('says nothing about a discount on a card that has none', async () => {
    renderWithProviders(<CustomersPage cashierShell />);
    await openCard('Звичайний Іван');

    expect(screen.queryByText(/змінює власник/)).toBeNull();
  });

  it('saves a card without touching the discount: the field is not in the payload', async () => {
    renderWithProviders(<CustomersPage cashierShell />);
    const user = await openCard('Золота Марія');

    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
    expect(updateCustomer.mock.calls[0]![1]).not.toHaveProperty('discount_percent');
  });

  it('creates a card without a discount field', async () => {
    renderWithProviders(<CustomersPage cashierShell />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Новий клієнт/ }));
    await user.type(screen.getByLabelText(/Ім’я \*/), 'З каси');
    await user.type(screen.getByLabelText(/Телефон \*/), '380674444444');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    expect(createCustomer.mock.calls[0]![0]).not.toHaveProperty('discount_percent');
  });
});
