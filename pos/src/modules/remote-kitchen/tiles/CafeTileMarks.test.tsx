// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore, useOfflineStatus } from '@pos/platform';
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
});
