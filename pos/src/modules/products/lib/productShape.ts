// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { Product, ProductStockMode } from '@pos/platform';

/**
 * `'' | ProductStockMode` rather than a separate kind + mode pair: the two
 * composite modes behave differently enough at the till that the owner should
 * pick one deliberately, and a checkbox plus a switch invites picking neither.
 */
export type ProductShape = '' | ProductStockMode;

export function shapeOf(product: Pick<Product, 'kind' | 'stock_mode'>): ProductShape {
  if (product.kind !== 'composite') return '';
  return product.stock_mode === 'derived' ? 'derived' : 'own';
}

/** Says where the components go, which is the whole difference between the modes. */
export function compositionHint(shape: Exclude<ProductShape, ''>): string {
  return shape === 'derived'
    ? 'Продаж спише складники зі складу.'
    : 'Складники спише документ виробництва — «Склад → Виробництво».';
}

export const SHAPE_OPTIONS: Array<{ value: ProductShape; label: string }> = [
  { value: '', label: 'Звичайний товар' },
  { value: 'derived', label: 'Складений — збирається при продажу' },
  { value: 'own', label: 'Складений — збираємо заздалегідь' },
];
