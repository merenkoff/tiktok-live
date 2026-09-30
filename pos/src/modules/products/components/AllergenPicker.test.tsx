// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The chips an owner ticks a dish's allergens with: fourteen of them, a set that
// comes out in the list's own order however it was tapped, and no chip that
// could claim a dish has none.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ALLERGENS } from './allergens';
import { AllergenPicker } from './AllergenPicker';

describe('the allergen list', () => {
  it('is the fourteen, each once', () => {
    expect(ALLERGENS).toHaveLength(14);
    expect(new Set(ALLERGENS.map((a) => a.code)).size).toBe(14);
  });
});

describe('AllergenPicker', () => {
  it('shows one chip per allergen and marks the ticked ones as pressed', () => {
    render(<AllergenPicker value={['milk', 'gluten']} onChange={() => undefined} />);
    expect(screen.getAllByRole('button')).toHaveLength(14);
    expect(screen.getByTestId('allergen-chip-milk')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('allergen-chip-gluten')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('allergen-chip-fish')).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds a tapped allergen and returns the set in the list’s order, not the order of the taps', () => {
    const onChange = vi.fn();
    render(<AllergenPicker value={['milk']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('allergen-chip-gluten'));
    expect(onChange).toHaveBeenLastCalledWith(['gluten', 'milk']);
    fireEvent.click(screen.getByTestId('allergen-chip-sulphites'));
    expect(onChange).toHaveBeenLastCalledWith(['milk', 'sulphites']);
  });

  it('removes an allergen on a second tap, and can be emptied', () => {
    const onChange = vi.fn();
    render(<AllergenPicker value={['eggs', 'milk']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('allergen-chip-eggs'));
    expect(onChange).toHaveBeenLastCalledWith(['milk']);
    fireEvent.click(screen.getByTestId('allergen-chip-milk'));
    expect(onChange).toHaveBeenLastCalledWith(['eggs']);
  });

  it('says that nothing ticked means «not said» — and offers no chip that claims «none»', () => {
    render(<AllergenPicker value={[]} onChange={() => undefined} />);
    expect(screen.getByText(/це не означає, що їх немає/)).toBeInTheDocument();
    expect(screen.queryByText(/без алергенів|немає алергенів/i)).not.toBeInTheDocument();
  });
});
