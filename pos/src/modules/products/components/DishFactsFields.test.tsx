// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The two fields a guest reads about a dish beyond its name: a line of
// composition and the allergens. The same block sits in the create and the edit
// form, so it is pinned once, here.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COMPOSITION_MAX } from './allergens';
import { DishFactsFields } from './DishFactsFields';

describe('DishFactsFields', () => {
  it('shows the composition as a limited textarea with what it is for, and the allergen chips', () => {
    render(
      <DishFactsFields composition="Еспресо, молоко" onComposition={() => undefined} allergens={['milk']} onAllergens={() => undefined} />
    );
    const box = screen.getByLabelText(/Склад для гостя/);
    expect(box).toHaveValue('Еспресо, молоко');
    expect(box).toHaveAttribute('maxlength', String(COMPOSITION_MAX));
    expect(screen.getByText(/Гість бачить це в QR-меню/)).toBeInTheDocument();
    expect(screen.getByText(/Це не рецепт/)).toBeInTheDocument();
    expect(screen.getByTestId('allergen-chip-milk')).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports what is typed and what is ticked', () => {
    const onComposition = vi.fn();
    const onAllergens = vi.fn();
    render(<DishFactsFields composition="" onComposition={onComposition} allergens={[]} onAllergens={onAllergens} />);
    fireEvent.change(screen.getByLabelText(/Склад для гостя/), { target: { value: 'Борошно, яйця' } });
    expect(onComposition).toHaveBeenLastCalledWith('Борошно, яйця');
    fireEvent.click(screen.getByTestId('allergen-chip-eggs'));
    expect(onAllergens).toHaveBeenLastCalledWith(['eggs']);
  });
});
