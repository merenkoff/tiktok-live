// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The article field. The point of the whole component is
// the question «а в якій серії цей товар?»: with more than one series it never
// picks for the owner, it shows every series with what it is used for, and the
// one this card's category already uses leads.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkuSeries } from '@pos/platform';

const skuSeries = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { skuSeries: (...a: unknown[]) => skuSeries(...a) } };
});

const { SkuField } = await import('./SkuField');

function series(over: Partial<SkuSeries> = {}): SkuSeries {
  return {
    prefix: '',
    width: 4,
    last: '0042',
    next: '0043',
    count: 210,
    inTag: 0,
    samples: ['Сукня', 'Джинси'],
    ...over,
  };
}

const T_SERIES = series({
  prefix: 'т',
  width: 3,
  last: 'т014',
  next: 'т015',
  count: 128,
  samples: ['Футболка', 'Боді'],
});

beforeEach(() => {
  skuSeries.mockReset();
});

describe('SkuField', () => {
  it('fills the field straight away when the shop numbers one way', async () => {
    skuSeries.mockResolvedValue([series()]);
    const onPick = vi.fn();
    render(<SkuField value="" onChange={onPick} tagIds={[]} caption="Артикул" captionClass="" />);

    await userEvent.click(screen.getByRole('button', { name: 'Наступний' }));

    await waitFor(() => expect(onPick).toHaveBeenCalledWith('0043'));
    // Nothing to choose between, so no list is put in the way.
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('never picks for the owner when the shop runs several series', async () => {
    skuSeries.mockResolvedValue([series(), T_SERIES]);
    const onPick = vi.fn();
    render(<SkuField value="" onChange={onPick} tagIds={[]} caption="Артикул" captionClass="" />);

    await userEvent.click(screen.getByRole('button', { name: 'Наступний' }));

    const list = await screen.findByRole('group', { name: 'Серії артикулів' });
    expect(onPick).not.toHaveBeenCalled();
    // Both series visible — this is the whole answer to "which one was it?".
    expect(list).toHaveTextContent('0043');
    expect(list).toHaveTextContent('т015');
  });

  it('says what each series is used for, so it is recognised and not recalled', async () => {
    skuSeries.mockResolvedValue([series(), T_SERIES]);
    render(<SkuField value="" onChange={vi.fn()} tagIds={[]} caption="Артикул" captionClass="" />);

    await userEvent.click(screen.getByRole('button', { name: 'Наступний' }));

    const list = await screen.findByRole('group', { name: 'Серії артикулів' });
    expect(list).toHaveTextContent('після 0042');
    expect(list).toHaveTextContent('210 шт');
    expect(list).toHaveTextContent('Сукня, Джинси');
    expect(list).toHaveTextContent('Футболка, Боді');
  });

  it('marks the series this card\'s category already uses', async () => {
    // The server sorts; the button must not reorder it, or the hint moves.
    skuSeries.mockResolvedValue([{ ...T_SERIES, inTag: 128 }, series()]);
    render(<SkuField value="" onChange={vi.fn()} tagIds={[55]} caption="Артикул" captionClass="" />);

    await userEvent.click(screen.getByRole('button', { name: 'Наступний' }));

    const list = await screen.findByRole('group', { name: 'Серії артикулів' });
    const buttons = screen.getAllByRole('button').filter((b) => list.contains(b));
    expect(buttons[0]).toHaveTextContent('т015');
    expect(buttons[0]).toHaveTextContent('ця категорія');
    expect(buttons[1]).not.toHaveTextContent('ця категорія');
  });

  it('sends the card\'s tags so the server can rank by them', async () => {
    skuSeries.mockResolvedValue([series()]);
    render(<SkuField value="" onChange={vi.fn()} tagIds={[55, 7]} caption="Артикул" captionClass="" />);

    await userEvent.click(screen.getByRole('button', { name: 'Наступний' }));

    await waitFor(() => expect(skuSeries).toHaveBeenCalledWith([55, 7]));
  });

  it('writes the series the owner picked, and closes', async () => {
    skuSeries.mockResolvedValue([series(), T_SERIES]);
    const onPick = vi.fn();
    render(<SkuField value="" onChange={onPick} tagIds={[]} caption="Артикул" captionClass="" />);

    await userEvent.click(screen.getByRole('button', { name: 'Наступний' }));
    await userEvent.click(await screen.findByText('т015'));

    expect(onPick).toHaveBeenCalledWith('т015');
    await waitFor(() => expect(screen.queryByRole('group')).toBeNull());
  });

  it('offers to start the numbering when there are no articles yet', async () => {
    skuSeries.mockResolvedValue([]);
    const onPick = vi.fn();
    render(<SkuField value="" onChange={onPick} tagIds={[]} caption="Артикул" captionClass="" />);

    await userEvent.click(screen.getByRole('button', { name: 'Наступний' }));

    expect(await screen.findByText(/наберіть перший самі/)).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('says a failed read is a failed read, not an empty numbering', async () => {
    // Silence here would read as «серій немає» and send the owner off to
    // retype a number that the shop already uses.
    skuSeries.mockRejectedValue(new Error('offline'));
    render(<SkuField value="" onChange={vi.fn()} tagIds={[]} caption="Артикул" captionClass="" />);

    await userEvent.click(screen.getByRole('button', { name: 'Наступний' }));

    expect(await screen.findByText(/Не вдалося прочитати нумерацію/)).toBeInTheDocument();
  });
});
