// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Articles in the size × colour matrix. A garment's card is made here, so this
// is where the owner needs «the next number» — and the index is unique per
// store, so the matrix gives every row its own, counted on from the first.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkuSeries } from '@pos/platform';
import type { MatrixResult } from './VariantMatrix';

const skuSeries = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { skuSeries: (...a: unknown[]) => skuSeries(...a) } };
});

const { VariantMatrix } = await import('./VariantMatrix');

function series(over: Partial<SkuSeries> = {}): SkuSeries {
  return { prefix: '', width: 4, last: '0042', next: '0043', count: 210, inTag: 0, samples: ['Сукня'], ...over };
}

let last: MatrixResult | null = null;
const onChange = vi.fn((r: MatrixResult) => {
  last = r;
});

function setup(props: Partial<React.ComponentProps<typeof VariantMatrix>> = {}) {
  const user = userEvent.setup();
  render(<VariantMatrix unit="шт" vocabulary={[]} autoBarcode onChange={onChange} {...props} />);
  return { user };
}

const sizeChips = () => within(screen.getByRole('group', { name: 'Розміри' }));
const first = () => screen.getByLabelText('Артикул першого варіанта');
const skus = () => last!.variants.map((v) => v.sku);

/** One colour in three sizes at one price: three rows, 80 / 86 / 92. */
async function threeRows(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Новий колір'), 'беж{Enter}');
  for (const size of ['80', '86', '92']) await user.click(sizeChips().getByRole('button', { name: size }));
  await user.type(screen.getByPlaceholderText('Ціна, грн'), '400');
}

beforeEach(() => {
  last = null;
  onChange.mockClear();
  skuSeries.mockReset();
  try {
    window.localStorage.clear();
  } catch {
    /* storage unavailable in this run */
  }
});

describe('VariantMatrix — articles', () => {
  it('sends no article when the field is left empty, as before', async () => {
    const { user } = setup();
    await threeRows(user);

    expect(last!.problem).toBeNull();
    expect(last!.variants.every((v) => !('sku' in v))).toBe(true);
  });

  it('counts every row on from the first article, and shows each row its number', async () => {
    const { user } = setup();
    await threeRows(user);
    await user.type(first(), '0043');

    expect(skus()).toEqual(['0043', '0044', '0045']);
    expect(screen.getByLabelText('Артикул: беж / 92')).toHaveAttribute('placeholder', '0045');
  });

  it('puts the next number of the shop\'s one series into the field with «Наступний»', async () => {
    skuSeries.mockResolvedValue([series()]);
    const { user } = setup({ tagIds: [7, 9] });
    await threeRows(user);
    await user.click(screen.getByRole('button', { name: 'Наступний' }));

    expect(skuSeries).toHaveBeenCalledWith([7, 9]);
    expect(first()).toHaveValue('0043');
    expect(skus()).toEqual(['0043', '0044', '0045']);
  });

  it('lists the series when the shop has several, and numbers from the one picked', async () => {
    skuSeries.mockResolvedValue([
      series(),
      series({ prefix: 'т', width: 3, last: 'т014', next: 'т015', count: 128, samples: ['Боді'] }),
    ]);
    const { user } = setup();
    await threeRows(user);
    await user.click(screen.getByRole('button', { name: 'Наступний' }));

    // Nothing is picked for the owner: which series is the question.
    expect(first()).toHaveValue('');
    await user.click(within(screen.getByRole('group', { name: 'Серії артикулів' })).getByText('т015'));

    expect(skus()).toEqual(['т015', 'т016', 'т017']);
  });

  it('keeps an article typed into a row and leaves no gap in the others', async () => {
    const { user } = setup();
    await threeRows(user);
    await user.type(first(), '0043');
    await user.type(screen.getByLabelText('Артикул: беж / 86'), 'літо-1');

    expect(skus()).toEqual(['0043', 'літо-1', '0044']);
  });

  it('does not spend a number on a row that was struck out', async () => {
    const { user } = setup();
    await threeRows(user);
    await user.type(first(), '0043');
    await user.click(screen.getByRole('button', { name: 'Не створювати: беж / 80' }));

    expect(skus()).toEqual(['0043', '0044']);
    expect(screen.getByLabelText('Артикул: беж / 80')).toHaveAttribute('placeholder', 'артикул');
  });

  it('does not number the sizes the card already has', async () => {
    const { user } = setup({ existing: [{ attributes: { color: 'беж', size: '80' } }] });
    await threeRows(user);
    await user.type(first(), 'т015');

    expect(last!.variants.map((v) => [v.attributes.size, v.sku])).toEqual([
      ['86', 'т015'],
      ['92', 'т016'],
    ]);
  });

  it('refuses the same article in two rows, in words, and sends nothing', async () => {
    const { user } = setup();
    await threeRows(user);
    await user.type(screen.getByLabelText('Артикул: беж / 80'), 'т1');
    await user.type(screen.getByLabelText('Артикул: беж / 92'), 'т1');

    expect(last!.problem).toBe('Артикул «т1» повторюється — у кожного варіанта має бути свій');
    expect(last!.variants).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('Артикул «т1» повторюється');
  });

  it('says a first article with no number in it cannot be counted on from', async () => {
    const { user } = setup();
    await threeRows(user);
    await user.type(first(), 'літо');

    expect(last!.problem).toMatch(/^Артикул має закінчуватися числом/);
    expect(last!.variants).toEqual([]);
  });

  it('asks for the price first: a missing price is not hidden behind an article', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Новий колір'), 'беж{Enter}');
    await user.click(sizeChips().getByRole('button', { name: '80' }));
    await user.click(sizeChips().getByRole('button', { name: '86' }));
    await user.type(first(), 'літо');

    expect(last!.problem).toBe('Вкажіть ціну: загальну або в кожному рядку');
  });

  it('clears the first article with everything else on reset', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<VariantMatrix unit="шт" vocabulary={[]} autoBarcode onChange={onChange} resetKey={0} />);
    await user.type(first(), '0043');
    rerender(<VariantMatrix unit="шт" vocabulary={[]} autoBarcode onChange={onChange} resetKey={1} />);

    expect(first()).toHaveValue('');
  });
});
