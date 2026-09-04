// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PosShellContext, type PosShell } from '../shell';
import type { AuthResponse, CatalogItem, PosTag, SaleDetail, SaleListItem } from '../types';

interface ProvidersOptions {
  route?: string;
  shell?: PosShell;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', shell = 'web', ...options }: ProvidersOptions & Omit<RenderOptions, 'wrapper'> = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PosShellContext.Provider value={shell}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </PosShellContext.Provider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

export function makeAuthResponse(
  overrides: Omit<Partial<AuthResponse>, 'staff' | 'store'> & {
    staff?: Partial<AuthResponse['staff']>;
    store?: Partial<AuthResponse['store']>;
  } = {}
): AuthResponse {
  const { staff, store, ...rest } = overrides;
  return {
    token: 'test-token',
    expires_at: '2099-01-01T00:00:00.000Z',
    staff: { id: 1, display_name: 'Олена', role: 'owner', ...staff },
    store: {
      id: 1,
      name: 'Demo Store',
      slug: 'demo',
      currency: 'UAH',
      auto_print_receipt: false,
      ...store,
    },
    ...rest,
  };
}

export function makeCatalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    variant_id: 1,
    product_id: 1,
    product_name: 'Футболка',
    size: 'M',
    color: 'Синій',
    sku: 'TS-M-BL',
    barcode: '4820000000001',
    price_cents: 45000,
    quantity: 5,
    image_url: null,
    ...overrides,
  };
}

export function makeTag(overrides: Partial<PosTag> = {}): PosTag {
  return {
    id: 1,
    store_id: 1,
    parent_id: null,
    name: 'Одяг',
    sort_order: 0,
    color: null,
    show_in_catalog_bar: true,
    ...overrides,
  };
}

export function makeSaleListItem(overrides: Partial<SaleListItem> = {}): SaleListItem {
  return {
    id: 10,
    receipt_number: 'RC-00010',
    client_uuid: null,
    status: 'completed',
    total_cents: 45000,
    refunded_cents: 0,
    staff_name: 'Олена',
    customer_name: null,
    created_at: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

export function makeSaleDetail(overrides: Partial<SaleDetail> = {}): SaleDetail {
  return {
    id: 10,
    receipt_number: 'RC-00010',
    client_uuid: null,
    status: 'completed',
    subtotal_cents: 45000,
    total_cents: 45000,
    cart_discount_cents: 0,
    refunded_cents: 0,
    staff_name: 'Олена',
    customer_name: null,
    created_at: '2026-01-01T12:00:00.000Z',
    items: [
      {
        id: 100,
        variant_id: 1,
        product_name: 'Футболка',
        variant_label: 'Синій / M',
        quantity: 2,
        unit_price_cents: 22500,
        line_total_cents: 45000,
        refunded_quantity: 0,
      },
    ],
    payments: [{ id: 200, method: 'cash', amount_cents: 45000 }],
    refunds: [],
    ...overrides,
  };
}
