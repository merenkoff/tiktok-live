// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Імпорт техкарт» (TechDocs/POS_ONBOARDING.md, O3): the file is read here,
// the plan comes from the server, and the write button exists only for a plan
// with no error — every row to fix is named instead.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { TechCardImportResult } from '../data/techCardsApi';

const posRequest = vi.fn<(method: string, path: string, body: { rows: unknown[]; apply: boolean }) => Promise<TechCardImportResult>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: { posRequest: (method: string, path: string, body: { rows: unknown[]; apply: boolean }) => posRequest(method, path, body) },
  };
});

const { TechCardsImportDialog } = await import('./TechCardsImportDialog');

function result(over: Partial<TechCardImportResult> = {}): TechCardImportResult {
  return {
    ok: true,
    applied: false,
    errors: [],
    warnings: [],
    dishes: [
      {
        dish: 'Борщ',
        variant: null,
        components: [{ ingredient: 'Буряк', quantity: 80, unit: 'г', is_new: true }],
        cost_cents: 2220,
        price_cents: 15500,
        food_cost_bps: 1432,
        becomes: 'derived',
        error: null,
      },
    ],
    ingredients: [{ name: 'Буряк', unit: 'г', cost_cents: 2, is_new: true, price_changed: true }],
    totals: { dishes: 1, becomes_derived: 1, replaced: 0, ingredients_new: 1, prices_set: 1 },
    ...over,
  };
}

const csv = (text: string) => new File([text], 'techcards.csv', { type: 'text/csv' });

beforeEach(() => posRequest.mockReset());

describe('TechCardsImportDialog', () => {
  it('sends the file’s rows for a plan, shows it, then applies the same rows', async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();
    posRequest.mockResolvedValueOnce(result()).mockResolvedValueOnce(result({ applied: true }));
    renderWithProviders(<TechCardsImportDialog onClose={() => {}} onApplied={onApplied} />);

    await user.upload(screen.getByLabelText('Файл техкарт'), csv('Страва;Складник;Кількість;Од.;Ціна\nБорщ;Буряк;80;г;20\n'));
    await waitFor(() => expect(screen.getByTestId('tech-cards-import-totals')).toHaveTextContent('Страв: 1 (стануть техкартами: 1'));
    expect(screen.getByText('14,3 %')).toBeInTheDocument();
    const [, path, body] = posRequest.mock.calls[0];
    expect(path).toBe('/products/tech-cards/import');
    expect(body).toEqual({
      rows: [{ line: 2, dish: 'Борщ', variant: '', ingredient: 'Буряк', quantity: '80', unit: 'г', price: '20' }],
      apply: false,
    });

    await user.click(screen.getByRole('button', { name: 'Застосувати (1)' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(posRequest.mock.calls[1][2]).toMatchObject({ apply: true });
    expect(screen.getByRole('status')).toHaveTextContent('Готово: техкарт 1, нових складників 1');
  });

  it('names every row to fix and offers no write while there are errors', async () => {
    const user = userEvent.setup();
    posRequest.mockResolvedValueOnce(
      result({
        ok: false,
        errors: ['Рядок 3: одиниця «ложки» — потрібна г, кг, мл, л або шт'],
        dishes: [{ ...result().dishes[0], dish: 'Невідома', error: 'страви «Невідома» немає в магазині — спершу імпортуйте меню або створіть картку' }],
      })
    );
    renderWithProviders(<TechCardsImportDialog onClose={() => {}} onApplied={() => {}} />);
    await user.upload(screen.getByLabelText('Файл техкарт'), csv('Страва;Складник;Кількість;Од.\nНевідома;Сіль;2;г\nБорщ;Сало;2;ложки\n'));

    const errors = await screen.findByTestId('tech-cards-import-errors');
    expect(errors).toHaveTextContent('Рядок 3: одиниця «ложки»');
    expect(errors).toHaveTextContent('страви «Невідома» немає в магазині');
    expect(screen.getByRole('button', { name: /Застосувати/ })).toBeDisabled();
  });

  it('says so when the file holds no rows, without asking the server', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TechCardsImportDialog onClose={() => {}} onApplied={() => {}} />);
    await user.upload(screen.getByLabelText('Файл техкарт'), csv('Страва;Складник;Кількість;Од.\n'));
    expect(await screen.findByText('У файлі немає рядків з техкартами')).toBeInTheDocument();
    expect(posRequest).not.toHaveBeenCalled();
  });
});
