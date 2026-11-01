// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The fields a guest reads about a dish beyond its name: a line of
// composition, the allergens, the labels («Гостре», «Хіт»…, F9) and the facts
// line's three numbers (F14). The same block sits in the create and the edit
// form, so it is pinned once, here.

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
        kcal="420"
        onKcal={noop}
        strength="4,5"
        onStrength={noop}
        prepMinutes="25"
        onPrepMinutes={noop}
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
    // The three numbers as typed, each with what the guest will read.
    expect(screen.getByLabelText(/Калорійність, ккал/)).toHaveValue('420');
    expect(screen.getByLabelText(/Міцність, %/)).toHaveValue('4,5');
    expect(screen.getByLabelText(/Готується, хв/)).toHaveValue('25');
    expect(screen.getByText(/На порцію, як подається/)).toBeInTheDocument();
    expect(screen.getByText(/0 — безалкогольне/)).toBeInTheDocument();
    expect(screen.getByText(/готується ≈ 25 хв/)).toBeInTheDocument();
  });

  it('reports what is typed and what is ticked', () => {
    const onComposition = vi.fn();
    const onAllergens = vi.fn();
    const onMenuLabels = vi.fn();
    const onKcal = vi.fn();
    const onStrength = vi.fn();
    const onPrepMinutes = vi.fn();
    render(
      <DishFactsFields
        composition=""
        onComposition={onComposition}
        allergens={[]}
        onAllergens={onAllergens}
        menuLabels={[]}
        onMenuLabels={onMenuLabels}
        kcal=""
        onKcal={onKcal}
        strength=""
        onStrength={onStrength}
        prepMinutes=""
        onPrepMinutes={onPrepMinutes}
      />
    );
    fireEvent.change(screen.getByLabelText(/Склад для гостя/), { target: { value: 'Борошно, яйця' } });
    expect(onComposition).toHaveBeenLastCalledWith('Борошно, яйця');
    fireEvent.click(screen.getByTestId('allergen-chip-eggs'));
    expect(onAllergens).toHaveBeenLastCalledWith(['eggs']);
    fireEvent.click(screen.getByTestId('menu-label-chip-spicy'));
    expect(onMenuLabels).toHaveBeenLastCalledWith(['spicy']);
    // The numbers are reported as text, exactly as typed: the server parses them.
    fireEvent.change(screen.getByLabelText(/Калорійність, ккал/), { target: { value: '320' } });
    expect(onKcal).toHaveBeenLastCalledWith('320');
    fireEvent.change(screen.getByLabelText(/Міцність, %/), { target: { value: '13' } });
    expect(onStrength).toHaveBeenLastCalledWith('13');
    fireEvent.change(screen.getByLabelText(/Готується, хв/), { target: { value: '15' } });
    expect(onPrepMinutes).toHaveBeenLastCalledWith('15');
  });
});
