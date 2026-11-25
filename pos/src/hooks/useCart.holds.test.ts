// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A module's hold on «Оплатити» (platform 25, TechDocs/POS_REMOTE_KITCHEN.md
// §11). Holds are kept per module: with one shared field, the first module to
// lift its hold would lift every other module's too, and a cart that one of
// them still refuses would go to payment.

import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from './useCart';

describe('useCartStore — checkout holds', () => {
  beforeEach(() => useCartStore.getState().clear());

  it('keeps each module’s hold apart: lifting one leaves the other', () => {
    const { setCheckoutHold } = useCartStore.getState();
    setCheckoutHold('remote-kitchen', 'Спершу запитайте кухню');
    setCheckoutHold('another', 'Інша причина');
    expect(useCartStore.getState().checkoutHolds).toEqual({
      'remote-kitchen': 'Спершу запитайте кухню',
      another: 'Інша причина',
    });

    setCheckoutHold('remote-kitchen', null);
    expect(useCartStore.getState().checkoutHolds).toEqual({ another: 'Інша причина' });
  });

  it('does not touch the state when a module repeats what it already said', () => {
    useCartStore.getState().setCheckoutHold('remote-kitchen', 'Спершу запитайте кухню');
    const before = useCartStore.getState().checkoutHolds;
    useCartStore.getState().setCheckoutHold('remote-kitchen', 'Спершу запитайте кухню');
    expect(useCartStore.getState().checkoutHolds).toBe(before);
    useCartStore.getState().setCheckoutHold('nobody', null);
    expect(useCartStore.getState().checkoutHolds).toBe(before);
  });

  it('starts a new cart with no hold and no kitchen order', () => {
    useCartStore.getState().setCheckoutHold('remote-kitchen', 'Спершу запитайте кухню');
    useCartStore.getState().setRemoteOrderId(5, 30);
    useCartStore.getState().setRemotePhone({ minutes: 40, agreed_at: '2026-11-25T18:00:00.000Z' });
    useCartStore.getState().clear();
    expect(useCartStore.getState().checkoutHolds).toEqual({});
    expect(useCartStore.getState().remoteOrderId).toBeNull();
    expect(useCartStore.getState().remotePhone).toBeNull();
    expect(useCartStore.getState().remoteQuotedMinutes).toBeNull();
  });

  it('keeps the time the guest agreed to with the kitchen order, and drops it with the order (РК4)', () => {
    const { setRemoteOrderId } = useCartStore.getState();
    setRemoteOrderId(5, 35);
    expect(useCartStore.getState()).toMatchObject({ remoteOrderId: 5, remoteQuotedMinutes: 35 });
    // An older module says only the id: nothing is checked then.
    setRemoteOrderId(5);
    expect(useCartStore.getState().remoteQuotedMinutes).toBeNull();
    setRemoteOrderId(null, 35);
    expect(useCartStore.getState()).toMatchObject({ remoteOrderId: null, remoteQuotedMinutes: null });
  });

  it('keeps the same phone agreement as it was, so a repeat is no change', () => {
    const { setRemotePhone } = useCartStore.getState();
    setRemotePhone({ minutes: 40, agreed_at: '2026-11-25T18:00:00.000Z' });
    const before = useCartStore.getState().remotePhone;
    setRemotePhone({ minutes: 40, agreed_at: '2026-11-25T18:00:00.000Z' });
    expect(useCartStore.getState().remotePhone).toBe(before);
    setRemotePhone(null);
    expect(useCartStore.getState().remotePhone).toBeNull();
  });
});

describe('useCartStore — tile marks', () => {
  beforeEach(() => useCartStore.getState().setTileMarks('remote-kitchen', null));

  it('keeps each module’s marks apart, survives a new cart, and comes off on null', () => {
    const { setTileMarks } = useCartStore.getState();
    setTileMarks('remote-kitchen', { 10: { text: '≈30 хв', blocked: false } });
    setTileMarks('another', { 11: { text: 'інше', blocked: true } });
    useCartStore.getState().clear();
    expect(useCartStore.getState().tileMarks).toEqual({
      'remote-kitchen': { 10: { text: '≈30 хв', blocked: false } },
      another: { 11: { text: 'інше', blocked: true } },
    });
    setTileMarks('another', null);
    expect(Object.keys(useCartStore.getState().tileMarks)).toEqual(['remote-kitchen']);
  });

  it('does not touch the state when a module publishes the same marks again', () => {
    useCartStore.getState().setTileMarks('remote-kitchen', { 10: { text: '≈30 хв', blocked: false } });
    const before = useCartStore.getState().tileMarks;
    useCartStore.getState().setTileMarks('remote-kitchen', { 10: { text: '≈30 хв', blocked: false } });
    useCartStore.getState().setTileMarks('nobody', {});
    expect(useCartStore.getState().tileMarks).toBe(before);
    useCartStore.getState().setTileMarks('remote-kitchen', { 10: { text: 'пауза', blocked: true } });
    expect(useCartStore.getState().tileMarks).not.toBe(before);
  });
});
