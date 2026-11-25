// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { act, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableOfflineReads, useAuthStore, useCartStore, useOfflineStatus } from '@pos/platform';
import { forgetSides } from '../lib/sides';

const posRequest = vi.fn();
vi.mock('../lib/hostPlatform', async () => {
  const real = await vi.importActual<typeof import('../lib/hostPlatform')>('../lib/hostPlatform');
  return { ...real, posRequest: (...args: unknown[]) => posRequest(...args) };
});

const { CafeTileMarks, TILE_MARKS_NOT_CAFE_MS, TILE_MARKS_REFRESH_MS } = await import('./CafeTileMarks');

const STORE = 42;

const setup = (accepting: boolean) => ({
  as_cafe: {
    link: { status: 'active', transit_minutes: 15 },
    kitchen: { accepting, load_minutes: 0 },
    items: [{ cafe_variant_id: 10, prep_minutes: 15, available: true }],
  },
  as_kitchen: null,
});

const marks = () => useCartStore.getState().tileMarks['remote-kitchen'];

beforeAll(() => {
  // A till whose offline runtime keeps the store's `online` current (desktop/tablet).
  enableOfflineReads();
});

beforeEach(() => {
  forgetSides();
  posRequest.mockReset();
  localStorage.clear();
  useOfflineStatus.setState({ online: true });
  useAuthStore.setState({ auth: { store: { id: STORE } } } as never);
});
afterEach(() => {
  vi.useRealTimers();
  useOfflineStatus.setState({ online: true });
  useCartStore.getState().setTileMarks('remote-kitchen', null);
});

describe('the cafe’s kitchen-dish tiles', () => {
  it('puts the time on, greys them offline without asking the server, and takes them off when gone', async () => {
    posRequest.mockResolvedValue(setup(true));
    const view = render(<CafeTileMarks />);
    await vi.waitFor(() => expect(marks()).toEqual({ 10: { text: 'кухня ≈30 хв', blocked: false } }));
    expect(posRequest).toHaveBeenCalledWith('get', '/remote-kitchen/setup');

    posRequest.mockClear();
    useOfflineStatus.setState({ online: false });
    await vi.waitFor(() => expect(marks()).toEqual({ 10: { text: 'потрібна мережа', blocked: true } }));
    expect(posRequest).not.toHaveBeenCalled();

    view.unmount();
    expect(marks()).toBeUndefined();
  });

  it('says «пауза» while the kitchen takes nothing', async () => {
    posRequest.mockResolvedValue(setup(false));
    const view = render(<CafeTileMarks />);
    await vi.waitFor(() => expect(marks()).toEqual({ 10: { text: 'пауза', blocked: true } }));
    view.unmount();
  });

  it('keeps ONE loop however many refreshes overlap a read in flight', async () => {
    vi.useFakeTimers();
    let release: (value: unknown) => void = () => undefined;
    posRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    posRequest.mockResolvedValue(setup(true));
    const view = render(<CafeTileMarks />);
    // While the first read hangs: the till blinks offline and back, the tab comes back.
    act(() => {
      useOfflineStatus.setState({ online: false });
      useOfflineStatus.setState({ online: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {
      release(setup(true));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(marks()).toEqual({ 10: { text: 'кухня ≈30 хв', blocked: false } });

    // Every loop publishes once a tick: four ticks, four publishes — two loops would be eight.
    const original = useCartStore.getState().setTileMarks;
    const published = vi.fn(original);
    useCartStore.setState({ setTileMarks: published });
    posRequest.mockClear();
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(TILE_MARKS_REFRESH_MS * 4 + 100);
      });
      expect(posRequest).toHaveBeenCalledTimes(4);
      expect(published).toHaveBeenCalledTimes(4);
    } finally {
      useCartStore.setState({ setTileMarks: original });
    }
    view.unmount();
  });

  it('does not wake on the offline store’s other updates (pending counts after a sale)', async () => {
    posRequest.mockResolvedValue(setup(true));
    const view = render(<CafeTileMarks />);
    await vi.waitFor(() => expect(marks()).toBeDefined());
    forgetSides();
    posRequest.mockClear();
    useOfflineStatus.setState({ pending: 3 });
    useOfflineStatus.setState({ syncing: true });
    useOfflineStatus.setState({ syncing: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(posRequest).not.toHaveBeenCalled();
    view.unmount();
  });

  it('in a store that asks no kitchen, reads the setup every ten minutes, not every half minute', async () => {
    vi.useFakeTimers();
    posRequest.mockResolvedValue({ as_cafe: null, as_kitchen: { status: { accepting: true } } });
    const view = render(<CafeTileMarks />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(posRequest).toHaveBeenCalledTimes(1);
    expect(marks()).toBeUndefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TILE_MARKS_REFRESH_MS * 5);
    });
    expect(posRequest).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TILE_MARKS_NOT_CAFE_MS);
    });
    expect(posRequest).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('greys the kitchen’s dishes on a till that starts offline, from what the last session kept', async () => {
    // Yesterday, online: the setup is read and kept on this device.
    posRequest.mockResolvedValue(setup(true));
    const first = render(<CafeTileMarks />);
    await vi.waitFor(() => expect(marks()).toEqual({ 10: { text: 'кухня ≈30 хв', blocked: false } }));
    first.unmount();

    // This morning, before the internet is up.
    forgetSides();
    posRequest.mockReset();
    useOfflineStatus.setState({ online: false });
    const view = render(<CafeTileMarks />);
    await vi.waitFor(() => expect(marks()).toEqual({ 10: { text: 'потрібна мережа', blocked: true } }));
    expect(posRequest).not.toHaveBeenCalled();
    view.unmount();
  });
});
