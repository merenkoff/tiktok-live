// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The composition editor: what one bouquet is made of.
//
// What is pinned here is the contract it shares with the server — the
// composition is replaced wholesale, so removing a component has to be
// expressible, and the same component may never appear twice on one composite.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProductComponentInput } from '../../../types';
import { CompositionEditor } from './CompositionEditor';
import type { ComponentOption } from './componentOptions';

const OPTIONS: ComponentOption[] = [
  { variant_id: 10, caption: 'Троянда · Червона', unit: 'шт', quantity: 100 },
  { variant_id: 11, caption: 'Евкаліпт · Зелений', unit: 'шт', quantity: 40 },
  { variant_id: 12, caption: 'Крафт-пакування', unit: 'шт', quantity: 90 },
];

function setup(value: ProductComponentInput[] = []) {
  const onChange = vi.fn<[ProductComponentInput[]], void>();
  render(<CompositionEditor value={value} options={OPTIONS} onChange={onChange} />);
  return { onChange };
}

describe('CompositionEditor', () => {
  it('says so when a composite has nothing in it', () => {
    setup();
    expect(screen.getByText(/Порожньо/)).toBeInTheDocument();
  });

  it('adds a component with its quantity', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.selectOptions(screen.getByLabelText('Складник'), '10');
    const qty = screen.getByLabelText('Кількість складника');
    await user.clear(qty);
    await user.type(qty, '9');
    await user.click(screen.getByRole('button', { name: 'Додати' }));

    expect(onChange).toHaveBeenCalledWith([{ component_variant_id: 10, quantity: 9 }]);
  });

  it('will not offer a component that is already in the composition', async () => {
    setup([{ component_variant_id: 10, quantity: 5 }]);
    const picker = screen.getByLabelText('Складник') as HTMLSelectElement;
    const offered = Array.from(picker.options).map((o) => o.textContent);
    expect(offered).not.toContain('Троянда · Червона');
    expect(offered).toContain('Евкаліпт · Зелений');
  });

  it('shows each row in the component’s own unit', () => {
    setup([{ component_variant_id: 10, quantity: 5 }]);
    expect(screen.getByText('Троянда · Червона')).toBeInTheDocument();
    expect((screen.getByLabelText('Кількість') as HTMLInputElement).value).toBe('5');
  });

  it('removes a component — the server replaces the composition wholesale', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([
      { component_variant_id: 10, quantity: 5 },
      { component_variant_id: 11, quantity: 3 },
    ]);

    await user.click(screen.getAllByRole('button', { name: 'Прибрати' })[0]);
    expect(onChange).toHaveBeenCalledWith([{ component_variant_id: 11, quantity: 3 }]);
  });

  it('refuses to add nothing', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    expect(screen.getByRole('button', { name: 'Додати' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Складник'), '10');
    const qty = screen.getByLabelText('Кількість складника');
    await user.clear(qty);
    await user.click(screen.getByRole('button', { name: 'Додати' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
