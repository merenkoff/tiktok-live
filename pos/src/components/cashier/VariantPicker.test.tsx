// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's variant picker (TechDocs/POS_CLOTHING.md, phase C1d): a garment's
// sizes as chips, a colour at a time, each with the same size in the other
// system under it — and a field where the cashier types what the customer said
// («2 роки») and the sizes that fit light up. A card with no sizes (a florist's
// stems, a café's cups) keeps the plain list, exactly as before.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeCatalogItem } from '../../test/utils';
import { VariantPicker } from './VariantPicker';

let id = 0;
function item(color: string, size: string, quantity: number, price = 42000) {
  id += 1;
  return makeCatalogItem({
    variant_id: id,
    product_name: 'Костюмчик Зайчик',
    attributes: { color, size },
    label: `${color} / ${size}`,
    quantity,
    price_cents: price,
  });
}

function setup(variants: ReturnType<typeof item>[], onPick = vi.fn(), onClose = vi.fn()) {
  const user = userEvent.setup();
  render(<VariantPicker productName="Костюмчик Зайчик" variants={variants} onPick={onPick} onClose={onClose} />);
  return { user, onPick, onClose };
}

const chips = () => within(screen.getByTestId('size-chips'));
const chip = (name: string, colour?: string) => {
  const scope = colour ? within(screen.getByRole('heading', { name: colour }).closest('section')!) : chips();
  return scope.getByRole('button', { name: new RegExp(`^${name}(,|$)`) });
};

const kids = () => [
  item('блакитний', '86', 2),
  item('блакитний', '92', 0),
  item('блакитний', '98', 1),
  item('блакитний', '104', 3),
  item('рожевий', '86', 1),
  item('рожевий', '98', 4),
];

describe('VariantPicker — sizes as chips', () => {
  it('groups the sizes by colour, the colour as a heading, in the order it was given', () => {
    setup(kids());

    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings).toEqual(['блакитний', 'рожевий']);
    const blue = within(screen.getByRole('heading', { name: 'блакитний' }).closest('section')!);
    expect(blue.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['86', '92', '98', '104']);
  });

  it('puts the same size in the other system under each chip', () => {
    setup(kids());

    expect(chip('86', 'блакитний')).toHaveTextContent('12–18 міс');
    expect(chip('98', 'блакитний')).toHaveTextContent('2–3 роки');
    expect(chip('104', 'блакитний')).toHaveTextContent('3–4 роки');
  });

  it('keeps a size that is out where it is, greyed and not pickable — the run of sizes keeps its shape', async () => {
    const { user, onPick } = setup(kids());

    const out = chip('92', 'блакитний');
    expect(out).toBeDisabled();
    expect(out).toHaveTextContent('немає');
    await user.click(out);
    expect(onPick).not.toHaveBeenCalled();
    // …between 86 and 98, not at the bottom.
    const blue = within(screen.getByRole('heading', { name: 'блакитний' }).closest('section')!);
    expect(blue.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['86', '92', '98', '104']);
  });

  it('picks the variant that was tapped', async () => {
    const variants = kids();
    const { user, onPick } = setup(variants);

    await user.click(chip('98', 'рожевий'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]).toBe(variants[5]);
  });

  it('says a single price once, and puts a price on each chip when the sizes differ', () => {
    const { unmount } = render(
      <VariantPicker productName="Х" variants={kids()} onPick={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getAllByText(/420/)).toHaveLength(1);
    unmount();

    render(
      <VariantPicker
        productName="Х"
        variants={[item('сірий', '86', 1, 40000), item('сірий', '98', 1, 45000)]}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '86' })).toHaveTextContent('400');
    expect(screen.getByRole('button', { name: '98' })).toHaveTextContent('450');
  });

  it('shows the stock under a size that has no hint (an adult letter) and draws no finder', () => {
    setup([item('чорний', 'S', 3), item('чорний', 'M', 5), item('чорний', 'L', 0)]);

    expect(chip('M')).toHaveTextContent('5 шт');
    expect(screen.queryByLabelText('Вік або зріст дитини')).toBeNull();
  });

  it('draws no colour heading for a card with one colourless line of sizes', () => {
    setup([
      makeCatalogItem({ variant_id: 901, attributes: { size: '86' }, label: '86', quantity: 1 }),
      makeCatalogItem({ variant_id: 902, attributes: { size: '92' }, label: '92', quantity: 1 }),
    ]);

    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0);
    expect(chips().getAllByRole('button')).toHaveLength(2);
  });

  it('keeps the plain list for a card with no sizes — a florist\'s stems', () => {
    setup([
      makeCatalogItem({ variant_id: 801, attributes: { color: 'червона', length_cm: 60 }, label: 'червона / 60', quantity: 10 }),
      makeCatalogItem({ variant_id: 802, attributes: { color: 'червона', length_cm: 70 }, label: 'червона / 70', quantity: 0 }),
    ]);

    expect(screen.queryByTestId('size-chips')).toBeNull();
    const buttons = screen.getAllByRole('button').filter((b) => b.textContent?.includes('червона'));
    // the old list: the one that is out sinks to the bottom
    expect(buttons[0]).toHaveTextContent('червона / 60');
    expect(buttons[1]).toHaveTextContent('Немає в наявності');
  });

  it('keeps the plain list when even one variant has no size', () => {
    setup([item('сірий', '86', 1), makeCatalogItem({ variant_id: 777, attributes: { color: 'сірий' }, label: 'сірий', quantity: 1 })]);

    expect(screen.queryByTestId('size-chips')).toBeNull();
  });

  it('closes', async () => {
    const { user, onClose } = setup(kids());
    await user.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('VariantPicker — «Вік або зріст дитини»', () => {
  const ask = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    await user.type(screen.getByLabelText('Вік або зріст дитини'), text);
  };
  const state = (size: string, colour: string) => chip(size, colour).getAttribute('data-state');

  it('appears for a child\'s card', () => {
    setup(kids());
    expect(screen.getByLabelText('Вік або зріст дитини')).toBeInTheDocument();
  });

  it('lights the sizes that fit an age, and the next one up for growth', async () => {
    const { user } = setup(kids());
    await ask(user, '2 роки');

    expect(state('98', 'блакитний')).toBe('fit');
    expect(state('98', 'рожевий')).toBe('fit');
    expect(state('104', 'блакитний')).toBe('room');
    expect(state('86', 'блакитний')).toBeNull();
    expect(screen.getByTestId('size-finder-status')).toHaveTextContent('Підходить: 98 · на виріст: 104');
  });

  it('says so in the chip\'s name, not only in its colour', async () => {
    const { user } = setup(kids());
    await ask(user, '2 роки');

    expect(chip('98', 'блакитний')).toHaveAccessibleName('98, підходить');
    expect(chip('104', 'блакитний')).toHaveAccessibleName('104, на виріст');
  });

  it('follows a height as well as an age', async () => {
    const { user } = setup(kids());
    await ask(user, '95 см');

    expect(state('98', 'блакитний')).toBe('fit');
  });

  it('reads an age in months', async () => {
    const { user } = setup([item('сірий', '74', 2), item('сірий', '80', 2), item('сірий', '86', 2)]);
    await ask(user, '8 міс');

    // 8 months wears 74 (6–9 months); 80 is the room to grow.
    expect(state('74', 'сірий')).toBe('fit');
    expect(state('80', 'сірий')).toBe('room');
  });

  it('never suggests a size that is out: it points at what can be sold', async () => {
    const { user } = setup([item('сірий', '86', 2), item('сірий', '98', 0), item('сірий', '104', 2)]);
    await ask(user, '2 роки');

    expect(state('98', 'сірий')).toBeNull();
    expect(state('104', 'сірий')).toBe('room');
    expect(screen.getByTestId('size-finder-status')).toHaveTextContent('Потрібного розміру немає · на виріст: 104');
  });

  it('says it when the size is not in stock at all', async () => {
    const { user } = setup([item('сірий', '86', 2), item('сірий', '92', 2), item('сірий', '98', 0)]);
    await ask(user, '3 роки');

    expect(screen.getByTestId('size-finder-status')).toHaveTextContent('Розмір 104 не в наявності');
  });

  it('asks for an age or a height when it cannot read what was typed, and lights nothing', async () => {
    const { user } = setup(kids());
    await ask(user, 'привіт');

    expect(screen.getByTestId('size-finder-status')).toHaveTextContent('Напишіть вік');
    expect(state('98', 'блакитний')).toBeNull();
  });

  it('says there is no such size past the largest one', async () => {
    const { user } = setup(kids());
    await ask(user, '170');

    expect(screen.getByTestId('size-finder-status')).toHaveTextContent('Такого розміру в каталозі немає');
  });

  it('forgets everything when the field is cleared', async () => {
    const { user } = setup(kids());
    await ask(user, '2 роки');
    await user.clear(screen.getByLabelText('Вік або зріст дитини'));

    expect(screen.queryByTestId('size-finder-status')).toBeNull();
    expect(state('98', 'блакитний')).toBeNull();
  });

  it('still picks a size the normal way while the finder is lit', async () => {
    const variants = kids();
    const { user, onPick } = setup(variants);
    await ask(user, '2 роки');

    await user.click(chip('98', 'блакитний'));
    expect(onPick.mock.calls[0]![0]).toBe(variants[2]);
  });
});

describe('VariantPicker — the price before a markdown (D3)', () => {
  const marked = (color: string, size: string, price: number, old: number | null) => ({
    ...item(color, size, 1, price),
    compare_at_cents: old,
  });

  it('says «було» once in the heading when every size shares the price and the old price', () => {
    setup([marked('сірий', '86', 45000, 59000), marked('сірий', '92', 45000, 59000)]);

    const olds = screen.getAllByTestId('picker-old-price');
    expect(olds).toHaveLength(1);
    expect(olds[0]).toHaveTextContent('590,00 ₴');
    expect(olds[0]!.closest('button')).toBeNull();
    expect(chip('86')).not.toHaveTextContent('590');
  });

  it('puts the old price on the chip that was marked down when the others were not', () => {
    setup([marked('сірий', '86', 45000, 59000), marked('сірий', '92', 45000, null)]);

    expect(chip('86')).toHaveTextContent('590,00 ₴');
    expect(chip('86')).toHaveTextContent('450,00 ₴');
    expect(within(chip('92')).queryByTestId('picker-old-price')).toBeNull();
  });

  it('shows it on the chip beside its own price when the sizes cost differently', () => {
    setup([marked('сірий', '86', 40000, 50000), marked('сірий', '98', 45000, null)]);

    expect(within(chip('86')).getByTestId('picker-old-price')).toHaveTextContent('500,00 ₴');
    expect(chip('86')).toHaveTextContent('400,00 ₴');
    expect(within(chip('98')).queryByTestId('picker-old-price')).toBeNull();
  });

  it('shows it above the price in the plain list of a card with no sizes', () => {
    setup([
      makeCatalogItem({
        variant_id: 811,
        attributes: { color: 'червона', length_cm: 60 },
        label: 'червона / 60',
        quantity: 10,
        price_cents: 9000,
        compare_at_cents: 12000,
      }),
    ]);

    const row = screen.getByRole('button', { name: /червона \/ 60/ });
    expect(within(row).getByTestId('picker-old-price')).toHaveTextContent('120,00 ₴');
    expect(row).toHaveTextContent('90,00 ₴');
  });

  it('never shows an old price that is not above the price', () => {
    setup([marked('сірий', '86', 45000, 45000)]);
    expect(screen.queryByTestId('picker-old-price')).toBeNull();
  });
});
