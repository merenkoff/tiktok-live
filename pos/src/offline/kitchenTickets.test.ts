// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The tickets a rung sale sends, from the offline mirror alone: which printer
// each station's goes to, and when nothing goes at all.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSaleDetail } from '../test/utils';

const meta: Record<string, unknown> = {};
const catalog = [
  { variant_id: 10, tag_ids: [1] },
  { variant_id: 20, tag_ids: [3] },
];
const tags = [
  { id: 1, store_id: 1, parent_id: null, name: 'Кава', sort_order: 0, color: null, show_in_catalog_bar: true, station: 'bar' },
  { id: 3, store_id: 1, parent_id: null, name: 'Випічка', sort_order: 1, color: null, show_in_catalog_bar: true, station: 'kitchen' },
];

vi.mock('./db', () => ({
  db: { catalog: { toArray: vi.fn(async () => catalog) } },
  getMeta: vi.fn(async (key: string) => (key === 'tagsTree' ? tags : meta[key])),
}));
vi.mock('../lib/printer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/printer')>()),
  printKitchenTicket: vi.fn(async () => undefined),
}));

const { printKitchenTicket } = await import('../lib/printer');
const { printKitchenTickets } = await import('./kitchenTickets');

const sale = makeSaleDetail({
  order_no: 17,
  items: [
    { id: 1, variant_id: 10, product_name: 'Латте', variant_label: 'M', quantity: 1, unit_price_cents: 6500, line_total_cents: 6500, refunded_quantity: 0 },
    { id: 2, variant_id: 20, product_name: 'Круасан', variant_label: '', quantity: 2, unit_price_cents: 5500, line_total_cents: 11000, refunded_quantity: 0 },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(meta)) delete meta[key];
});

describe('printKitchenTickets', () => {
  it('sends each station’s ticket to that station’s printer', async () => {
    Object.assign(meta, { kitchenPrinterName: 'Kitchen-1', barPrinterName: 'Bar-1', barPaperWidthMm: 80 });
    await expect(printKitchenTickets(sale)).resolves.toBe('printed');
    expect(printKitchenTicket).toHaveBeenCalledTimes(2);
    expect(printKitchenTicket).toHaveBeenNthCalledWith(
      1,
      'Kitchen-1',
      expect.objectContaining({ station: 'КУХНЯ', order_label: '17', items: [expect.objectContaining({ name: 'Круасан', quantity: 2 })] }),
      58
    );
    expect(printKitchenTicket).toHaveBeenNthCalledWith(
      2,
      'Bar-1',
      expect.objectContaining({ station: 'БАР', items: [expect.objectContaining({ name: 'Латте' })] }),
      80
    );
  });

  it('prints the bar’s ticket on the kitchen printer when the bar has none', async () => {
    Object.assign(meta, { kitchenPrinterName: 'Kitchen-1' });
    await printKitchenTickets(sale);
    expect(vi.mocked(printKitchenTicket).mock.calls.map((c) => c[0])).toEqual(['Kitchen-1', 'Kitchen-1']);
  });

  it('sends nothing, and says so quietly, on a device with no kitchen printer', async () => {
    await expect(printKitchenTickets(sale)).resolves.toBe('no-printer');
    expect(printKitchenTicket).not.toHaveBeenCalled();
  });

  it('lets a printer failure through in the printer’s own words', async () => {
    Object.assign(meta, { kitchenPrinterName: 'Kitchen-1' });
    vi.mocked(printKitchenTicket).mockRejectedValueOnce('Принтер "Kitchen-1" не знайдено');
    await expect(printKitchenTickets(sale)).rejects.toBe('Принтер "Kitchen-1" не знайдено');
  });

  it('has nothing to print for a sale with no lines', async () => {
    Object.assign(meta, { kitchenPrinterName: 'Kitchen-1' });
    await expect(printKitchenTickets(makeSaleDetail({ items: [] }))).resolves.toBe('nothing');
    expect(printKitchenTicket).not.toHaveBeenCalled();
  });
});
