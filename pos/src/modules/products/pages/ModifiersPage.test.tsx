// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Модифікатори» — the owner's questions, who asks them, and the editor.
//
// What is pinned here is what only this page does and the contract with the
// server: a question is saved WHOLE (one request with every answer in order,
// a SIGNED delta in kopecks, what it takes off the shelf); a question is
// given to many products at once; what is wrong is a filter; and a refusal
// comes back in the server's words.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { ModifierGroup, PosTag, Product } from '../../../types';

const listModifierGroups = vi.fn<[], Promise<ModifierGroup[]>>();
const getProducts = vi.fn<[], Promise<Product[]>>();
const getTags = vi.fn<[], Promise<PosTag[]>>();
const deleteModifierGroup = vi.fn();
const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: {
      listModifierGroups: () => listModifierGroups(),
      getProducts: () => getProducts(),
      getTags: () => getTags(),
      deleteModifierGroup: (...a: unknown[]) => deleteModifierGroup(...a),
      posRequest: (...a: unknown[]) => posRequest(...a),
    },
  };
});

const { ModifiersPage } = await import('./ModifiersPage');
const { useAuthStore } = await import('@pos/platform');
const { signedUahInputToCents } = await import('../components/modifierInput');

const milk: ModifierGroup = {
  id: 1,
  name: 'Молоко',
  min_select: 1,
  max_select: 1,
  sort_order: 0,
  is_active: true,
  labels_in_use: ['M', 'L'],
  product_ids: [5, 6],
  modifiers: [
    {
      id: 11,
      group_id: 1,
      name: 'звичайне',
      price_delta_cents: 0,
      component_variant_id: 20,
      component_quantity: 200,
      component: { product_name: 'Молоко', label: '', unit: 'мл' },
      is_default: true,
      sort_order: 0,
      is_active: true,
    },
    {
      id: 12,
      group_id: 1,
      name: 'вівсяне',
      price_delta_cents: 1500,
      component_variant_id: 21,
      component_quantity: 200,
      component: { product_name: 'Молоко вівсяне', label: '', unit: 'мл' },
      is_default: false,
      sort_order: 1,
      is_active: true,
    },
  ],
};

const portion: ModifierGroup = {
  id: 2,
  name: 'Порція',
  min_select: 0,
  max_select: 1,
  sort_order: 1,
  is_active: true,
  product_ids: [],
  modifiers: [
    {
      id: 21,
      group_id: 2,
      name: 'половина',
      price_delta_cents: -2000,
      component_variant_id: null,
      component_quantity: null,
      component: null,
      is_default: false,
      sort_order: 0,
      is_active: true,
    },
  ],
};

function product(id: number, name: string, patch: Partial<Product> = {}): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: true,
    sellable: true,
    tag_ids: [],
    modifier_group_ids: [],
    variants: [
      {
        id: id * 10,
        product_id: id,
        attributes: {},
        label: '',
        unit: 'шт',
        sku: null,
        barcode: null,
        price_cents: 6500,
        cost_cents: 0,
        is_active: true,
        quantity: 0,
      },
    ],
    ...patch,
  } as Product;
}

const COFFEE: PosTag = { id: 7, store_id: 1, name: 'Кава', parent_id: null, color: null, children: [] } as unknown as PosTag;

const plainMilk = product(2, 'Молоко', { sellable: false });
plainMilk.variants[0] = { ...plainMilk.variants[0], id: 20, unit: 'мл' };
const oatMilk = product(3, 'Молоко вівсяне', { sellable: false });
oatMilk.variants[0] = { ...oatMilk.variants[0], id: 21, unit: 'мл' };
const latte = product(5, 'Латте', { tag_ids: [7], modifier_group_ids: [1] });
const raf = product(6, 'Раф', { tag_ids: [7], modifier_group_ids: [1] });
const flat = product(8, 'Флет уайт', { tag_ids: [7] });
const tea = product(9, 'Чай');

beforeEach(() => {
  listModifierGroups.mockResolvedValue([milk, portion]);
  getProducts.mockResolvedValue([plainMilk, oatMilk, latte, raf, flat, tea]);
  getTags.mockResolvedValue([COFFEE]);
});

afterEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ auth: null } as never);
});

async function openPage() {
  renderWithProviders(<ModifiersPage />, { route: '/admin/modifiers' });
  await screen.findByTestId('group-card-1');
}

describe('ModifiersPage', () => {
  it('reads each question on one row: rule, answers with signed prices, and who asks it', async () => {
    await openPage();
    const milkCard = within(screen.getByTestId('group-card-1'));
    expect(milkCard.getByText('обовʼязково · одна відповідь')).toBeInTheDocument();
    expect(milkCard.getByTestId('group-answers')).toHaveTextContent('звичайне · вівсяне +15 ₴');
    expect(milkCard.getByTestId('group-usage-1')).toHaveTextContent('2 страви: Латте, Раф');

    const portionCard = within(screen.getByTestId('group-card-2'));
    expect(portionCard.getByTestId('group-answers')).toHaveTextContent('половина −20 ₴');
    // Nobody asks it: said on the row, and one tap from fixing it.
    expect(portionCard.getByTestId('group-problem-unused')).toHaveTextContent('ніде не питають');
    expect(portionCard.getByTestId('group-usage-2')).toHaveTextContent('Додати до страв…');
  });

  it('finds a question by an answer, and what is wrong by a filter with a count', async () => {
    const user = userEvent.setup();
    await openPage();
    await user.type(screen.getByTestId('modifiers-search'), 'вівс');
    expect(screen.getByTestId('group-card-1')).toBeInTheDocument();
    expect(screen.queryByTestId('group-card-2')).not.toBeInTheDocument();

    await user.clear(screen.getByTestId('modifiers-search'));
    expect(screen.getByTestId('modifiers-filter-unused')).toHaveTextContent('Ніде не питають1');
    await user.click(screen.getByTestId('modifiers-filter-unused'));
    expect(screen.queryByTestId('group-card-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('group-card-2')).toBeInTheDocument();
  });

  it('explains itself while there is nothing yet', async () => {
    listModifierGroups.mockResolvedValue([]);
    renderWithProviders(<ModifiersPage />, { route: '/admin/modifiers' });
    const empty = await screen.findByTestId('modifiers-empty');
    expect(empty).toHaveTextContent('Як це працює');
    expect(within(empty).getByTestId('modifiers-first')).toBeInTheDocument();
  });

  it('creates a question whole from a template, then asks who should be asked it', async () => {
    const user = userEvent.setup();
    const created: ModifierGroup = { ...portion, id: 9, name: 'Сироп', max_select: 3, modifiers: [], product_ids: [] };
    posRequest.mockResolvedValueOnce(created);
    await openPage();

    await user.click(screen.getByTestId('modifiers-new'));
    const dialog = within(await screen.findByTestId('modifier-group-dialog'));
    await user.click(dialog.getByTestId('modifier-template-syrup'));
    expect(dialog.getByTestId('modifier-group-name')).toHaveValue('Сироп');
    expect(dialog.getByTestId('modifier-rule-sentence')).toHaveTextContent('до 3 відповідей або жодної');

    // A price on the first answer, and one more answer typed into the last row.
    const deltas = dialog.getAllByTestId('answer-delta');
    await user.type(deltas[0], '10');
    await user.type(within(dialog.getByTestId('answer-row-new')).getByTestId('answer-name'), 'мʼята');
    // Typing into the last row made a new last row.
    expect(dialog.getByTestId('answer-row-new')).toBeInTheDocument();
    expect(dialog.getByTestId('modifier-preview')).toHaveTextContent('ваніль+10 ₴');

    await user.click(dialog.getByTestId('modifier-group-save'));
    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    expect(posRequest).toHaveBeenCalledWith('post', '/modifier-groups', {
      name: 'Сироп',
      min_select: 0,
      max_select: 3,
      is_active: true,
      modifiers: ['ваніль', 'карамель', 'лісовий горіх', 'мʼята'].map((name, index) => ({
        name,
        price_delta_cents: index === 0 ? 1000 : 0,
        label_deltas: [],
        is_default: false,
        is_active: true,
        component_variant_id: null,
        component_quantity: null,
      })),
    });

    // The next step is offered at once: a question nobody asks does nothing.
    expect(await screen.findByTestId('group-products-dialog')).toHaveTextContent('Хто питає «Сироп»');
    expect(screen.getByTestId('group-card-9')).toBeInTheDocument();
  });

  it('changes a shared question knowingly: a negative delta, a write-off found by typing, one request', async () => {
    const user = userEvent.setup();
    posRequest.mockImplementation((_m: string, _p: string, body: { name: string }) => Promise.resolve({ ...milk, name: body.name }));
    await openPage();
    await user.click(screen.getByTestId('group-edit-1'));
    const dialog = within(await screen.findByTestId('modifier-group-dialog'));
    expect(dialog.getByTestId('modifier-group-shared')).toHaveTextContent('у 2 стравах: Латте, Раф');
    // Nothing changed yet: nothing to save.
    expect(dialog.getByTestId('modifier-group-save')).toBeDisabled();

    const newRow = within(dialog.getByTestId('answer-row-new'));
    await user.type(newRow.getByTestId('answer-name'), 'без молока');
    const rows = dialog.getAllByTestId('answer-row');
    const added = within(rows[2]);
    await user.type(added.getByTestId('answer-delta'), '-10');
    await user.click(added.getByTestId('answer-more'));
    const details = within(added.getByTestId('answer-details'));
    // Ingredients first: «Молоко» and «Молоко вівсяне» lead the list, the dishes follow.
    await user.type(details.getByRole('combobox'), 'вівс');
    await user.click(details.getByRole('option', { name: /Молоко вівсяне/ }));
    await user.clear(details.getByTestId('answer-component-qty'));
    await user.type(details.getByTestId('answer-component-qty'), '150');

    await user.click(dialog.getByTestId('modifier-group-save'));
    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    const [method, path, body] = posRequest.mock.calls[0] as [string, string, { modifiers: unknown[] }];
    expect([method, path]).toEqual(['put', '/modifier-groups/1']);
    expect(body.modifiers).toHaveLength(3);
    // The answers the question had keep their ids; the new one has none.
    expect(body.modifiers[0]).toMatchObject({ id: 11, name: 'звичайне', is_default: true, component_variant_id: 20, component_quantity: 200 });
    expect(body.modifiers[2]).toEqual({
      name: 'без молока',
      price_delta_cents: -1000,
      label_deltas: [],
      is_default: false,
      is_active: true,
      component_variant_id: 21,
      component_quantity: 150,
    });
    await waitFor(() => expect(screen.queryByTestId('modifier-group-dialog')).not.toBeInTheDocument());
  });

  it('prices an answer per size as a column, offered from the sizes its products come in', async () => {
    const user = userEvent.setup();
    posRequest.mockResolvedValue(milk);
    await openPage();
    await user.click(screen.getByTestId('group-edit-1'));
    const dialog = within(await screen.findByTestId('modifier-group-dialog'));
    await user.click(dialog.getByTestId('modifier-sizes-toggle'));
    await user.click(dialog.getByTestId('modifier-size-chip-L'));
    const oat = within(dialog.getAllByTestId('answer-row')[1]);
    await user.type(oat.getByTestId('answer-size-L'), '20');
    await user.click(dialog.getByTestId('modifier-group-save'));
    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    const body = posRequest.mock.calls[0][2] as { modifiers: Array<{ label_deltas: unknown[] }> };
    expect(body.modifiers[0].label_deltas).toEqual([]);
    expect(body.modifiers[1].label_deltas).toEqual([{ label: 'L', price_delta_cents: 2000 }]);
  });

  it('refuses before the request what cannot be saved, and shows the server’s refusal in its own words', async () => {
    const user = userEvent.setup();
    await openPage();
    await user.click(screen.getByTestId('group-edit-2'));
    const dialog = within(await screen.findByTestId('modifier-group-dialog'));
    await user.clear(dialog.getByTestId('modifier-group-name'));
    await user.click(dialog.getByTestId('modifier-group-save'));
    expect(dialog.getByTestId('modifier-group-error')).toHaveTextContent('Назвіть питання');
    expect(posRequest).not.toHaveBeenCalled();

    posRequest.mockRejectedValueOnce({ response: { data: { error: 'Відповідь «половина» названо двічі' } } });
    await user.type(dialog.getByTestId('modifier-group-name'), 'Порція 2');
    await user.click(dialog.getByTestId('modifier-group-save'));
    expect(await dialog.findByTestId('modifier-group-error')).toHaveTextContent('Відповідь «половина» названо двічі');
    // The sheet stays open with what was typed.
    expect(dialog.getByTestId('modifier-group-name')).toHaveValue('Порція 2');
  });

  it('asks before closing a changed question', async () => {
    const user = userEvent.setup();
    await openPage();
    await user.click(screen.getByTestId('group-edit-2'));
    const dialog = within(await screen.findByTestId('modifier-group-dialog'));
    await user.type(dialog.getByTestId('modifier-group-name'), '!');
    await user.click(dialog.getByRole('button', { name: 'Скасувати' }));
    expect(dialog.getByText('Закрити без збереження?')).toBeInTheDocument();
    await user.click(dialog.getByTestId('modifier-group-discard'));
    expect(screen.queryByTestId('modifier-group-dialog')).not.toBeInTheDocument();
    expect(posRequest).not.toHaveBeenCalled();
  });

  it('gives a question to a whole tag at once', async () => {
    const user = userEvent.setup();
    posRequest.mockResolvedValueOnce({ group: { ...portion, product_ids: [5, 6, 8] }, added: 3, removed: 0 });
    await openPage();
    await user.click(screen.getByTestId('group-products-2'));
    const dialog = within(await screen.findByTestId('group-products-dialog'));
    // Only what is sold is offered: the two milks are ingredients.
    expect(dialog.queryByTestId('group-products-row-2')).not.toBeInTheDocument();
    expect(dialog.getByTestId('group-products-row-5')).toHaveTextContent('уже питає: Молоко');
    expect(dialog.getByTestId('group-products-save')).toBeDisabled();

    await user.click(dialog.getByTestId('group-products-scope-7'));
    expect(dialog.queryByTestId('group-products-row-9')).not.toBeInTheDocument();
    await user.click(dialog.getByTestId('group-products-toggle-shown'));
    expect(dialog.getByTestId('group-products-summary')).toHaveTextContent('додати до 3');
    await user.click(dialog.getByTestId('group-products-save'));

    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    const [method, path, body] = posRequest.mock.calls[0] as [string, string, { product_ids: number[] }];
    expect([method, path]).toEqual(['put', '/modifier-groups/2/products']);
    expect([...body.product_ids].sort((a, b) => a - b)).toEqual([5, 6, 8]);
    expect(await screen.findByTestId('modifiers-flash')).toHaveTextContent('«Порція»: додано до 3 страви');
    // The cards' own lists of questions moved: the page reads again.
    await waitFor(() => expect(getProducts).toHaveBeenCalledTimes(2));
  });

  it('duplicates a question as a new one — no answer ids, a name of its own — and opens the copy', async () => {
    const user = userEvent.setup();
    posRequest.mockResolvedValueOnce({ ...milk, id: 30, name: 'Молоко (копія)', product_ids: [] });
    await openPage();
    await user.click(screen.getByTestId('group-more-1'));
    await user.click(screen.getByTestId('group-duplicate-1'));
    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    const [method, path, body] = posRequest.mock.calls[0] as [string, string, { name: string; modifiers: Array<Record<string, unknown>> }];
    expect([method, path, body.name]).toEqual(['post', '/modifier-groups', 'Молоко (копія)']);
    expect(body.modifiers.map((m) => m.name)).toEqual(['звичайне', 'вівсяне']);
    expect(body.modifiers.every((m) => !('id' in m))).toBe(true);
    const dialog = within(await screen.findByTestId('modifier-group-dialog'));
    expect(dialog.getByTestId('modifier-group-name')).toHaveValue('Молоко (копія)');
  });

  it('switches a question off without touching its answers', async () => {
    const user = userEvent.setup();
    posRequest.mockResolvedValueOnce({ ...milk, is_active: false });
    await openPage();
    await user.click(screen.getByTestId('group-more-1'));
    await user.click(screen.getByTestId('group-active-1'));
    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('put', '/modifier-groups/1', { is_active: false }));
    expect(await within(screen.getByTestId('group-card-1')).findByTestId('group-problem-off')).toBeInTheDocument();
  });

  it('deletes a question after asking in its own sheet (the desktop webview has no window.confirm)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    // The page reads the list again afterwards: by then the server has one question fewer.
    deleteModifierGroup.mockImplementation(async () => {
      listModifierGroups.mockResolvedValue([portion]);
    });
    await openPage();
    await user.click(screen.getByTestId('group-more-1'));
    await user.click(screen.getByTestId('group-delete-1'));
    const sheet = within(screen.getByTestId('confirm-sheet'));
    expect(sheet.getByText(/Його перестануть питати 2 страви/)).toBeInTheDocument();
    expect(deleteModifierGroup).not.toHaveBeenCalled();
    await user.click(sheet.getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(deleteModifierGroup).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByTestId('group-card-1')).not.toBeInTheDocument());
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('signedUahInputToCents', () => {
  it('reads a minus in any of its spellings, and a plain number as a surcharge', () => {
    expect(signedUahInputToCents('-20')).toBe(-2000);
    expect(signedUahInputToCents('−20')).toBe(-2000);
    expect(signedUahInputToCents('–20,5')).toBe(-2050);
    expect(signedUahInputToCents('+15')).toBe(1500);
    expect(signedUahInputToCents('15')).toBe(1500);
    expect(signedUahInputToCents('')).toBe(0);
  });

  it('for the marketer, edits answers and prices but never shows or sends what an answer writes off (МР5)', async () => {
    useAuthStore.setState({ auth: { staff: { id: 9, role: 'marketer', display_name: 'Оля' }, store: { id: 1 } } } as never);
    const user = userEvent.setup();
    posRequest.mockImplementation((_m: string, _p: string, body: { name: string }) => Promise.resolve({ ...milk, name: body.name }));
    await openPage();
    await user.click(screen.getByTestId('group-edit-1'));
    const dialog = within(await screen.findByTestId('modifier-group-dialog'));
    expect(dialog.queryByTestId('answer-writeoff-link')).not.toBeInTheDocument();
    // «Дублювати» would copy the write-offs she cannot see.
    expect(dialog.queryByTestId('modifier-group-fork')).not.toBeInTheDocument();
    const first = within(dialog.getAllByTestId('answer-row')[0]);
    await user.click(first.getByTestId('answer-more'));
    expect(within(first.getByTestId('answer-details')).queryByRole('combobox')).not.toBeInTheDocument();
    expect(first.queryByTestId('answer-component-qty')).not.toBeInTheDocument();

    const delta = within(dialog.getAllByTestId('answer-row')[1]).getByTestId('answer-delta');
    await user.clear(delta);
    await user.type(delta, '20');
    await user.click(dialog.getByTestId('modifier-group-save'));
    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    const body = posRequest.mock.calls[0][2] as { modifiers: Array<Record<string, unknown>> };
    expect(body.modifiers[1]).toMatchObject({ id: 12, price_delta_cents: 2000 });
    for (const answer of body.modifiers) {
      expect(answer).not.toHaveProperty('component_variant_id');
      expect(answer).not.toHaveProperty('component_quantity');
    }
  });
});
