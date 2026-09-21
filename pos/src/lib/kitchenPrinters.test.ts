// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { resolveTicketPrinters } from './kitchenPrinters';

function reader(meta: Record<string, unknown>) {
  return async <T,>(key: string) => meta[key] as T | undefined;
}

describe('resolveTicketPrinters', () => {
  it('gives the bar its own printer when it has one', async () => {
    const printers = await resolveTicketPrinters(
      reader({ kitchenPrinterName: 'Kitchen-1', kitchenPaperWidthMm: 80, barPrinterName: 'Bar-1' })
    );
    expect(printers).toEqual({
      kitchen: { name: 'Kitchen-1', paperWidth: 80 },
      bar: { name: 'Bar-1', paperWidth: 58 },
    });
  });

  it('lets the bar fall back to the kitchen, never the other way round', async () => {
    expect(await resolveTicketPrinters(reader({ kitchenPrinterName: 'Kitchen-1' }))).toEqual({
      kitchen: { name: 'Kitchen-1', paperWidth: 58 },
      bar: { name: 'Kitchen-1', paperWidth: 58 },
    });
    // A bar printer alone routes nothing: without a kitchen there are no tickets.
    expect(await resolveTicketPrinters(reader({ barPrinterName: 'Bar-1' }))).toEqual({ kitchen: null, bar: null });
    expect(await resolveTicketPrinters(reader({}))).toEqual({ kitchen: null, bar: null });
  });

  it('ignores a cleared name and a paper width it does not know', async () => {
    expect(
      await resolveTicketPrinters(reader({ kitchenPrinterName: 'K', kitchenPaperWidthMm: 72, barPrinterName: null }))
    ).toEqual({ kitchen: { name: 'K', paperWidth: 58 }, bar: { name: 'K', paperWidth: 58 } });
    expect(await resolveTicketPrinters(reader({ kitchenPrinterName: '   ' }))).toEqual({ kitchen: null, bar: null });
  });
});
