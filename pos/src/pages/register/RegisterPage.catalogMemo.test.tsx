// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The sell screen re-renders on every tap of the cart; the catalog beside it —
// a shop's whole range of tiles — must not (TechDocs/POS_CLOTHING.md «Головна
// каси й швидкість фото»). Its props, `{ active, stockEpoch }`, do not change
// with a line added, so the frame draws it through `memo`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders, makeAuthResponse } from '../../test/utils';
import { useAuthStore } from '../../hooks/useAuth';
import { useCartStore } from '../../hooks/useCart';
import { RegisterPage } from './RegisterPage';
import { remoteModules } from '../../modules/registry';

vi.mock('../../offline/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offline/db')>()),
  getMeta: vi.fn(async () => undefined),
}));
vi.mock('../../offline/kitchenTickets', () => ({
  printKitchenTickets: vi.fn(async () => 'printed'),
}));

let renders = 0;
function CountingCatalog() {
  renders += 1;
  return <p data-testid="counting-catalog">каталог</p>;
}

beforeEach(() => {
  renders = 0;
  remoteModules.push({
    id: 'vertical-flowers',
    title: 'Квіти',
    shells: ['web', 'cashier', 'tablet'],
    alwaysEnabled: true,
    routes: [],
    nav: [],
    sales: { Catalog: CountingCatalog },
  });
  useAuthStore.setState({
    auth: makeAuthResponse({ store: { vertical: { id: 'flowers' } } as never }),
    isAuthenticated: true,
  });
  useCartStore.getState().clear();
});

afterEach(() => {
  remoteModules.length = 0;
  useCartStore.getState().clear();
  useAuthStore.setState({ auth: null, isAuthenticated: false });
});

describe('RegisterPage — the catalog is not redrawn by the cart', () => {
  it('adds three lines without drawing the catalog again', async () => {
    renderWithProviders(<RegisterPage />, { route: '/register' });
    await screen.findByTestId('counting-catalog');
    const before = renders;

    for (const id of [1, 2, 3]) {
      act(() => {
        useCartStore.getState().restore({
          lines: [
            ...useCartStore.getState().lines,
            { uid: String(id), variant_id: id, product_name: `Троянда ${id}`, variant_label: '', unit: 'шт', unit_price_cents: 9500, quantity: 1, max_quantity: 9 },
          ],
          customer: null,
          preorderId: null,
        });
      });
    }

    expect(useCartStore.getState().lines).toHaveLength(3);
    expect(renders).toBe(before);
  });
});
