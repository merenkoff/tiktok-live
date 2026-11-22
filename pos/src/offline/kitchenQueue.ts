// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The station printers' side of the server's round print queue
// (TechDocs/POS_TABLES.md §11, «Друк раундів»): a round fired from a waiter's
// tablet, the bar's till or a guest's phone waits on the server until the
// desktop that holds the kitchen's (or the bar's) printer takes it, prints the
// ticket and says so — the «Чеки столів» queue (`receiptQueue.ts`) again.
//
// Only a desktop whose «Обладнання» names a kitchen printer asks at all, and it
// asks for both stations: the bar falls back to the kitchen's printer exactly
// as a counter sale's ticket does (`resolveTicketPrinters`). A print that fails
// is not confirmed, so the job comes back, and the loop rests a minute rather
// than hammering a jammed printer every five seconds.

import { api } from '../services/api';
import { getMeta } from './db';
import { roundTicketOf } from '../lib/kitchenTicket';
import { resolveTicketPrinters } from '../lib/kitchenPrinters';
import { printKitchenTicket } from '../lib/printer';
import type { TagStation } from '../types';

const POLL_MS = 5_000;
const REST_AFTER_FAILURE_MS = 60_000;
const STATIONS: TagStation[] = ['kitchen', 'bar'];

let busy = false;
let restUntil = 0;

export type KitchenDrainOutcome =
  | 'no-printer'
  | 'offline'
  | 'resting'
  | 'busy'
  | { printed: number }
  | { failed: string };

/** One pass: take what waits, print each ticket on its station's printer, confirm each. Never throws. */
export async function drainKitchenQueue(now: () => number = Date.now): Promise<KitchenDrainOutcome> {
  if (busy) return 'busy';
  if (now() < restUntil) return 'resting';
  busy = true;
  try {
    const printers = await resolveTicketPrinters(getMeta);
    if (!printers.kitchen) return 'no-printer';
    if (!navigator.onLine || !api.hasLiveJwt()) return 'offline';

    const { jobs } = await api.roundPrintQueue(STATIONS);
    let printed = 0;
    for (const job of jobs) {
      const printer = job.station === 'bar' ? (printers.bar ?? printers.kitchen) : printers.kitchen;
      try {
        await printKitchenTicket(printer.name, roundTicketOf(job), printer.paperWidth);
      } catch (error) {
        restUntil = now() + REST_AFTER_FAILURE_MS;
        return { failed: typeof error === 'string' ? error : String(error) };
      }
      await api.markRoundPrinted(job.round_id, job.station, job.kind === 'cancel' ? 'cancel' : 'fire');
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

/** Started with the desktop's offline runtime; a no-op on every pass until a kitchen printer is set. */
export function startKitchenQueue(): void {
  if (started) return;
  started = true;
  window.setInterval(() => void drainKitchenQueue(), POLL_MS);
}

/** Tests only. */
export function resetKitchenQueue(): void {
  busy = false;
  restUntil = 0;
}
