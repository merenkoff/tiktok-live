// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Пляшка за маркою, мл» (ДК5, Д10): offers the pack's size only when the pack
// is one bottle, and says before saving what the server would refuse.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottleField } from './BottleField';

const excise = { on: true, perUnit: false, uktzed: '2208601100' };

describe('BottleField', () => {
  it('offers the pack’s size when the pack is one bottle, never a case', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BottleField value="" unit="мл" pack={{ qty: '500', label: 'пляшка' }} excise={excise} onChange={onChange} />
    );
    fireEvent.click(screen.getByTestId('variant-bottle-from-pack'));
    expect(onChange).toHaveBeenCalledWith('500');

    rerender(<BottleField value="" unit="мл" pack={{ qty: '3000', label: 'ящик' }} excise={excise} onChange={onChange} />);
    expect(screen.queryByTestId('variant-bottle-from-pack')).toBeNull();
  });

  it('says what the server would refuse, before saving', () => {
    const pack = { qty: '', label: '' };
    const { rerender } = render(
      <BottleField value="500" unit="мл" pack={pack} excise={{ on: false, perUnit: false, uktzed: '' }} onChange={() => {}} />
    );
    expect(screen.getByTestId('variant-bottle')).toHaveTextContent('Позначте товар підакцизним');
    rerender(<BottleField value="500" unit="мл" pack={pack} excise={{ ...excise, perUnit: true }} onChange={() => {}} />);
    expect(screen.getByTestId('variant-bottle')).toHaveTextContent('продається цілими пляшками');
    rerender(<BottleField value="500" unit="шт" pack={pack} excise={excise} onChange={() => {}} />);
    expect(screen.getByTestId('variant-bottle')).toHaveTextContent('у мл');
    rerender(<BottleField value="500" unit="мл" pack={pack} excise={excise} onChange={() => {}} />);
    expect(screen.getByTestId('variant-bottle')).toHaveTextContent('Марку нової пляшки сканують');
  });
});
