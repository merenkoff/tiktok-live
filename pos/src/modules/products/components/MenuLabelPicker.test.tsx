// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The chips an owner ticks a dish's QR-menu labels with (phase F9): six of
// them, a set that comes out in the list's own order however it was tapped,
// no «без глютену», and a word about «Новинка»/«Хіт» being the owner's own.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MENU_LABELS } from './menuLabels';
import { MenuLabelPicker } from './MenuLabelPicker';

describe('the label list', () => {
  it('is the six, each once, in the order the guest reads them', () => {
    expect(MENU_LABELS.map((l) => l.code)).toEqual(['spicy', 'vegetarian', 'vegan', 'new', 'hit', 'recommended']);
    expect(new Set(MENU_LABELS.map((l) => l.label)).size).toBe(6);
  });
});

describe('MenuLabelPicker', () => {
  it('shows one chip per label and marks the ticked ones as pressed', () => {
    render(<MenuLabelPicker value={['hit', 'spicy']} onChange={() => undefined} />);
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(screen.getByTestId('menu-label-chip-spicy')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('menu-label-chip-hit')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('menu-label-chip-vegan')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Гостре' })).toBeInTheDocument();
  });

  it('adds a tapped label and returns the set in the list’s order, not the order of the taps', () => {
    const onChange = vi.fn();
    render(<MenuLabelPicker value={['hit']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('menu-label-chip-spicy'));
    expect(onChange).toHaveBeenLastCalledWith(['spicy', 'hit']);
    fireEvent.click(screen.getByTestId('menu-label-chip-recommended'));
    expect(onChange).toHaveBeenLastCalledWith(['hit', 'recommended']);
  });

  it('removes a label on a second tap, and can be emptied', () => {
    const onChange = vi.fn();
    render(<MenuLabelPicker value={['vegetarian', 'new']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('menu-label-chip-vegetarian'));
    expect(onChange).toHaveBeenLastCalledWith(['new']);
    fireEvent.click(screen.getByTestId('menu-label-chip-new'));
    expect(onChange).toHaveBeenLastCalledWith(['vegetarian']);
  });

  it('says «Новинка» and «Хіт» are the owner’s to set — and offers no chip that claims an allergen is absent', () => {
    render(<MenuLabelPicker value={[]} onChange={() => undefined} />);
    expect(screen.getByText(/ставите й знімаєте ви самі/)).toBeInTheDocument();
    expect(screen.queryByText(/глютен/i)).not.toBeInTheDocument();
  });
});
