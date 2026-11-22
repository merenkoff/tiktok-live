// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The attribution is read from the cached login, and every document a
// customer takes away carries it — the kitchen's ticket never does.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { db } from '../offline/db';
import { ATTRIBUTION_LINES, storeAttribution } from './attribution';
import {
  printKitchenTicket,
  printPrecheck,
  printReceipt,
  printSlip,
  type KitchenTicketData,
  type PrecheckData,
  type ReceiptData,
  type SlipData,
} from './printer';

function login(store: Record<string, unknown>) {
  localStorage.setItem('pos_auth', JSON.stringify({ token: 't', store }));
}

afterEach(() => localStorage.clear());

describe('storeAttribution', () => {
  it('is the flag the login carries', () => {
    login({ attribution: true });
    expect(storeAttribution()).toBe(true);
    login({ attribution: false });
    expect(storeAttribution()).toBe(false);
  });

  it('is off without a login, for a login from an older server and for a mangled cache', () => {
    expect(storeAttribution()).toBe(false);
    login({ name: 'Крамниця' });
    expect(storeAttribution()).toBe(false);
    login({ attribution: 'yes' });
    expect(storeAttribution()).toBe(false);
    localStorage.setItem('pos_auth', '{not json');
    expect(storeAttribution()).toBe(false);
  });

  it('says exactly what the attribution form prescribes', () => {
    expect(ATTRIBUTION_LINES).toEqual(['Каса: The Live Shop', 'the-live.shop']);
  });
});

describe('what goes to the printer', () => {
  beforeEach(async () => {
    vi.mocked(invoke).mockClear();
    await db.meta.clear();
  });

  it('the receipt, the pre-bill and the slip carry the flag; the kitchen ticket does not', async () => {
    login({ attribution: true });
    await printReceipt('P', { store_name: 'Тест' } as ReceiptData, 58);
    await printPrecheck('P', { table_name: '5', items: [] } as unknown as PrecheckData, 58);
    await printSlip('P', { title: 'ПІД ЗАПИС' } as SlipData, 58);
    await printKitchenTicket('P', { order_label: '17', items: [] } as unknown as KitchenTicketData, 58);

    const args = (command: string) =>
      vi.mocked(invoke).mock.calls.find(([name]) => name === command)?.[1] as Record<string, Record<string, unknown>>;
    expect(args('print_receipt').receipt.attribution).toBe(true);
    expect(args('print_precheck').bill.attribution).toBe(true);
    expect(args('print_slip').slip.attribution).toBe(true);
    expect(args('print_kitchen_ticket').ticket).not.toHaveProperty('attribution');
  });
});
