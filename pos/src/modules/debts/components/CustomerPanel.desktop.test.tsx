// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The strip under the customer on the desktop till without a network: the
// mirror's word, what this till wrote down on top, and that it says so.

import 'fake-indexeddb/auto';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    isOfflinePosEnabled: () => true,
    api: {
      posRequest: (...a: unknown[]) => posRequest(...a),
      hasLiveJwt: () => true,
      loadAuth: () => ({ store: { id: 1 } }),
    },
  };
});

const { default: CustomerPanel } = await import('./CustomerPanel');
const { formatUah, useAuthStore, useOfflineStatus } = await import('@pos/platform');
const { resetCreditCache } = await import('../lib/useCredit');
const { db } = await import('../data/db');
const { applyDebtors } = await import('../data/mirror');
const { enqueueIssue } = await import('../data/queue');
const { makeAuthResponse, renderWithProviders } = await import('../../../test/utils');

const uah = (cents: number) => formatUah(cents).replace(/\s/g, ' ');

beforeEach(async () => {
  await db.issues.clear();
  await db.credit.clear();
  await db.meta.clear();
  resetCreditCache();
  posRequest.mockReset();
  useAuthStore.setState({ auth: makeAuthResponse({ staff: { role: 'seller' } }), isAuthenticated: true, bootstrapped: true });
  useOfflineStatus.setState({ online: false });
});

describe('the strip without a network', () => {
  it('reads the mirror, adds what this till wrote down, and says it is the till’s word', async () => {
    await applyDebtors(
      1,
      [{ customer_id: 7, name: 'Оксана', phone: '', balance_cents: 20000, limit_cents: 100000, locked: false, open_lines: 1, oldest_open_at: null }],
      Date.now() - 1000
    );
    await enqueueIssue({
      id: 'k1',
      storeId: 1,
      staff: { id: 1, name: 'Олена' },
      customer: { id: 7, name: 'Оксана' },
      items: [{ variant_id: 10, quantity: 1 }],
      cartDiscount: null,
      note: null,
      totalCents: 6400,
      discountCents: 0,
      lines: [],
    });
    renderWithProviders(<CustomerPanel customerId={7} place="cart" />);

    const strip = await screen.findByTestId('debts-customer-strip');
    expect(strip).toHaveTextContent(`Борг ${uah(26400)} · ще можна ${uah(73600)} · без мережі`);
    expect(posRequest).not.toHaveBeenCalled();
  });

  it('draws nothing for a customer the mirror says has no credit', async () => {
    await applyDebtors(1, [], Date.now() - 1000);
    renderWithProviders(<CustomerPanel customerId={7} place="cart" />);

    // Let the mirror read settle; nothing ever appears.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId('debts-customer-strip')).not.toBeInTheDocument();
  });
});
