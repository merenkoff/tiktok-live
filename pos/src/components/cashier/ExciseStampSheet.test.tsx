// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The excise stamps sheet (track ДК, ДК4, Д4): «Скануйте марку k з N», a
// typed or scanned stamp goes onto the line short of one, a misread or a
// repeated stamp is refused on the spot, and payment waits for every bottle.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CartLine } from '@pos/platform';
import { renderWithProviders } from '../../test/utils';
import { ExciseStampSheet } from './ExciseStampSheet';

const bottle = (over: Partial<CartLine> = {}): CartLine => ({
  uid: '7',
  variant_id: 7,
  product_name: 'Горілка 0,5 л',
  variant_label: '',
  unit: 'шт',
  unit_price_cents: 30_000,
  quantity: 2,
  max_quantity: 10,
  excise_per_unit: true,
  ...over,
});

function setup(lines: CartLine[]) {
  const onSetLabels = vi.fn();
  const onDone = vi.fn();
  renderWithProviders(
    <ExciseStampSheet lines={lines} onSetLabels={onSetLabels} onDone={onDone} onClose={vi.fn()} />,
    { shell: 'cashier' }
  );
  return { onSetLabels, onDone };
}

const type = (text: string) => {
  fireEvent.change(screen.getByTestId('excise-input'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Додати' }));
};

describe('ExciseStampSheet', () => {
  it('asks for the next stamp of the line short of one and adds a typed one, normalised', () => {
    const { onSetLabels, onDone } = setup([bottle({ excise_labels: ['AATE508932 0000412168'] })]);
    expect(screen.getByTestId('excise-current')).toHaveTextContent('Скануйте марку 2 з 2');
    type('aate508932  0000412169');
    expect(onSetLabels).toHaveBeenCalledWith('7', ['AATE508932 0000412168', 'AATE508932 0000412169']);
    expect(screen.getByTestId('excise-done')).toBeDisabled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('refuses a misread and a stamp already scanned', () => {
    const { onSetLabels } = setup([bottle({ excise_labels: ['AATE508932 0000412168'] })]);
    type('12-34');
    expect(screen.getByTestId('excise-note')).toHaveTextContent('не схоже на акцизну марку');
    type('AATE508932 0000412168');
    expect(screen.getByTestId('excise-note')).toHaveTextContent('уже відскановано');
    expect(onSetLabels).not.toHaveBeenCalled();
  });

  it('goes on to payment once every bottle has its stamp, and lets one be taken off', () => {
    const { onSetLabels, onDone } = setup([bottle({ quantity: 1, excise_labels: ['AATE508932 0000412168'] })]);
    expect(screen.getByText('Усі марки відскановано')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('excise-done'));
    expect(onDone).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати марку AATE508932 0000412168' }));
    expect(onSetLabels).toHaveBeenCalledWith('7', []);
  });

  it('shows the server’s refusal first', () => {
    render(
      <ExciseStampSheet
        lines={[bottle()]}
        error="Марку AATE508932 0000412168 уже продано"
        onSetLabels={vi.fn()}
        onDone={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('excise-error')).toHaveTextContent('уже продано');
  });
});
