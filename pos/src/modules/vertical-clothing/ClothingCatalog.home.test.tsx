// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The clothing till's home screen (migration 112, TechDocs/POS_CLOTHING.md
// «Головна каси й швидкість фото»): the folders, then the cards the owner put
// there under «На головній»; «Усі товари» is the whole range, a page of cards
// at a time with «Показати ще».

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAuthResponse, makeCatalogItem, makeTag } from '../../test/utils';
import { cashierApi } from '../../offline/cashierApi';
import { useAuthStore } from '../../hooks/useAuth';
import { CATALOG_PAGE, forgetTillHomeForTests } from '../../hooks/useSalesCatalog';
import { ClothingCatalog } from './ClothingCatalog';
import type { CatalogItem } from '../../types';

const all: CatalogItem[] = Array.from({ length: CATALOG_PAGE + 3 }, (_, i) =>
  makeCatalogItem({
    variant_id: i + 1,
    product_id: i + 1,
    product_name: `Боді ${String(i + 1).padStart(3, '0')}`,
    till_home: i < 2,
  })
);

beforeEach(() => {
  forgetTillHomeForTests();
  useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
  vi.spyOn(cashierApi, 'getTags').mockResolvedValue([makeTag({ id: 1, name: 'Хлопчикам', show_in_catalog_bar: false })]);
  vi.spyOn(cashierApi, 'getCatalog').mockImplementation(async (opts) => {
    if (opts?.home) return all.filter((r) => r.till_home);
    if (opts?.limit != null) return all.slice(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit);
    return all;
  });
});

afterEach(() => vi.restoreAllMocks());

describe('ClothingCatalog — home screen', () => {
  it('opens on the folders and the owner cards, and pages the whole range', async () => {
    const user = userEvent.setup();
    render(<ClothingCatalog active stockEpoch={0} />);

    expect(await screen.findByTestId('catalog-home-title')).toHaveTextContent('На головній');
    expect(screen.getByText('Хлопчикам')).toBeInTheDocument();
    expect(screen.getByText('Боді 001')).toBeInTheDocument();
    expect(screen.getByText('Боді 002')).toBeInTheDocument();
    expect(screen.queryByText('Боді 003')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Показати ще' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Усі товари' }));
    await waitFor(() => expect(screen.queryByTestId('catalog-home-title')).toBeNull());
    expect(await screen.findByText('Боді 003')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Показати ще' }));
    expect(await screen.findByText(`Боді ${CATALOG_PAGE + 3}`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Показати ще' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Головна' }));
    expect(await screen.findByTestId('catalog-home-title')).toBeInTheDocument();
  });
});
