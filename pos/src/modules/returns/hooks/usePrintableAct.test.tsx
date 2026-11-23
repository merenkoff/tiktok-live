// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The refund act on the receipt roll (migration 114): only where the owner
// switched it on, only on the desktop, only with a receipt printer chosen —
// everywhere else, and after a failed slip, the A4 sheet as before.

import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActData } from '../lib/actPayload';

const getMeta = vi.fn();
const printSlip = vi.fn();
let shell = 'cashier';
let onRoll = true;

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    usePosShell: () => shell,
    getMeta: (key: string) => getMeta(key),
    printSlip: (...a: unknown[]) => printSlip(...a),
    triggerPrint: () => undefined,
    useAuthStore: (pick: (s: unknown) => unknown) =>
      pick({ auth: { store: { refund_act_on_receipt_printer: onRoll } } }),
  };
});

const { usePrintableAct } = await import('./usePrintableAct');

const ACT: ActData = {
  store_name: 'Evelin',
  org_name: 'ФОП Коваль О. О.',
  address: null,
  tax_id_line: 'ІД 1234567890',
  act_number: 'RF-00007',
  act_date: '23.11.2026',
  buyer_name: null,
  buyer_document: null,
  goods: [{ name: 'Боді', label: '86', quantity: 1, amount_cents: 15000 }],
  total_cents: 15000,
  rounding_cents: 0,
  returned_by: 'готівкою',
  original: { receipt_number: 'R-00042', date: '22.11.2026', time: '12:00', fiscal_code: null },
  refund_fiscal_code: null,
  cashier: 'Олена',
};

let print: (data: ActData) => void = () => undefined;
function Harness() {
  const { printAct, actPortal } = usePrintableAct();
  print = printAct;
  return <>{actPortal}</>;
}

beforeEach(() => {
  shell = 'cashier';
  onRoll = true;
  getMeta.mockReset().mockImplementation(async (key: string) => (key === 'receiptPrinterName' ? 'XP-58' : 80));
  printSlip.mockReset().mockResolvedValue(undefined);
});

const a4Shown = () => screen.queryByText('АКТ про видачу коштів');

describe('usePrintableAct', () => {
  it('prints the act as a slip on the desktop’s receipt printer when the owner asked for it', async () => {
    render(<Harness />);
    act(() => print(ACT));
    await waitFor(() => expect(printSlip).toHaveBeenCalledTimes(1));
    const [printer, slip, paper] = printSlip.mock.calls[0] as [string, { title: string }, number];
    expect(printer).toBe('XP-58');
    expect(slip.title).toBe('АКТ про видачу коштів');
    expect(paper).toBe(80);
    expect(a4Shown()).toBeNull();
  });

  it.each([
    ['the switch is off', () => (onRoll = false)],
    ['it is not the desktop', () => (shell = 'web')],
    ['no receipt printer is chosen', () => getMeta.mockResolvedValue(undefined)],
    ['the slip fails', () => printSlip.mockRejectedValue('paper out')],
  ])('prints the A4 sheet when %s', async (_name, arrange) => {
    arrange();
    render(<Harness />);
    act(() => print(ACT));
    await waitFor(() => expect(a4Shown()).not.toBeNull());
  });
});
