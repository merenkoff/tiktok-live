// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The modifier sheet: the price of the answer is on the button before the
// line exists, a required question cannot be skipped, and a cap is a refused
// tap rather than a silently dropped earlier choice.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCatalogItem } from '../../test/utils';
import { defaultModifierIds } from '../../lib/modifiers';
import type { CatalogModifierGroup } from '../../types';
import { ModifierSheet } from './ModifierSheet';

const milk: CatalogModifierGroup = {
  id: 1,
  name: 'Молоко',
  min_select: 1,
  max_select: 1,
  modifiers: [
    { id: 11, name: 'звичайне', price_delta_cents: 0, is_default: true, component_variant_id: null, component_quantity: null },
    { id: 12, name: 'вівсяне', price_delta_cents: 1500, is_default: false, component_variant_id: null, component_quantity: null },
  ],
};

const syrup: CatalogModifierGroup = {
  id: 2,
  name: 'Сироп',
  min_select: 0,
  max_select: 2,
  modifiers: [
    { id: 21, name: 'карамель', price_delta_cents: 1000, is_default: false, component_variant_id: null, component_quantity: null },
    { id: 22, name: 'ваніль', price_delta_cents: 1000, is_default: false, component_variant_id: null, component_quantity: null },
    { id: 23, name: 'лісовий горіх', price_delta_cents: 1000, is_default: false, component_variant_id: null, component_quantity: null },
  ],
};

const groups = [milk, syrup];

const latte = makeCatalogItem({
  variant_id: 7,
  product_name: 'Латте',
  label: 'M',
  price_cents: 6500,
  modifier_groups: groups,
});

function renderSheet(overrides: Partial<Parameters<typeof ModifierSheet>[0]> = {}) {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(
    <ModifierSheet
      productName="Латте"
      variants={[latte]}
      variantLabel="Розмір"
      initialModifierIds={defaultModifierIds(groups)}
      onAdd={onAdd}
      onClose={onClose}
      {...overrides}
    />
  );
  return { onAdd, onClose };
}

const price = () => screen.getByTestId('modifier-price').textContent;
const addButton = () => screen.getByTestId('modifier-add') as HTMLButtonElement;

describe('ModifierSheet', () => {
  it('opens with the defaults selected and the card price on the button', () => {
    renderSheet();
    expect(screen.getByTestId('modifier-chip-11')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('modifier-chip-12')).toHaveAttribute('aria-pressed', 'false');
    expect(price()).toBe('65,00 ₴');
    expect(addButton().disabled).toBe(false);
    expect(screen.queryByTestId('modifier-error')).toBeNull();
  });

  it('moves the price with every tap, and a single-answer group swaps its answer', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('modifier-chip-12'));
    expect(price()).toBe('80,00 ₴');
    expect(screen.getByTestId('modifier-chip-11')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('modifier-chip-12')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('modifier-chip-21'));
    expect(price()).toBe('90,00 ₴');
  });

  it('cannot add while a required question is unanswered — a retap deselects', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('modifier-chip-11'));
    expect(addButton().disabled).toBe(true);
    expect(screen.getByTestId('modifier-error')).toHaveTextContent('Оберіть «Молоко»');
    // The price is still there next to the refusal.
    expect(price()).toBe('65,00 ₴');
  });

  it('refuses a tap past the cap instead of dropping an earlier choice', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('modifier-chip-21'));
    fireEvent.click(screen.getByTestId('modifier-chip-22'));
    expect(screen.getByTestId('modifier-chip-23')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('modifier-group-2')).toHaveTextContent('не більше 2');

    fireEvent.click(screen.getByTestId('modifier-chip-23'));
    expect(screen.getByTestId('modifier-chip-23')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('modifier-chip-21')).toHaveAttribute('aria-pressed', 'true');
    expect(price()).toBe('85,00 ₴');
  });

  it('hands back the answers in group order with the trimmed note', () => {
    const { onAdd } = renderSheet();
    fireEvent.click(screen.getByTestId('modifier-chip-21'));
    fireEvent.click(screen.getByTestId('modifier-chip-12'));
    const note = screen.getByTestId('modifier-note') as HTMLInputElement;
    expect(note.maxLength).toBe(120);
    fireEvent.change(note, { target: { value: '  гарячіше ' } });
    fireEvent.click(addButton());

    expect(onAdd).toHaveBeenCalledWith({ item: latte, modifiers: [12, 21], note: 'гарячіше', quantity: 1 });
  });

  it('adds on Enter in the note, but only when the choice is valid', () => {
    const { onAdd } = renderSheet();
    fireEvent.click(screen.getByTestId('modifier-chip-11'));
    fireEvent.keyDown(screen.getByTestId('modifier-note'), { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('modifier-chip-11'));
    fireEvent.keyDown(screen.getByTestId('modifier-note'), { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('asks for the size first when the product has several variants', () => {
    const s = makeCatalogItem({ variant_id: 1, label: 'S', price_cents: 5500, modifier_groups: groups });
    const m = makeCatalogItem({ variant_id: 2, label: 'M', price_cents: 6500, modifier_groups: groups });
    const l = makeCatalogItem({ variant_id: 3, label: 'L', price_cents: 7500, quantity: 0, modifier_groups: groups });
    const { onAdd } = renderSheet({ variants: [s, m, l] });

    expect(addButton().disabled).toBe(true);
    expect(screen.getByTestId('modifier-error')).toHaveTextContent('Оберіть «Розмір»');
    expect(screen.queryByTestId('modifier-price')).toBeNull();
    expect((screen.getByTestId('modifier-variant-3') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('modifier-variant-2'));
    expect(price()).toBe('65,00 ₴');
    fireEvent.click(screen.getByTestId('modifier-chip-12'));
    expect(price()).toBe('80,00 ₴');
    fireEvent.click(addButton());
    expect(onAdd).toHaveBeenCalledWith({ item: m, modifiers: [12], note: '', quantity: 1 });
  });

  it('adds several at once and prices the button for all of them', () => {
    const { onAdd } = renderSheet();
    const minus = screen.getByTestId('modifier-qty-minus') as HTMLButtonElement;
    expect(minus.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('modifier-qty-plus'));
    fireEvent.click(screen.getByTestId('modifier-qty-plus'));
    expect(screen.getByTestId('modifier-qty-value')).toHaveTextContent('3');
    fireEvent.click(screen.getByTestId('modifier-chip-12'));
    expect(price()).toBe('240,00 ₴');
    fireEvent.click(minus);
    expect(price()).toBe('160,00 ₴');
    fireEvent.click(addButton());
    expect(onAdd).toHaveBeenCalledWith({ item: latte, modifiers: [12], note: '', quantity: 2 });
  });

  it('has no stepper when it edits a line, and hands back one', () => {
    const { onAdd } = renderSheet({ withQuantity: false, submitLabel: 'Зберегти' });
    expect(screen.queryByTestId('modifier-qty')).toBeNull();
    fireEvent.click(addButton());
    expect(onAdd).toHaveBeenCalledWith({ item: latte, modifiers: [11], note: '', quantity: 1 });
  });

  it('shows the line caption the receipt will print, and names what a group allows', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('modifier-chip-21'));
    expect(screen.getByTestId('modifier-caption')).toHaveTextContent('M · звичайне · карамель');
    expect(screen.getByTestId('modifier-group-1')).toHaveTextContent('обовʼязково');
    expect(screen.getByTestId('modifier-group-2')).toHaveTextContent('до 2');
  });

  it('refuses a price below zero', () => {
    const cheap = makeCatalogItem({
      variant_id: 9,
      price_cents: 1000,
      modifier_groups: [
        {
          id: 3,
          name: 'Порція',
          min_select: 0,
          max_select: 1,
          modifiers: [
            { id: 31, name: 'половина', price_delta_cents: -2000, is_default: false, component_variant_id: null, component_quantity: null },
          ],
        },
      ],
    });
    renderSheet({ variants: [cheap], initialModifierIds: [] });
    fireEvent.click(screen.getByTestId('modifier-chip-31'));
    expect(addButton().disabled).toBe(true);
    expect(screen.getByTestId('modifier-error')).toHaveTextContent('Ціна не може бути відʼємною');
  });

  it('closes on the scrim, the button and Escape', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByTestId('modifier-scrim'));
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
