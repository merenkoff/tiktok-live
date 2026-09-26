// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { PosShellContext, type PosShell } from '../../shell';
import { ScanWedge } from './ScanWedge';

function mount(shell: PosShell, active: boolean, onScan = vi.fn()) {
  const utils = render(
    <PosShellContext.Provider value={shell}>
      <ScanWedge active={active} onScan={onScan} />
    </PosShellContext.Provider>
  );
  return { ...utils, onScan, input: utils.container.querySelector('input') };
}

describe('ScanWedge', () => {
  it('holds the focus on a till while the catalog is the active surface, and lets go when it is not', () => {
    const { input, rerender, onScan } = mount('cashier', true);
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input!, { target: { value: '4820000000017' } });
    fireEvent.keyDown(input!, { key: 'Enter' });
    expect(onScan).toHaveBeenCalledWith('4820000000017');
    expect(input!.value).toBe('');

    rerender(
      <PosShellContext.Provider value="cashier">
        <ScanWedge active={false} onScan={onScan} />
      </PosShellContext.Provider>
    );
    expect(document.activeElement).not.toBe(input);
  });

  it('works on the web too — a laptop at the counter may have a USB scanner', () => {
    const { input } = mount('web', true);
    expect(document.activeElement).toBe(input);
  });

  it('does not exist on the tablet: a focused input, even invisible, is the on-screen keyboard', () => {
    const { input, container } = mount('tablet', true);
    expect(input).toBeNull();
    expect(container.innerHTML).toBe('');
    expect(document.activeElement).toBe(document.body);
  });
});
