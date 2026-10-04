// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The receipt search on a till that is offline (clothing R3). The mirror in
// Dexie holds a receipt's number, the customer's name and — for a receipt
// opened on this device — its lines; that is what can be searched without the
// server. Days are the DEVICE's calendar days, the only clock an offline till
// has; the server's search uses the store's.

import type { ListSalesParams } from '../types';
import type { LocalSaleRow } from './db';

export interface SaleFilter {
  limit: number;
  offset: number;
  q: string;
  from?: string;
  to?: string;
}

/** A bare number is a page size — the signature every caller had before the search. */
export function normalizeSaleParams(params: number | ListSalesParams | undefined): SaleFilter {
  const p = typeof params === 'number' ? { limit: params } : (params ?? {});
  return {
    limit: Math.max(1, Math.min(p.limit ?? 50, 200)),
    offset: Math.max(0, Math.floor(p.offset ?? 0)),
    q: (p.q ?? '').trim(),
    from: p.from || undefined,
    to: p.to || undefined,
  };
}

/** `YYYY-MM-DD` of an instant on this device's calendar. */
export function deviceDay(at: Date | string): string {
  const date = typeof at === 'string' ? new Date(at) : at;
  return new Intl.DateTimeFormat('en-CA').format(date);
}

type Searchable = Pick<LocalSaleRow, 'receipt_number' | 'customer_name' | 'created_at'> & {
  detail?: { items: Array<{ product_name: string; variant_label: string }> } | null;
};

/**
 * Does a mirrored receipt answer the filter? Digits are a receipt number's
 * TAIL («2» is R-00002, not R-00012); anything else is looked for in the
 * number, the customer's name and the lines the device has.
 */
export function saleMatches(row: Searchable, filter: Pick<SaleFilter, 'q' | 'from' | 'to'>): boolean {
  if (filter.from || filter.to) {
    const day = deviceDay(row.created_at);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
  }
  const q = filter.q.trim().toLowerCase();
  if (!q) return true;
  if (/^\d+$/.test(q)) {
    return new RegExp(`-0*${q}$`).test(row.receipt_number);
  }
  if (row.receipt_number.toLowerCase().includes(q)) return true;
  if ((row.customer_name ?? '').toLowerCase().includes(q)) return true;
  return (row.detail?.items ?? []).some(
    (item) => item.product_name.toLowerCase().includes(q) || item.variant_label.toLowerCase().includes(q)
  );
}
