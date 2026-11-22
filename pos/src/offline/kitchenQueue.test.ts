// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The station printers' loop for a table's rounds (TechDocs/POS_TABLES.md
// §11): asks only with a kitchen printer set, prints each ticket on its
// station's printer (the bar on the kitchen's when it has none of its own),
// confirms it, and rests after a print that failed instead of confirming it.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundPrintJob } from '../types';
import {
  BAR_PAPER_META_KEY,
  BAR_PRINTER_META_KEY,
  KITCHEN_PAPER_META_KEY,
  KITCHEN_PRINTER_META_KEY,
} from '../lib/kitchenPrinters';

const meta = new Map<string, unknown>();
vi.mock('./db', () => ({ getMeta: vi.fn(async (key: string) => meta.get(key)) }));
const printKitchenTicket = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('../lib/printer', () => ({
  DEFAULT_RECEIPT_PAPER_WIDTH: 58,
  RECEIPT_PAPER_WIDTHS: [58, 80],
  printKitchenTicket: (...a: unknown[]) => printKitchenTicket(...a),
}));
vi.mock('../services/api', () => ({
  api: {
    hasLiveJwt: vi.fn(() => true),
    roundPrintQueue: vi.fn(),
    markRoundPrinted: vi.fn(async () => undefined),
  },
}));

const { api } = await import('../services/api');
const { drainKitchenQueue, resetKitchenQueue } = await import('./kitchenQueue');

function job(roundId: number, station: 'kitchen' | 'bar'): RoundPrintJob {
  return {
    round_id: roundId,
    station,
    heading: station,
    table_name: '5',
    hall_name: 'Тераса',
    round_seq: 2,
    fired_at: '2026-11-22T18:12:00Z',
    staff_name: 'Марта',
    note: null,
    items: [{ product_name: station === 'bar' ? 'Еспресо' : 'Бограч', variant_label: '', quantity: 1, modifiers: [], note: null }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  meta.clear();
  resetKitchenQueue();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('drainKitchenQueue', () => {
  it('asks nothing without a kitchen printer on this device', async () => {
    expect(await drainKitchenQueue()).toBe('no-printer');
    expect(api.roundPrintQueue).not.toHaveBeenCalled();
  });

  it('prints each ticket on its station\'s printer and confirms it', async () => {
    meta.set(KITCHEN_PRINTER_META_KEY, 'Kitchen-1');
    meta.set(KITCHEN_PAPER_META_KEY, 80);
    meta.set(BAR_PRINTER_META_KEY, 'Bar-1');
    meta.set(BAR_PAPER_META_KEY, 58);
    vi.mocked(api.roundPrintQueue).mockResolvedValue({ jobs: [job(7, 'kitchen'), job(7, 'bar')] });

    expect(await drainKitchenQueue()).toEqual({ printed: 2 });
    expect(api.roundPrintQueue).toHaveBeenCalledWith(['kitchen', 'bar']);
    expect(printKitchenTicket).toHaveBeenNthCalledWith(1, 'Kitchen-1', expect.objectContaining({ order_label: 'Стіл 5', station: 'КУХНЯ' }), 80);
    expect(printKitchenTicket).toHaveBeenNthCalledWith(2, 'Bar-1', expect.objectContaining({ station: 'БАР' }), 58);
    expect(api.markRoundPrinted).toHaveBeenCalledWith(7, 'kitchen');
    expect(api.markRoundPrinted).toHaveBeenCalledWith(7, 'bar');
  });

  it('prints the bar\'s ticket on the kitchen\'s printer when the bar has none', async () => {
    meta.set(KITCHEN_PRINTER_META_KEY, 'Kitchen-1');
    vi.mocked(api.roundPrintQueue).mockResolvedValue({ jobs: [job(8, 'bar')] });
    expect(await drainKitchenQueue()).toEqual({ printed: 1 });
    expect(printKitchenTicket).toHaveBeenCalledWith('Kitchen-1', expect.objectContaining({ station: 'БАР' }), 58);
  });

  it('does not confirm a failed print, and rests a minute before asking again', async () => {
    meta.set(KITCHEN_PRINTER_META_KEY, 'Kitchen-1');
    vi.mocked(api.roundPrintQueue).mockResolvedValue({ jobs: [job(9, 'kitchen')] });
    printKitchenTicket.mockRejectedValueOnce('Принтер "Kitchen-1" не знайдено');
    let clock = 1_000_000;
    expect(await drainKitchenQueue(() => clock)).toEqual({ failed: 'Принтер "Kitchen-1" не знайдено' });
    expect(api.markRoundPrinted).not.toHaveBeenCalled();
    clock += 30_000;
    expect(await drainKitchenQueue(() => clock)).toBe('resting');
    clock += 31_000;
    expect(await drainKitchenQueue(() => clock)).toEqual({ printed: 1 });
  });

  it('waits without a network', async () => {
    meta.set(KITCHEN_PRINTER_META_KEY, 'Kitchen-1');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(await drainKitchenQueue()).toBe('offline');
    expect(api.roundPrintQueue).not.toHaveBeenCalled();
  });
});
