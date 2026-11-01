// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The fields a guest reads about a dish beyond its name: a line of
// composition, the allergens and the labels («Гостре», «Хіт»…, F9). The same
// block sits in the create and the edit form, so it is pinned once, here.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COMPOSITION_MAX } from './allergens';
import { DishFactsFields } from './DishFactsFields';

const noop = () => undefined;

describe('DishFactsFields', () => {
  it('shows the composition as a limited textarea with what it is for, the allergen chips and the label chips', () => {
    render(
      <DishFactsFields
        composition="Еспресо, молоко"
        onComposition={noop}
        allergens={['milk']}
        onAllergens={noop}
        menuLabels={['hit']}
        onMenuLabels={noop}
      />
    );
    const box = screen.getByLabelText(/Склад для гостя/);
    expect(box).toHaveValue('Еспресо, молоко');
    expect(box).toHaveAttribute('maxlength', String(COMPOSITION_MAX));
    expect(screen.getByText(/Гість бачить це в QR-меню/)).toBeInTheDocument();
    expect(screen.getByText(/Це не рецепт/)).toBeInTheDocument();
    expect(screen.getByTestId('allergen-chip-milk')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('menu-label-chip-hit')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('menu-label-chip-spicy')).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports what is typed and what is ticked', () => {
    const onComposition = vi.fn();
    const onAllergens = vi.fn();
    const onMenuLabels = vi.fn();
    render(
      <DishFactsFields
        composition=""
        onComposition={onComposition}
        allergens={[]}
        onAllergens={onAllergens}
        menuLabels={[]}
        onMenuLabels={onMenuLabels}
      />
    );
    fireEvent.change(screen.getByLabelText(/Склад для гостя/), { target: { value: 'Борошно, яйця' } });
    expect(onComposition).toHaveBeenLastCalledWith('Борошно, яйця');
    fireEvent.click(screen.getByTestId('allergen-chip-eggs'));
    expect(onAllergens).toHaveBeenLastCalledWith(['eggs']);
    fireEvent.click(screen.getByTestId('menu-label-chip-spicy'));
    expect(onMenuLabels).toHaveBeenLastCalledWith(['spicy']);
  });
});
