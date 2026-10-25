// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The box a weighed row's quantity is typed into: «20,5» must survive as
// typed and reach its owner as 20.5 — a number box would have made it 205.

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DecimalInput, QuantityBox } from './DecimalInput';

function Harness({ initial = 1 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label>
        Вага
        <DecimalInput value={value} onValue={setValue} />
      </label>
      <output aria-label="число">{String(value)}</output>
      <button type="button" onClick={() => setValue(4)}>
        Ззовні
      </button>
    </>
  );
}

describe('DecimalInput', () => {
  it('keeps a half-typed weight on screen and hands over what it means so far', async () => {
    render(<Harness />);
    const box = screen.getByRole('textbox', { name: 'Вага' });
    await userEvent.clear(box);
    await userEvent.type(box, '20,');
    expect(box).toHaveValue('20,');
    expect(screen.getByLabelText('число')).toHaveTextContent('20');
    await userEvent.type(box, '5');
    expect(box).toHaveValue('20,5');
    expect(screen.getByLabelText('число')).toHaveTextContent('20.5');
  });

  it('leaves an emptied box empty, counting it as nothing', async () => {
    render(<Harness initial={3} />);
    const box = screen.getByRole('textbox', { name: 'Вага' });
    await userEvent.clear(box);
    expect(box).toHaveValue('');
    expect(screen.getByLabelText('число')).toHaveTextContent('0');
  });

  it('takes a value changed from outside — the pack toggle — over what was typed', async () => {
    render(<Harness />);
    const box = screen.getByRole('textbox', { name: 'Вага' });
    await userEvent.clear(box);
    await userEvent.type(box, '2,5');
    await userEvent.click(screen.getByRole('button', { name: 'Ззовні' }));
    expect(box).toHaveValue('4');
  });
});

describe('QuantityBox', () => {
  it('is the number box it always was for a row that is not weighed', () => {
    render(
      <label>
        К-сть
        <QuantityBox weighed={false} min={1} value={3} onValue={() => {}} />
      </label>
    );
    expect(screen.getByRole('spinbutton', { name: 'К-сть' })).toHaveValue(3);
  });
});
