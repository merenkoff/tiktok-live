// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The «Чеки столів» printer's loop (track ДК, Д13): asks only with a printer
// set, prints each receipt with its own ФОП and confirms it, and rests after a
// print that failed instead of confirming it.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaleDetail } from '../types';

const meta = new Map<string, unknown>();
vi.mock('./db', () => ({ getMeta: vi.fn(async (key: string) => meta.get(key)) }));
const printReceipt = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('../lib/printer', () => ({
  DEFAULT_RECEIPT_PAPER_WIDTH: 80,
  RECEIPT_PAPER_WIDTHS: [58, 80],
  printReceipt: (...a: unknown[]) => printReceipt(...a),
}));
vi.mock('../services/api', () => ({
  api: {
    hasLiveJwt: vi.fn(() => true),
    loadAuth: vi.fn(() => ({
      store: {
        name: 'Шабля',
        vertical: { id: 'cafe' },
        fiscal: {
          enabled: true,
          provider: 'cashalot',
          registers: [
            {
              register_no: 2,
              label: 'Бар',
              register_fiscal_number: '4000000099',
              default_tax_code: null,
              requisites: {
                organization: { name: 'ФОП Петренко', edrpou: null, tax_number: '3012345678', is_vat: false },
                point: { name: null, address: null },
                register: { fiscal_number: '4000000099', title: null, address: null },
                taxes: [],
              },
            },
          ],
        },
      },
    })),
    receiptPrintQueue: vi.fn(),
    markReceiptPrinted: vi.fn(async () => undefined),
  },
}));

const { api } = await import('../services/api');
const { drainReceiptQueue, resetReceiptQueue } = await import('./receiptQueue');

function sale(id: number, register: number): SaleDetail {
  return {
    id,
    receipt_number: `R-${id}`,
    fiscal_register: register,
    status: 'completed',
    subtotal_cents: 6000,
    total_cents: 6000,
    rounding_cents: 0,
    cart_discount_cents: 0,
    created_at: '2026-11-03T20:00:00Z',
    staff_name: 'Офіціант',
    items: [],
    payments: [{ id: 1, method: 'card', amount_cents: 6000 }],
    refunds: [],
    fiscal: { status: 'done', fiscal_code: `F-${id}`, fiscal_date: null, tax_url: null, qr_payload: null, receipt_text: null, error_code: null, error_message: null },
  } as unknown as SaleDetail;
}

beforeEach(() => {
  vi.clearAllMocks();
  meta.clear();
  resetReceiptQueue();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('drainReceiptQueue', () => {
  it('asks nothing on a desktop without the printer', async () => {
    expect(await drainReceiptQueue()).toBe('no-printer');
    expect(api.receiptPrintQueue).not.toHaveBeenCalled();
  });

  it('prints each receipt with its own ФОП and confirms it', async () => {
    meta.set('tableReceiptPrinterName', 'Bar-80');
    vi.mocked(api.receiptPrintQueue).mockResolvedValue({ jobs: [sale(1, 1), sale(2, 2)] });

    expect(await drainReceiptQueue()).toEqual({ printed: 2 });
    expect(printReceipt).toHaveBeenCalledTimes(2);
    const second = printReceipt.mock.calls[1] as unknown as [string, { header: { org_name: string } | null }, number];
    expect(second[0]).toBe('Bar-80');
    expect(second[1].header?.org_name).toBe('ФОП Петренко');
    expect(api.markReceiptPrinted).toHaveBeenCalledWith(1);
    expect(api.markReceiptPrinted).toHaveBeenCalledWith(2);
  });

  it('leaves a receipt that did not print unconfirmed and rests a minute', async () => {
    meta.set('tableReceiptPrinterName', 'Bar-80');
    vi.mocked(api.receiptPrintQueue).mockResolvedValue({ jobs: [sale(3, 1)] });
    printReceipt.mockRejectedValueOnce('paper out');
    let clock = 1_000;

    expect(await drainReceiptQueue(() => clock)).toEqual({ failed: 'paper out' });
    expect(api.markReceiptPrinted).not.toHaveBeenCalled();
    clock += 30_000;
    expect(await drainReceiptQueue(() => clock)).toBe('resting');
    clock += 31_000;
    expect(await drainReceiptQueue(() => clock)).toEqual({ printed: 1 });
  });
});
