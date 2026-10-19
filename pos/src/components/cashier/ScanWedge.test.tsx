// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { PosShellContext, type PosShell } from '../../shell';
import { ScanWedge } from './ScanWedge';

let clock = 1_000;

afterEach(() => {
  clock += 10_000;
});

/**
 * What a keyboard does for one key: a keydown at a chosen time on whatever
 * has the focus, then — unless something prevented it — the character typed
 * into a focused field.
 */
function press(key: string, { gap = 4, code }: { gap?: number; code?: string } = {}): KeyboardEvent {
  clock += gap;
  const target = (document.activeElement ?? document.body) as HTMLElement;
  const event = new KeyboardEvent('keydown', {
    key,
    code: code ?? (/^[0-9]$/.test(key) ? `Digit${key}` : key === 'Enter' ? 'Enter' : ''),
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'timeStamp', { value: clock });
  const proceed = target.dispatchEvent(event);
  if (proceed && key.length === 1 && target instanceof HTMLInputElement) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, target.value + key);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return event;
}

/** A scanner's burst, after a pause — nobody scans mid-word. */
function scan(code: string, gap = 4): KeyboardEvent {
  [...code].forEach((ch, i) => press(ch, { gap: i === 0 ? 500 : gap }));
  return press('Enter', { gap });
}

/** A search box under React's control, as the catalogs have one. */
function Search() {
  const [q, setQ] = useState('');
  return <input aria-label="Пошук" value={q} onChange={(e) => setQ(e.target.value)} />;
}

function mount(shell: PosShell, active: boolean, extra?: ReactNode, onScan = vi.fn()) {
  const utils = render(
    <PosShellContext.Provider value={shell}>
      <ScanWedge active={active} onScan={onScan} />
      <button type="button" onClick={() => onScan('TAPPED')}>
        Джинси
      </button>
      <Search />
      {extra}
    </PosShellContext.Provider>
  );
  const search = utils.getByLabelText('Пошук') as HTMLInputElement;
  const tile = utils.getByRole('button', { name: 'Джинси' });
  return { ...utils, onScan, search, tile };
}

describe('ScanWedge', () => {
  it('takes a scan with nothing focused — after «Очистити чек» the focus is on the page', () => {
    const { onScan } = mount('cashier', true);
    expect(document.activeElement).toBe(document.body);

    scan('4820000000213');
    expect(onScan).toHaveBeenCalledWith('4820000000213');
  });

  it('takes a scan while a tile has the focus, and the scanner’s Enter does not press the tile', () => {
    const { onScan, tile } = mount('cashier', true);
    tile.focus();

    const enter = scan('4820000000213');
    expect(enter.defaultPrevented).toBe(true);
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('4820000000213');
  });

  it('takes a scan into the search box and leaves the box as the cashier had it', () => {
    const { onScan, search } = mount('cashier', true);
    search.focus();
    for (const ch of 'дж') press(ch, { gap: 200, code: 'KeyX' });
    expect(search.value).toBe('дж');

    scan('4820000000213');
    expect(onScan).toHaveBeenCalledWith('4820000000213');
    expect(search.value).toBe('дж');
  });

  it('leaves the search box to the cashier’s own typing', () => {
    const { onScan, search } = mount('cashier', true);
    search.focus();

    const enter = scan('4820000000213', 150);
    expect(onScan).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(false);
    expect(search.value).toBe('4820000000213');
  });

  it('takes no scan while the catalog is covered, and the scanner’s Enter presses nothing', () => {
    const { onScan, tile } = mount('cashier', false);
    tile.focus();
    const enter = scan('4820000000213');
    expect(onScan).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(true);
  });

  it('keeps a scan out of the field that has the focus while covered — the cash field of the payment', () => {
    const { onScan, search: cash } = mount('cashier', false);
    cash.focus();
    for (const ch of '500') press(ch, { gap: 200 });

    const enter = scan('4820000000213');
    expect(onScan).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(true);
    expect(cash.value).toBe('500');
  });

  it('leaves the cashier’s own typing and Enter alone while covered', () => {
    const { tile, search } = mount('cashier', false);
    search.focus();
    expect(scan('1500', 150).defaultPrevented).toBe(false);
    expect(search.value).toBe('1500');

    tile.focus();
    expect(press('Enter', { gap: 900 }).defaultPrevented).toBe(false);
  });

  it('keeps out of a dialog someone else opened — the receipt’s «Очистити чек?» — and does not press its buttons', () => {
    const { onScan } = mount(
      'cashier',
      true,
      <div role="alertdialog" aria-label="Очистити чек?">
        <button type="button">Скасувати</button>
      </div>
    );
    (document.querySelector('[role="alertdialog"] button') as HTMLButtonElement).focus();
    const enter = scan('4820000000213');
    expect(onScan).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(true);
  });

  it('takes scans again once the dialog is gone', () => {
    const onScan = vi.fn();
    function Screen({ asking }: { asking: boolean }) {
      return (
        <PosShellContext.Provider value="cashier">
          <ScanWedge active onScan={onScan} />
          {asking && <div role="alertdialog" aria-label="Очистити чек?" />}
        </PosShellContext.Provider>
      );
    }
    const { rerender } = render(<Screen asking />);
    scan('4820000000213');
    expect(onScan).not.toHaveBeenCalled();

    rerender(<Screen asking={false} />);
    scan('4820000000220');
    expect(onScan).toHaveBeenCalledWith('4820000000220');
  });

  it('works inside a dialog it belongs to', () => {
    const onScan = vi.fn();
    render(
      <PosShellContext.Provider value="cashier">
        <div role="dialog" aria-label="Стіл 5">
          <ScanWedge active onScan={onScan} />
        </div>
      </PosShellContext.Provider>
    );
    scan('4820000000213');
    expect(onScan).toHaveBeenCalledWith('4820000000213');
  });

  it('stops listening when it unmounts', () => {
    const { onScan, unmount } = mount('cashier', true);
    unmount();
    scan('4820000000213');
    expect(onScan).not.toHaveBeenCalled();
  });

  it('works on the web too — a laptop at the counter may have a USB scanner', () => {
    const { onScan } = mount('web', true);
    scan('4820000000213');
    expect(onScan).toHaveBeenCalledWith('4820000000213');
  });

  it('does not exist on the tablet: no scanner there, and no focused input to raise the keyboard', () => {
    const onScan = vi.fn();
    const { container } = render(
      <PosShellContext.Provider value="tablet">
        <ScanWedge active onScan={onScan} />
      </PosShellContext.Provider>
    );
    expect(container.innerHTML).toBe('');
    scan('4820000000213');
    expect(onScan).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });
});
