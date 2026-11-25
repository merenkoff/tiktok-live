// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The station printers' loop for a table's rounds (TechDocs/POS_TABLES.md
// §11): asks only with a kitchen printer set, prints each ticket on its
// station's printer (the bar on the kitchen's when it has none of its own),
// confirms it, and rests after a print that failed instead of confirming it.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemotePrintJob, RoundPrintJob } from '../types';
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
    remotePrintQueue: vi.fn(async () => ({ jobs: [] })),
    markRemotePrinted: vi.fn(async () => undefined),
    loadAuth: vi.fn(() => ({ store: { remote_kitchen: true } })),
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
    expect(api.markRoundPrinted).toHaveBeenCalledWith(7, 'kitchen', 'fire');
    expect(api.markRoundPrinted).toHaveBeenCalledWith(7, 'bar', 'fire');
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

  it('prints a «СКАСОВАНО» job as a cancelled ticket and confirms it as such', async () => {
    meta.set(KITCHEN_PRINTER_META_KEY, 'Kitchen-1');
    vi.mocked(api.roundPrintQueue).mockResolvedValue({ jobs: [{ ...job(10, 'kitchen'), kind: 'cancel' }] });
    expect(await drainKitchenQueue()).toEqual({ printed: 1 });
    expect(printKitchenTicket).toHaveBeenCalledWith('Kitchen-1', expect.objectContaining({ cancelled: true }), 58);
    expect(api.markRoundPrinted).toHaveBeenCalledWith(10, 'kitchen', 'cancel');
  });

  it('waits without a network', async () => {
    meta.set(KITCHEN_PRINTER_META_KEY, 'Kitchen-1');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(await drainKitchenQueue()).toBe('offline');
    expect(api.roundPrintQueue).not.toHaveBeenCalled();
  });
});

describe('drainKitchenQueue — a cafe’s paid orders (remote kitchen, РК3)', () => {
  const remoteJob = (id: number, kind: 'fire' | 'cancel' = 'fire'): RemotePrintJob => ({
    remote_order_id: id,
    kind,
    order_no: 12,
    cafe_name: 'Pulcinella Парк',
    guest_label: 'Стіл 3',
    note: null,
    paid_at: '2026-11-25T18:00:00Z',
    promised_at: '2026-11-25T18:40:00Z',
    items: [{ product_name: 'Маргарита', variant_label: '', quantity: 2, modifiers: [], note: 'без цибулі' }],
  });

  it('prints each on the kitchen printer and confirms it with its kind', async () => {
    meta.set(KITCHEN_PRINTER_META_KEY, 'Kitchen');
    vi.mocked(api.roundPrintQueue).mockResolvedValue({ jobs: [] });
    vi.mocked(api.remotePrintQueue).mockResolvedValue({ jobs: [remoteJob(7), remoteJob(8, 'cancel')] });
    expect(await drainKitchenQueue()).toEqual({ printed: 2 });
    expect(printKitchenTicket).toHaveBeenCalledTimes(2);
    const [printer, ticket] = printKitchenTicket.mock.calls[0] as [string, { order_label: string; subtitle: string }];
    expect(printer).toBe('Kitchen');
    expect(ticket.order_label).toBe('П-12');
    expect(ticket.subtitle).toMatch(/^Pulcinella Парк · Стіл 3 · до /);
    expect((printKitchenTicket.mock.calls[1] as [string, { cancelled?: boolean }])[1].cancelled).toBe(true);
    expect(api.markRemotePrinted).toHaveBeenNthCalledWith(1, 7, 'fire');
    expect(api.markRemotePrinted).toHaveBeenNthCalledWith(2, 8, 'cancel');
  });

  it('keeps printing rounds against a server without the remote queue, and stops asking it for a while', async () => {
    meta.set(KITCHEN_PRINTER_META_KEY, 'Kitchen');
    vi.mocked(api.roundPrintQueue).mockResolvedValue({ jobs: [job(1, 'kitchen')] });
    vi.mocked(api.remotePrintQueue).mockRejectedValue({ response: { status: 404 } });
    expect(await drainKitchenQueue(() => 1_000)).toEqual({ printed: 1 });
    vi.mocked(api.roundPrintQueue).mockResolvedValue({ jobs: [] });
    await drainKitchenQueue(() => 2_000);
    expect(api.remotePrintQueue).toHaveBeenCalledTimes(1);
  });

  it('never asks the remote queue in a store that is no kitchen', async () => {
    meta.set(KITCHEN_PRINTER_META_KEY, 'Kitchen');
    vi.mocked(api.roundPrintQueue).mockResolvedValue({ jobs: [] });
    for (const store of [{ remote_kitchen: false }, {}]) {
      vi.mocked(api.loadAuth).mockReturnValueOnce({ store } as never);
      expect(await drainKitchenQueue()).toEqual({ printed: 0 });
    }
    expect(api.roundPrintQueue).toHaveBeenCalledTimes(2);
    expect(api.remotePrintQueue).not.toHaveBeenCalled();
  });

  it('does not confirm a ticket the printer refused', async () => {
    meta.set(KITCHEN_PRINTER_META_KEY, 'Kitchen');
    vi.mocked(api.roundPrintQueue).mockResolvedValue({ jobs: [] });
    vi.mocked(api.remotePrintQueue).mockResolvedValue({ jobs: [remoteJob(7)] });
    printKitchenTicket.mockRejectedValueOnce('paper out');
    expect(await drainKitchenQueue()).toEqual({ failed: 'paper out' });
    expect(api.markRemotePrinted).not.toHaveBeenCalled();
  });
});
