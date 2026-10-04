// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Уцінити» (clothing D2): the numbers on screen are the server's preview, the
// payload carries exactly what the owner typed, and a refusal is shown in the
// server's own words.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@pos/platform';
import type { MarkdownPreview } from '../data/markdownsApi';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { MarkdownDialog } = await import('./MarkdownDialog');

const products = [{ id: 1, name: 'Пальто' }, { id: 2, name: 'Кепка' }] as unknown as Product[];

const PREVIEW: MarkdownPreview = {
  items: [
    {
      variant_id: 11,
      product_id: 1,
      product_name: 'Пальто',
      label: 'Синій / 28',
      price_before: 159000,
      compare_at_before: null,
      price_after: 111000,
      compare_at_after: 159000,
    },
    {
      variant_id: 21,
      product_id: 2,
      product_name: 'Кепка',
      label: '',
      price_before: 79000,
      compare_at_before: null,
      price_after: 55000,
      compare_at_after: 79000,
    },
  ],
  skipped: [
    { variant_id: 12, product_name: 'Пальто', label: 'Синій / 30', reason: 'in_markdown', markdown_name: 'Осінь' },
    { variant_id: 13, product_name: 'Пальто', label: 'Синій / 32', reason: 'in_markdown', markdown_name: 'Осінь' },
  ],
  products: 2,
};

function previewCalls() {
  return posRequest.mock.calls.filter((c) => c[1] === '/markdowns/preview');
}

function setup() {
  const onApplied = vi.fn();
  const onClose = vi.fn();
  render(<MarkdownDialog products={products} onClose={onClose} onApplied={onApplied} />);
  return { user: userEvent.setup(), onApplied, onClose };
}

beforeEach(() => {
  posRequest.mockReset();
  posRequest.mockImplementation((method: string, path: string) => {
    if (path === '/markdowns/preview') return Promise.resolve(PREVIEW);
    if (path === '/markdowns') return Promise.resolve({ markdown: { id: 5, products: 2 }, applied: 2, skipped: [] });
    return Promise.reject(new Error(`unexpected ${method} ${path}`));
  });
});

describe('MarkdownDialog', () => {
  it('asks the server what would change once a percent is typed, and says it in words', async () => {
    const { user } = setup();
    expect(screen.getByTestId('markdown-preview')).toHaveTextContent('Вкажіть відсоток');
    expect(screen.getByTestId('markdown-apply')).toBeDisabled();

    await user.type(screen.getByLabelText('Знижка, %'), '30');

    await waitFor(() => expect(previewCalls()).toHaveLength(1));
    expect(previewCalls()[0]![2]).toEqual({ product_ids: [1, 2], percent: 30, rounding: 100, ends_on: null, name: '' });
    const preview = screen.getByTestId('markdown-preview');
    await waitFor(() => expect(preview).toHaveTextContent('Уцінимо варіантів: 2 у 2 товарах'));
    expect(preview).toHaveTextContent('Наприклад, Пальто · Синій / 28: 1 590,00 ₴ → 1 110,00 ₴');
    expect(preview).toHaveTextContent('Пропустимо: вже в уцінці «Осінь» — 2');
    expect(screen.getByTestId('markdown-apply')).toHaveTextContent('Уцінити 2');
  });

  it('re-asks with the rounding the owner picked', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Знижка, %'), '30');
    await waitFor(() => expect(previewCalls()).toHaveLength(1));

    await user.click(within(screen.getByRole('group', { name: 'Округлення нової ціни' })).getByRole('button', { name: 'До 10 ₴' }));

    await waitFor(() => expect(previewCalls()).toHaveLength(2));
    expect(previewCalls()[1]![2]).toMatchObject({ rounding: 1000 });
  });

  it('sends the last day and the name with the markdown, and hands the result back', async () => {
    const { user, onApplied } = setup();
    await user.type(screen.getByLabelText('Знижка, %'), '30');
    await user.type(screen.getByLabelText('Діє до'), '2026-10-15');
    await user.type(screen.getByLabelText('Назва (необов’язково)'), 'Осінь');
    await waitFor(() => expect(screen.getByTestId('markdown-apply')).toBeEnabled());

    await user.click(screen.getByTestId('markdown-apply'));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    const create = posRequest.mock.calls.find((c) => c[1] === '/markdowns')!;
    expect(create[0]).toBe('post');
    expect(create[2]).toEqual({ product_ids: [1, 2], percent: 30, rounding: 100, ends_on: '2026-10-15', name: 'Осінь' });
    expect(onApplied.mock.calls[0]![0]).toMatchObject({ applied: 2 });
  });

  it('shows the server\'s refusal as it is', async () => {
    posRequest.mockImplementation((_m: string, path: string) =>
      path === '/markdowns/preview'
        ? Promise.resolve(PREVIEW)
        : Promise.reject({ response: { status: 400, data: { error: 'Дата завершення вже минула' } } })
    );
    const { user, onApplied } = setup();
    await user.type(screen.getByLabelText('Знижка, %'), '30');
    await waitFor(() => expect(screen.getByTestId('markdown-apply')).toBeEnabled());

    await user.click(screen.getByTestId('markdown-apply'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Дата завершення вже минула');
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('keeps the button off while the preview finds nothing to mark down', async () => {
    posRequest.mockImplementation(() => Promise.resolve({ ...PREVIEW, items: [], products: 0 }));
    const { user } = setup();
    await user.type(screen.getByLabelText('Знижка, %'), '30');
    await waitFor(() => expect(screen.getByTestId('markdown-preview')).toHaveTextContent('Немає що уцінювати серед обраних'));
    expect(screen.getByTestId('markdown-apply')).toBeDisabled();
  });
});
