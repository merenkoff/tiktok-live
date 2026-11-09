// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Every document a printer prints goes out with that printer's character
// profile, and a printer that was never set up prints exactly as it always did.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { db } from '../offline/db';
import {
  loadPrinterEncoding,
  printEncodingTest,
  printKitchenTicket,
  printPrecheck,
  printReceipt,
  printSlip,
  savePrinterEncoding,
  type KitchenTicketData,
  type PrecheckData,
  type ReceiptData,
  type SlipData,
} from './printer';
import { DEFAULT_PRINTER_ENCODING, presetCandidates } from './printerEncoding';

const receipt = { store_name: 'Тест' } as ReceiptData;
const ticket = { order_label: '17', items: [] } as unknown as KitchenTicketData;
const bill = { table_name: '5', items: [] } as unknown as PrecheckData;
const slip = { title: 'ТЕСТ' } as SlipData;

beforeEach(async () => {
  vi.mocked(invoke).mockClear();
  await db.meta.clear();
});

describe('a printer that was never set up', () => {
  it('has the default profile — Windows-1251 at its standard number', async () => {
    expect(await loadPrinterEncoding('Xprinter')).toEqual(DEFAULT_PRINTER_ENCODING);
  });

  it('is sent that profile with every document', async () => {
    await printReceipt('Xprinter', receipt, 58);
    expect(invoke).toHaveBeenCalledWith('print_receipt', {
      printerName: 'Xprinter',
      receipt,
      paperWidthMm: 58,
      encoding: { table: 'windows1251', esc_t: null },
    });
  });
});

describe('a printer with a chosen profile', () => {
  it('keeps it across reads, per printer', async () => {
    await savePrinterEncoding('Xprinter', { table: 'cp866', esc_t: null });
    await savePrinterEncoding('Bar-1', { table: 'windows1251', esc_t: 73 });
    expect(await loadPrinterEncoding('Xprinter')).toEqual({ table: 'cp866', esc_t: null });
    expect(await loadPrinterEncoding('Bar-1')).toEqual({ table: 'windows1251', esc_t: 73 });
    expect(await loadPrinterEncoding('Kitchen-1')).toEqual(DEFAULT_PRINTER_ENCODING);
  });

  it('prints the receipt, the pre-bill, the kitchen ticket and the slip with it', async () => {
    const chosen = { table: 'cp866', esc_t: 17 };
    await savePrinterEncoding('Xprinter', { table: 'cp866', esc_t: 17 });

    await printReceipt('Xprinter', receipt, 80);
    await printPrecheck('Xprinter', bill, 58);
    await printKitchenTicket('Xprinter', ticket, 58);
    await printSlip('Xprinter', slip, 58);

    expect(invoke).toHaveBeenCalledWith('print_receipt', { printerName: 'Xprinter', receipt, paperWidthMm: 80, encoding: chosen });
    expect(invoke).toHaveBeenCalledWith('print_precheck', { printerName: 'Xprinter', bill, paperWidthMm: 58, encoding: chosen });
    expect(invoke).toHaveBeenCalledWith('print_kitchen_ticket', { printerName: 'Xprinter', ticket, paperWidthMm: 58, encoding: chosen });
    expect(invoke).toHaveBeenCalledWith('print_slip', { printerName: 'Xprinter', slip, paperWidthMm: 58, encoding: chosen });
  });

  it('never hands the printer a value that is not a profile', async () => {
    await db.meta.put({ key: 'printerEncoding:Xprinter', value: { table: 'nonsense', esc_t: 999 } });
    expect(await loadPrinterEncoding('Xprinter')).toEqual(DEFAULT_PRINTER_ENCODING);
  });

  it('is saved normalised: a bad number is dropped before it is stored', async () => {
    await savePrinterEncoding('Xprinter', { table: 'cp866', esc_t: 999 });
    const row = await db.meta.get('printerEncoding:Xprinter');
    expect(row?.value).toEqual({ table: 'cp866', esc_t: null });
  });
});

describe('the test sheet', () => {
  it('sends the candidates and the roll width to the print_encoding_test command', async () => {
    await printEncodingTest('Xprinter', 58, presetCandidates());
    expect(invoke).toHaveBeenCalledWith('print_encoding_test', {
      printerName: 'Xprinter',
      paperWidthMm: 58,
      candidates: [
        { table: 'windows1251', esc_t: null, label: 'A' },
        { table: 'cp866', esc_t: null, label: 'B' },
        { table: 'cp1125', esc_t: null, label: 'C' },
      ],
    });
  });
});
