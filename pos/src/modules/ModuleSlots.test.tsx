// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Two modules in one slot must not be able to take each other down, and a
// module that throws leaves a trace and nothing on the screen (phase Г2).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModuleSlots } from './ModuleSlots';
import { getModuleEventLog } from './telemetry';

afterEach(() => {
  vi.restoreAllMocks();
});

function Good({ customerId }: { customerId: number; place: 'cart' | 'card' }) {
  return <p>Борг покупця {customerId}</p>;
}

function Broken(): JSX.Element {
  throw new Error('module bug');
}

describe('ModuleSlots', () => {
  it('draws every module with the same props', () => {
    render(
      <ModuleSlots
        slots={[{ value: Good, moduleId: 'debts' }]}
        slot="customer.Panel"
        props={{ customerId: 7, place: 'cart' as const }}
      />
    );
    expect(screen.getByText('Борг покупця 7')).toBeInTheDocument();
  });

  it('keeps the healthy module when its neighbour throws, and reports the broken one', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ModuleSlots
        slots={[
          { value: Broken as unknown as typeof Good, moduleId: 'scales' },
          { value: Good, moduleId: 'debts' },
        ]}
        slot="customer.Panel"
        props={{ customerId: 3, place: 'card' as const }}
      />
    );
    expect(screen.getByText('Борг покупця 3')).toBeInTheDocument();
    const event = getModuleEventLog().filter((e) => e.type === 'module_slot_error').at(-1);
    expect(event).toMatchObject({ type: 'module_slot_error', slot: 'customer.Panel', moduleId: 'scales' });
  });

  it('hands the error to the caller when the caller names the event itself', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    render(
      <ModuleSlots
        slots={[{ value: Broken as unknown as () => null, moduleId: 'debts' }]}
        slot="settings.Card"
        props={{}}
        onError={onError}
      />
    );
    expect(onError).toHaveBeenCalledWith('debts', expect.any(Error));
  });
});
