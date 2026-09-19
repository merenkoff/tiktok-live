// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The chips a product's questions are picked with: the order they are tapped
// in is the order the till asks them in, and it travels as a whole.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ModifierGroup } from '../../../types';
import { ModifierGroupChips } from './ModifierGroupChips';

function group(id: number, name: string, over: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id,
    name,
    min_select: 1,
    max_select: 1,
    sort_order: 0,
    is_active: true,
    modifiers: [],
    ...over,
  };
}

const groups = [group(1, 'Молоко'), group(2, 'Сироп', { min_select: 0, max_select: 3 })];

describe('ModifierGroupChips', () => {
  it('appends on a tap and numbers the chips in the order they were tapped', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ModifierGroupChips groups={groups} value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('modifier-group-chip-2'));
    expect(onChange).toHaveBeenLastCalledWith([2]);

    rerender(<ModifierGroupChips groups={groups} value={[2]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('modifier-group-chip-1'));
    expect(onChange).toHaveBeenLastCalledWith([2, 1]);

    rerender(<ModifierGroupChips groups={groups} value={[2, 1]} onChange={onChange} />);
    expect(screen.getByTestId('modifier-group-chip-2')).toHaveTextContent('1');
    expect(screen.getByTestId('modifier-group-chip-1')).toHaveTextContent('2');
  });

  it('removes on a second tap, keeping the others in place', () => {
    const onChange = vi.fn();
    render(<ModifierGroupChips groups={groups} value={[2, 1]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('modifier-group-chip-2'));
    expect(onChange).toHaveBeenLastCalledWith([1]);
  });

  it('says which questions are required and hides an inactive group unless the product still asks it', () => {
    const gone = group(3, 'Стара', { is_active: false });
    const { rerender } = render(
      <ModifierGroupChips groups={[...groups, gone]} value={[]} onChange={() => {}} />
    );
    expect(screen.getByTestId('modifier-group-chip-1')).toHaveTextContent('обовʼязково');
    expect(screen.getByTestId('modifier-group-chip-2')).toHaveTextContent('за бажанням');
    expect(screen.queryByTestId('modifier-group-chip-3')).toBeNull();

    rerender(<ModifierGroupChips groups={[...groups, gone]} value={[3]} onChange={() => {}} />);
    expect(screen.getByTestId('modifier-group-chip-3')).toBeInTheDocument();
  });

  it('points at the modifiers page when there is nothing to pick from', () => {
    render(<ModifierGroupChips groups={[]} value={[]} onChange={() => {}} />);
    expect(screen.getByText(/Немає груп/)).toBeInTheDocument();
  });
});
