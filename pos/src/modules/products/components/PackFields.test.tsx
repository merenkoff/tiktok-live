// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The «Фасування» block on the product card (migration 054, phase К5b).
//
// Both halves or neither — the server refuses half a pair by name, and this
// block is what tells the owner before they press save.

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { PackFields } from './PackFields';

function open(props: Partial<Parameters<typeof PackFields>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <PackFields qty="" label="" unit="мл" onChange={onChange} {...props} />
  );
  return onChange;
}

describe('PackFields', () => {
  it('names the variant’s own unit, so «скільки мл» is the question asked', () => {
    open();
    expect(screen.getByText('Скільки мл в упаковці')).toBeInTheDocument();
  });

  it('says what the pair means once both halves are there', () => {
    open({ qty: '1000', label: 'пляшка' });
    expect(screen.getByText(/1 × пляшка = 1000 мл/)).toBeInTheDocument();
  });

  // The pair is the whole rule: a pack with no name cannot be read off a
  // screen, a name with no number cannot be converted.
  it('asks for the other half rather than letting the save fail', () => {
    open({ qty: '1000', label: '' });
    expect(
      screen.getByText('Заповніть обидва поля або залиште обидва порожніми.')
    ).toBeInTheDocument();
  });

  it('is plainly optional when both are empty', () => {
    open();
    expect(screen.getByText(/Не обовʼязково/)).toBeInTheDocument();
  });

  it('hands both halves back on every keystroke', async () => {
    const onChange = open({ qty: '1000', label: '' });
    await userEvent.type(screen.getByPlaceholderText('пляшка'), 'я');
    expect(onChange).toHaveBeenCalledWith({ qty: '1000', label: 'я' });
  });
});
