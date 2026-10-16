// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The chime rings for something NEW from a guest's phone, never for the same
// thing read again, never for what was already there when the screen opened,
// and never when the waiter switched it off.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const oscillators: number[] = [];
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => undefined);
  createOscillator() {
    const osc = {
      type: 'sine',
      frequency: { value: 0 },
      connect: () => ({ connect: () => undefined }),
      start: () => oscillators.push(osc.frequency.value),
      stop: () => undefined,
    };
    return osc;
  }
  createGain() {
    return { gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined }, connect: () => undefined };
  }
}

const vibrate = vi.fn();

beforeEach(() => {
  oscillators.length = 0;
  vibrate.mockReset();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  localStorage.removeItem('tables:chime');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const { useNotifyChime, useChimeSetting, readChimeSetting } = await import('./useNotifyChime');

const keys = (...k: string[]): Set<string> => new Set(k);

describe('useNotifyChime', () => {
  it('stays silent on the first answer, then rings once for each poll that brings something new', () => {
    let current = keys('call:1');
    const { rerender } = renderHook(({ k, ready }) => useNotifyChime(k, ready, true), {
      initialProps: { k: keys(), ready: false },
    });
    rerender({ k: current, ready: true });
    expect(vibrate).not.toHaveBeenCalled();

    // The same call read again by the next poll — a new Set, the same keys.
    current = keys('call:1');
    rerender({ k: current, ready: true });
    expect(vibrate).not.toHaveBeenCalled();

    rerender({ k: keys('call:1', 'sent:4'), ready: true });
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(oscillators).toEqual([880, 1320]);

    // Something went away: nothing new, nothing rings.
    rerender({ k: keys('sent:4'), ready: true });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('rings for the same table calling again after the waiter answered — it is a new call', () => {
    const { rerender } = renderHook(({ k }) => useNotifyChime(k, true, true), { initialProps: { k: keys('call:1') } });
    rerender({ k: keys() });
    rerender({ k: keys('call:2') });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('is silent when switched off, and does not ring for what arrived meanwhile once switched back on', () => {
    const { rerender } = renderHook(({ k, on }) => useNotifyChime(k, true, on), {
      initialProps: { k: keys('call:1'), on: false },
    });
    rerender({ k: keys('call:1', 'call:2'), on: false });
    expect(vibrate).not.toHaveBeenCalled();
    rerender({ k: keys('call:1', 'call:2'), on: true });
    expect(vibrate).not.toHaveBeenCalled();
    rerender({ k: keys('call:1', 'call:2', 'order:3'), on: true });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('still buzzes on a device with no Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const { rerender } = renderHook(({ k }) => useNotifyChime(k, true, true), { initialProps: { k: keys() } });
    rerender({ k: keys('call:9') });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});

describe('the waiter’s switch', () => {
  it('is on unless this device remembers «off»', () => {
    expect(readChimeSetting()).toBe(true);
    const { result } = renderHook(() => useChimeSetting());
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('tables:chime')).toBe('off');
    expect(readChimeSetting()).toBe(false);
    act(() => result.current[1](true));
    expect(readChimeSetting()).toBe(true);
  });
});
