// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The «Чеки столів» printer's side of the server's print queue (track ДК,
// decision Д13, TechDocs/POS_DUAL_REGISTER.md): a waiter's tablet has no
// printer, so a paid table's receipts wait on the server until the desktop
// that holds this printer takes them, prints each with its own ФОП's
// requisites (`buildReceiptPayload` picks them by `fiscal_register`) and says
// so. Only a desktop with the printer set asks at all; a print that fails is
// not confirmed, so the job comes back, and the loop rests a minute rather
// than hammering a jammed printer every five seconds.

import { api } from '../services/api';
import { getMeta } from './db';
import { buildReceiptPayload } from '../lib/receipt';
import { DEFAULT_RECEIPT_PAPER_WIDTH, RECEIPT_PAPER_WIDTHS, printReceipt, type ReceiptPaperWidth } from '../lib/printer';
import { TABLE_RECEIPT_PAPER_META_KEY, TABLE_RECEIPT_PRINTER_META_KEY } from '../lib/kitchenPrinters';

const POLL_MS = 5_000;
const REST_AFTER_FAILURE_MS = 60_000;

let busy = false;
let restUntil = 0;

export type DrainOutcome = 'no-printer' | 'offline' | 'resting' | 'busy' | { printed: number } | { failed: string };

/** One pass: take what waits, print it, confirm each. Never throws. */
export async function drainReceiptQueue(now: () => number = Date.now): Promise<DrainOutcome> {
  if (busy) return 'busy';
  if (now() < restUntil) return 'resting';
  busy = true;
  try {
    const printer = await getMeta<string>(TABLE_RECEIPT_PRINTER_META_KEY);
    if (typeof printer !== 'string' || !printer) return 'no-printer';
    if (!navigator.onLine || !api.hasLiveJwt()) return 'offline';
    const auth = api.loadAuth();
    if (!auth) return 'offline';
    const mm = await getMeta<ReceiptPaperWidth>(TABLE_RECEIPT_PAPER_META_KEY);
    const paper = mm && RECEIPT_PAPER_WIDTHS.includes(mm) ? mm : DEFAULT_RECEIPT_PAPER_WIDTH;
    const store = {
      name: auth.store.name,
      fiscal: auth.store.fiscal ?? null,
      vertical: auth.store.vertical?.id ?? null,
      feedback_url: auth.store.feedback_url ?? null,
    };

    const { jobs } = await api.receiptPrintQueue();
    let printed = 0;
    for (const sale of jobs) {
      try {
        await printReceipt(printer, buildReceiptPayload(sale, store), paper);
      } catch (error) {
        restUntil = now() + REST_AFTER_FAILURE_MS;
        return { failed: typeof error === 'string' ? error : String(error) };
      }
      await api.markReceiptPrinted(sale.id);
      printed += 1;
    }
    return { printed };
  } catch (error) {
    // The server or the network: the next pass asks again.
    return { failed: error instanceof Error ? error.message : String(error) };
  } finally {
    busy = false;
  }
}

let started = false;

/** Started with the desktop's offline runtime; a no-op on every pass until the printer is set. */
export function startReceiptQueue(): void {
  if (started) return;
  started = true;
  window.setInterval(() => void drainReceiptQueue(), POLL_MS);
}

/** Tests only. */
export function resetReceiptQueue(): void {
  busy = false;
  restUntil = 0;
}
