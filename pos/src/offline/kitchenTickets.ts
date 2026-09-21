// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Print a rung sale's kitchen tickets from what the desktop holds offline
// (café phase К3e): the station printers from `meta`, the variants' tags
// from the catalog mirror, the stations from the cached tag tree. Works
// with no network, which is the point — the kitchen must not wait on one.

import { db, getMeta } from './db';
import { buildKitchenTickets } from '../lib/kitchenTicket';
import { resolveTicketPrinters } from '../lib/kitchenPrinters';
import { printKitchenTicket } from '../lib/printer';
import type { PosTag, SaleDetail } from '../types';

export type KitchenPrintOutcome =
  /** Every ticket went to its printer. */
  | 'printed'
  /** No kitchen printer on this device — nothing was sent, nothing to say. */
  | 'no-printer'
  /** A sale with no lines. */
  | 'nothing';

/**
 * One call per station the sale touches, each to that station's printer; a
 * failure of any of them is thrown as the printer's own words. The caller
 * decides what to show — the success screen keys on this never to print the
 * same sale twice.
 */
export async function printKitchenTickets(sale: SaleDetail): Promise<KitchenPrintOutcome> {
  const printers = await resolveTicketPrinters(getMeta);
  if (!printers.kitchen) return 'no-printer';
  // The tag tree as `repository.getCachedTags` reads it — straight from
  // `meta` here, so this file stays clear of the repository and the api
  // singleton it carries (`check:platform-boundary`).
  const [catalog, tags] = await Promise.all([db.catalog.toArray(), getMeta<PosTag[]>('tagsTree')]);
  const routes = buildKitchenTickets(sale, { catalog, tags: tags ?? [] });
  if (routes.length === 0) return 'nothing';
  for (const route of routes) {
    const printer = route.station === 'bar' ? (printers.bar ?? printers.kitchen) : printers.kitchen;
    await printKitchenTicket(printer.name, route.ticket, printer.paperWidth);
  }
  return 'printed';
}
