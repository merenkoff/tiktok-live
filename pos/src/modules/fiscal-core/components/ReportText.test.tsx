// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Друкувати» under an X/Z-report: the provider's text goes to the till's
// receipt printer verbatim, or to the browser's print dialog without one.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const meta = new Map<string, unknown>();
const printReceipt = vi.fn();
const printToPdf = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    getMeta: (key: string) => Promise.resolve(meta.get(key)),
    printReceipt: (...a: unknown[]) => printReceipt(...a),
    usePrintableReceipt: () => ({ printToPdf, printablePortal: null }),
  };
});

const { ReportText } = await import('./ReportText');
const { reportReceipt } = await import('../lib/useReportPrint');

const Z = 'Z-ЗВІТ №12\nСУМА 1250.00\n';

beforeEach(() => {
  meta.clear();
  printReceipt.mockReset();
  printToPdf.mockReset();
});

describe('ReportText', () => {
  it('prints the report verbatim on the till’s receipt printer at its roll width', async () => {
    meta.set('receiptPrinterName', 'XP-58');
    meta.set('receiptPaperWidthMm', 80);
    printReceipt.mockResolvedValue(undefined);
    render(<ReportText title="Z-звіт" text={Z} card />);
    expect(screen.getByText(/СУМА 1250.00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Друкувати/ }));
    await waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(1));
    const [name, receipt, width] = printReceipt.mock.calls[0];
    expect(name).toBe('XP-58');
    expect(receipt).toMatchObject({ provider_text: Z, items: [], payments: [] });
    expect(width).toBe(80);
    expect(await screen.findByRole('status')).toHaveTextContent('Звіт надіслано на друк');
    expect(printToPdf).not.toHaveBeenCalled();
  });

  it('says why when the printer refuses', async () => {
    meta.set('receiptPrinterName', 'XP-58');
    printReceipt.mockRejectedValue('printer offline');
    render(<ReportText title="X-звіт" text={Z} />);
    fireEvent.click(screen.getByRole('button', { name: /Друкувати/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Не вдалося надрукувати: printer offline');
    // A 58 mm roll by default when the till never saved a width.
    expect(printReceipt.mock.calls[0][2]).toBe(58);
  });

  it('opens the browser’s print dialog where no receipt printer is set (the web)', async () => {
    render(<ReportText title="X-звіт" text={Z} />);
    fireEvent.click(screen.getByRole('button', { name: /Друкувати/ }));
    await waitFor(() => expect(printToPdf).toHaveBeenCalledTimes(1));
    expect(printToPdf.mock.calls[0][0]).toMatchObject({ provider_text: Z });
    expect(printReceipt).not.toHaveBeenCalled();
  });

  it('builds a receipt that carries nothing but the provider’s text', () => {
    const r = reportReceipt('X', new Date('2026-11-24T10:00:00Z'));
    expect(r).toMatchObject({
      provider_text: 'X',
      items: [],
      payments: [],
      total_cents: 0,
      created_at: '2026-11-24T10:00:00.000Z',
    });
    expect(r.fiscal).toBeUndefined();
    expect(r.feedback_url).toBeUndefined();
  });
});
