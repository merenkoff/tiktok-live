// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore, useCartStore, useOfflineStatus } from '@pos/platform';
import { forgetSides } from '../lib/sides';

const posRequest = vi.fn();
vi.mock('../lib/hostPlatform', async () => {
  const real = await vi.importActual<typeof import('../lib/hostPlatform')>('../lib/hostPlatform');
  return { ...real, posRequest: (...args: unknown[]) => posRequest(...args) };
});

const { CafeTileMarks } = await import('./CafeTileMarks');

const setup = (accepting: boolean) => ({
  as_cafe: {
    link: { status: 'active', transit_minutes: 15 },
    kitchen: { accepting, load_minutes: 0 },
    items: [{ cafe_variant_id: 10, prep_minutes: 15 }],
  },
  as_kitchen: null,
});

const marks = () => useCartStore.getState().tileMarks['remote-kitchen'];

beforeEach(() => {
  forgetSides();
  posRequest.mockReset();
  useOfflineStatus.setState({ online: true });
});
afterEach(() => {
  useOfflineStatus.setState({ online: true });
});

describe('the cafe’s kitchen-dish tiles', () => {
  it('puts the time on, says «дзвінок на кухню» offline without asking the server, and takes them off when gone', async () => {
    posRequest.mockResolvedValue(setup(true));
    const view = render(<CafeTileMarks />);
    await vi.waitFor(() => expect(marks()).toEqual({ 10: { text: 'кухня ≈30 хв', blocked: false } }));
    expect(posRequest).toHaveBeenCalledWith('get', '/remote-kitchen/setup');

    posRequest.mockClear();
    useOfflineStatus.setState({ online: false });
    await vi.waitFor(() => expect(marks()).toEqual({ 10: { text: 'дзвінок на кухню', blocked: false } }));
    expect(posRequest).not.toHaveBeenCalled();

    view.unmount();
    expect(marks()).toBeUndefined();
  });

  it('a till that starts offline marks the dishes from the setup it kept, its own store’s only', async () => {
    localStorage.clear();
    useAuthStore.setState({ auth: { store: { id: 7 } } } as never);
    posRequest.mockResolvedValue(setup(true));
    const first = render(<CafeTileMarks />);
    await vi.waitFor(() => expect(marks()).toEqual({ 10: { text: 'кухня ≈30 хв', blocked: false } }));
    first.unmount();

    forgetSides();
    posRequest.mockReset();
    posRequest.mockRejectedValue(new Error('Network Error'));
    useOfflineStatus.setState({ online: false });
    const offline = render(<CafeTileMarks />);
    await vi.waitFor(() => expect(marks()).toEqual({ 10: { text: 'дзвінок на кухню', blocked: false } }));
    offline.unmount();

    // Signed in to another store: nothing kept is that store's.
    useAuthStore.setState({ auth: { store: { id: 8 } } } as never);
    const other = render(<CafeTileMarks />);
    await new Promise((r) => setTimeout(r, 0));
    expect(marks()).toBeUndefined();
    other.unmount();
    useAuthStore.setState({ auth: null } as never);
  });

  it('says «пауза» while the kitchen takes nothing', async () => {
    posRequest.mockResolvedValue(setup(false));
    const view = render(<CafeTileMarks />);
    await vi.waitFor(() => expect(marks()).toEqual({ 10: { text: 'пауза', blocked: true } }));
    view.unmount();
  });
});
