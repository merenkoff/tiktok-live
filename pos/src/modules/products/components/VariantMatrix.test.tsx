// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VariantMatrix, type MatrixResult } from './VariantMatrix';

const VOCAB = [
  { name: 'блакитний', count: 9 },
  { name: 'малиновий', count: 4 },
  { name: 'беж', count: 2 },
];

let last: MatrixResult | null = null;
const onChange = vi.fn((r: MatrixResult) => {
  last = r;
});

function setup(props: Partial<React.ComponentProps<typeof VariantMatrix>> = {}) {
  const user = userEvent.setup();
  const utils = render(
    <VariantMatrix unit="шт" vocabulary={VOCAB} autoBarcode onChange={onChange} {...props} />
  );
  return { user, ...utils };
}

const sizeChips = () => within(screen.getByRole('group', { name: 'Розміри' }));

async function addColour(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByLabelText('Новий колір'), `${text}{Enter}`);
}

async function price(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByPlaceholderText('Ціна, грн'), text);
}

beforeEach(() => {
  last = null;
  onChange.mockClear();
  try {
    window.localStorage.clear();
  } catch {
    /* storage unavailable in this run */
  }
});

describe('VariantMatrix — the scales', () => {
  it('opens on the baby heights, the first children\'s scale', () => {
    setup();
    expect(screen.getByLabelText('Сітка розмірів')).toHaveValue('baby-height');
    const chips = sizeChips().getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(chips).toEqual(['56', '62', '68', '74', '80', '86', '92']);
  });

  it('lists the children\'s scales before the adult ones, in plain words', () => {
    setup();
    const options = within(screen.getByLabelText('Сітка розмірів')).getAllByRole('option').map((o) => o.textContent);
    expect(options.slice(0, 5)).toEqual([
      'Малюки · зріст, см',
      'Діти · зріст, см',
      'Вік · місяці',
      'Вік · роки',
      'Зріст від–до, см',
    ]);
    expect(options.indexOf('Дорослі (XS–XXL)')).toBeGreaterThan(options.indexOf('Зріст від–до, см'));
  });

  it('shows the age under every height: the main label short, the explanation a second line', () => {
    setup();
    const hints = Object.fromEntries(
      sizeChips().getAllByRole('button').map((b) => [b.getAttribute('aria-label'), b.textContent!.replace(b.getAttribute('aria-label')!, '')])
    );
    expect(hints).toEqual({
      '56': '0–1 міс',
      '62': '1–3 міс',
      '68': '3–6 міс',
      '74': '6–9 міс',
      '80': '9–12 міс',
      '86': '12–18 міс',
      '92': '18–24 міс',
    });
  });

  it('shows the height under every age, and saves the age as worded — with its unit', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText('Сітка розмірів'), 'years');

    const chip = sizeChips().getByRole('button', { name: '3–4 роки' });
    expect(chip).toHaveTextContent('≈ 104 см');

    await addColour(user, 'блакитний');
    await user.click(chip);
    await price(user, '400');
    expect(last!.variants[0]!.attributes).toEqual({ color: 'блакитний', size: '3–4 роки' });
  });

  it('gives an adult size no hint', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText('Сітка розмірів'), 'adult');

    for (const chip of sizeChips().getAllByRole('button')) {
      expect(chip.textContent).toBe(chip.getAttribute('aria-label'));
    }
  });

  it('explains a size typed by hand, when it is on the ladder: a pair the scale does not list', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Свій розмір'), '98/104{Enter}');

    expect(sizeChips().getByRole('button', { name: '98/104' })).toHaveTextContent('2–4 роки');
  });

  it('offers pairs of heights written the way the shop writes them', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText('Сітка розмірів'), 'height-pairs');

    expect(sizeChips().getByRole('button', { name: '98-104' })).toBeInTheDocument();
    expect(sizeChips().getByRole('button', { name: '56-62' })).toBeInTheDocument();
  });

  it('remembers the scale chosen, and opens on it next time', async () => {
    const first = setup();
    await first.user.selectOptions(screen.getByLabelText('Сітка розмірів'), 'months');
    first.unmount();

    setup();
    expect(screen.getByLabelText('Сітка розмірів')).toHaveValue('months');
  });

  it('opens on the years scale for a device that remembered the old «years in pairs» one', () => {
    window.localStorage.setItem('pos.variantMatrix.scale', 'year-pairs');
    setup();
    expect(screen.getByLabelText('Сітка розмірів')).toHaveValue('years');
  });

  it('still works when the browser will not store anything', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const { user } = setup();
      expect(screen.getByLabelText('Сітка розмірів')).toHaveValue('baby-height');
      await user.selectOptions(screen.getByLabelText('Сітка розмірів'), 'years');
      expect(screen.getByLabelText('Сітка розмірів')).toHaveValue('years');
    } finally {
      spy.mockRestore();
      set.mockRestore();
    }
  });

  it('starts a new choice when the scale changes: a month and a year are not two sizes of one shirt', async () => {
    const { user } = setup();
    await user.click(sizeChips().getByRole('button', { name: '86' }));
    expect(sizeChips().getByRole('button', { name: '86' })).toHaveAttribute('aria-pressed', 'true');

    await user.selectOptions(screen.getByLabelText('Сітка розмірів'), 'years');

    for (const chip of sizeChips().getAllByRole('button')) expect(chip).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('VariantMatrix — colours', () => {
  it('folds a typed colour into the spelling the store already has', async () => {
    const { user } = setup();
    await addColour(user, 'Малиновий');

    expect(screen.getByRole('button', { name: 'Прибрати колір малиновий' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Прибрати колір Малиновий/ })).toBeNull();
  });

  it('keeps a new colour as typed, tidied', async () => {
    const { user } = setup();
    await addColour(user, '  Пудровий   беж ');

    expect(screen.getByRole('button', { name: 'Прибрати колір Пудровий беж' })).toBeInTheDocument();
  });

  it('adds a colour from the store\'s list with one tap, and takes it off the suggestions', async () => {
    const { user } = setup();
    const suggestions = within(screen.getByRole('group', { name: 'Кольори магазину' }));
    await user.click(suggestions.getByRole('button', { name: '+ блакитний' }));

    expect(screen.getByRole('button', { name: 'Прибрати колір блакитний' })).toBeInTheDocument();
    expect(suggestions.queryByRole('button', { name: '+ блакитний' })).toBeNull();
  });

  it('does not add the same colour twice, however it is typed', async () => {
    const { user } = setup();
    await addColour(user, 'блакитний');
    await addColour(user, ' БЛАКИТНИЙ ');

    expect(screen.getAllByRole('button', { name: /Прибрати колір/ })).toHaveLength(1);
  });

  it('takes a colour off with its cross', async () => {
    const { user } = setup();
    await addColour(user, 'беж');
    await user.click(screen.getByRole('button', { name: 'Прибрати колір беж' }));

    expect(screen.queryByRole('button', { name: /Прибрати колір/ })).toBeNull();
  });
});

describe('VariantMatrix — the rows', () => {
  async function pick(user: ReturnType<typeof userEvent.setup>) {
    await addColour(user, 'блакитний');
    await addColour(user, 'рожевий');
    await user.click(sizeChips().getByRole('button', { name: '86' }));
    await user.click(sizeChips().getByRole('button', { name: '92' }));
    await user.click(sizeChips().getByRole('button', { name: '80' }));
  }

  it('makes every colour by every size, colour by colour, sizes in the scale\'s order', async () => {
    const { user } = setup();
    await pick(user);

    const rows = screen.getAllByTestId(/^matrix-row-/).map((r) => r.textContent?.replace(/[×↺]/g, '').trim());
    expect(rows).toEqual([
      'блакитний / 80',
      'блакитний / 86',
      'блакитний / 92',
      'рожевий / 80',
      'рожевий / 86',
      'рожевий / 92',
    ]);
    expect(screen.getByTestId('matrix-summary')).toHaveTextContent('Буде створено варіантів: 6');
  });

  it('sends one variant per row, with one price for all and the attributes the server reads', async () => {
    const { user } = setup();
    await pick(user);
    await price(user, '420');
    await user.type(screen.getByPlaceholderText('Закупівельна, грн'), '180,50');
    await user.clear(screen.getByLabelText('Залишок кожного, шт'));
    await user.type(screen.getByLabelText('Залишок кожного, шт'), '2');

    expect(last!.problem).toBeNull();
    expect(last!.variants).toHaveLength(6);
    expect(last!.variants[0]).toEqual({
      attributes: { color: 'блакитний', size: '80' },
      unit: 'шт',
      price_cents: 42000,
      cost_cents: 18050,
      quantity: 2,
    });
    // No barcode is sent: the server mints it.
    expect(last!.variants.every((v) => !('barcode' in v))).toBe(true);
  });

  it('says what is missing rather than sending a wrong price: no price, no variants', async () => {
    const { user } = setup();
    await pick(user);

    expect(last!.problem).toBe('Вкажіть ціну: загальну або в кожному рядку');
    expect(last!.variants).toEqual([]);
  });

  it('takes a price of its own in a row, and only for that row', async () => {
    const { user } = setup();
    await pick(user);
    await price(user, '400');
    await user.type(screen.getByLabelText('Ціна: рожевий / 92'), '450');

    const byLabel = Object.fromEntries(last!.variants.map((v) => [`${v.attributes.color} / ${v.attributes.size}`, v.price_cents]));
    expect(byLabel['рожевий / 92']).toBe(45000);
    expect(byLabel['рожевий / 86']).toBe(40000);
  });

  it('lets one row carry a price when the common one is empty, as long as every row has one', async () => {
    const { user } = setup();
    await addColour(user, 'беж');
    await user.click(sizeChips().getByRole('button', { name: '86' }));
    await user.type(screen.getByLabelText('Ціна: беж / 86'), '380');

    expect(last!.problem).toBeNull();
    expect(last!.variants[0]!.price_cents).toBe(38000);
  });

  it('carries a barcode typed into a row, and only that row', async () => {
    const { user } = setup();
    await pick(user);
    await price(user, '400');
    await user.type(screen.getByLabelText('Штрихкод: блакитний / 86'), '4820024700016');

    const withCode = last!.variants.filter((v) => 'barcode' in v);
    expect(withCode).toHaveLength(1);
    expect(withCode[0]).toMatchObject({ attributes: { color: 'блакитний', size: '86' }, barcode: '4820024700016' });
  });

  it('leaves out a row that was struck, and brings it back again', async () => {
    const { user } = setup();
    await pick(user);
    await price(user, '400');
    await user.click(screen.getByRole('button', { name: 'Не створювати: рожевий / 80' }));

    expect(last!.variants).toHaveLength(5);
    expect(screen.getByTestId('matrix-summary')).toHaveTextContent('Буде створено варіантів: 5');

    await user.click(screen.getByRole('button', { name: 'Повернути: рожевий / 80' }));
    expect(last!.variants).toHaveLength(6);
  });

  it('selects all sizes of the scale, and none', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Усі' }));
    expect(screen.getAllByTestId(/^matrix-row-/)).toHaveLength(7);

    await user.click(screen.getByRole('button', { name: 'Жодного' }));
    // No size and no colour chosen: one plain row, which is a variant too.
    expect(screen.getAllByTestId(/^matrix-row-/)).toHaveLength(1);
  });

  it('takes a size of its own, typed in: a pair the scale does not list', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Свій розмір'), '98/104{Enter}');

    expect(sizeChips().getByRole('button', { name: '98/104' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('matrix-row-0')).toHaveTextContent('98/104');
  });

  it('is one plain variant when nothing was chosen — a hat is still a product', async () => {
    const { user } = setup();
    await price(user, '250');

    expect(last!.variants).toEqual([{ attributes: {}, unit: 'шт', price_cents: 25000, quantity: 0 }]);
  });

  it('refuses a stock that is not a whole number, and a cost that is not a number', async () => {
    const { user } = setup();
    await price(user, '100');
    await user.clear(screen.getByLabelText('Залишок кожного, шт'));
    await user.type(screen.getByLabelText('Залишок кожного, шт'), '1,5');
    expect(last!.problem).toBe('Залишок — ціле число, не менше нуля');

    await user.clear(screen.getByLabelText('Залишок кожного, шт'));
    await user.type(screen.getByLabelText('Залишок кожного, шт'), '0');
    await user.type(screen.getByPlaceholderText('Закупівельна, грн'), 'багато');
    expect(last!.problem).toBe('Закупівельна ціна — число');
  });

  it('refuses more than the server takes at once', async () => {
    const { user } = setup();
    await price(user, '100');
    await user.selectOptions(screen.getByLabelText('Сітка розмірів'), 'kids-shoes');
    await user.click(screen.getByRole('button', { name: 'Усі' }));
    // 20 shoe sizes × 11 colours = 220 > 200.
    for (const c of ['а', 'б', 'в', 'г', 'д', 'е', 'є', 'ж', 'з', 'и', 'к']) await addColour(user, c);

    expect(last!.problem).toMatch(/Забагато варіантів/);
    expect(last!.variants).toEqual([]);
  });

  it('says the barcodes are the system\'s — only where the vertical mints them', () => {
    const on = setup({ autoBarcode: true });
    expect(screen.getByText('Штрихкоди проставить система.')).toBeInTheDocument();
    on.unmount();

    setup({ autoBarcode: false });
    expect(screen.queryByText('Штрихкоди проставить система.')).toBeNull();
  });
});

describe('VariantMatrix — a card that already has variants', () => {
  const existing = [
    { is_active: true, attributes: { color: 'Блакитний', size: '86' } },
    { is_active: true, attributes: { color: 'блакитний', size: '92' } },
  ];

  it('marks a cell the card already has, and never sends it again', async () => {
    const { user } = setup({ existing });
    await addColour(user, 'блакитний');
    await user.click(sizeChips().getByRole('button', { name: '86' }));
    await user.click(sizeChips().getByRole('button', { name: '80' }));
    await price(user, '400');

    expect(screen.getByTestId('matrix-row-1')).toHaveTextContent('вже є');
    expect(screen.getByTestId('matrix-summary')).toHaveTextContent('Буде створено 1 варіант · вже є: 1');
    expect(last!.variants.map((v) => v.attributes)).toEqual([{ color: 'блакитний', size: '80' }]);
    expect(last!.already).toBe(1);
  });

  it('recognises a pair typed with a slash as the one the card has saved with a hyphen', async () => {
    const { user } = setup({ existing: [{ is_active: true, attributes: { color: 'беж', size: '98-104' } }] });
    await addColour(user, 'беж');
    await user.type(screen.getByLabelText('Свій розмір'), '98/104{Enter}');

    expect(screen.getByTestId('matrix-row-0')).toHaveTextContent('вже є');
  });

  it('says so when everything chosen is already there', async () => {
    const { user } = setup({ existing });
    await addColour(user, 'блакитний');
    await user.click(sizeChips().getByRole('button', { name: '86' }));
    await price(user, '400');

    expect(last!.problem).toBe('Усі ці варіанти вже є');
  });

  it('asks for a choice before anything is chosen, rather than adding a blank variant to a card that has some', async () => {
    const { user } = setup({ existing });
    await price(user, '400');

    expect(last!.problem).toBe('Оберіть кольори й розміри');
    expect(last!.variants).toEqual([]);
  });

  it('clears its picks when told to, and keeps the price', async () => {
    const { user, rerender } = setup({ existing, resetKey: 0 });
    await addColour(user, 'беж');
    await user.click(sizeChips().getByRole('button', { name: '86' }));
    await price(user, '400');

    rerender(
      <VariantMatrix unit="шт" vocabulary={VOCAB} existing={existing} autoBarcode onChange={onChange} resetKey={1} />
    );

    expect(screen.queryByRole('button', { name: /Прибрати колір/ })).toBeNull();
    expect(sizeChips().getByRole('button', { name: '86' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByPlaceholderText('Ціна, грн')).toHaveValue('400');
  });
});
