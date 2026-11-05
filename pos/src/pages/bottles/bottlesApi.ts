// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bar's open bottles (track ДК, ДК5, TechDocs/POS_DUAL_REGISTER.md §4.4),
// over `api.posRequest` — the `markdownsApi.ts` shape, so the platform
// surface does not move. The shapes mirror `src/pos/bottles.service.ts`.

import { api } from '@pos/platform';

export interface OpenBottle {
  id: number;
  variant_id: number;
  product_name: string;
  label: string;
  capacity_ml: number;
  poured_ml: number;
  opened_at: string;
}

export interface WaitingPour {
  variant_id: number;
  product_name: string;
  /** What waits to be poured from the next bottle. */
  ml: number;
  bottle_ml: number;
  /** The tables whose dishes wait for it. */
  tables: string[];
}

export interface ClosedBottle extends OpenBottle {
  closed_at: string;
  close_reason: 'empty' | 'replaced' | 'broken';
  /** Positive: less was in it than counted (written off); negative: more was left. */
  discrepancy_ml: number | null;
  note: string | null;
}

export interface Drink {
  variant_id: number;
  product_name: string;
  bottle_ml: number;
}

export interface BottlesState {
  open: OpenBottle[];
  waiting: WaitingPour[];
  closed: ClosedBottle[];
  /** Absent from an API before ДК5-В → nothing to open from the list. */
  drinks?: Drink[];
}

export interface BottleReport {
  closed: ClosedBottle[];
  totals: Array<{ variant_id: number; product_name: string; bottles: number; missing_ml: number; left_ml: number }>;
}

export function listBottles(): Promise<BottlesState> {
  return api.posRequest<BottlesState>('get', '/bottles');
}

/** Scan a new bottle's stamp; `replace` when the one still open ran out early. */
export function openBottle(body: {
  variant_id: number;
  excise_label: string;
  replace?: boolean;
  note?: string;
}): Promise<BottlesState & { bottle_id: number; replayed: boolean }> {
  return api.posRequest('post', '/bottles/open', body);
}

export function bottleBroken(id: number, note?: string): Promise<BottlesState> {
  return api.posRequest('post', `/bottles/${id}/broken`, note ? { note } : {});
}

export function bottleLeftover(id: number, ml: number): Promise<BottlesState> {
  return api.posRequest('post', `/bottles/${id}/leftover`, { ml });
}

export function bottleReport(from: string, to: string): Promise<BottleReport> {
  return api.posRequest('get', `/bottles/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

/** The server's sentence from a refused call, or a fallback. */
export function refusalText(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error === 'string' && !/^[a-z_]+$/.test(data.error)) return data.error;
  return fallback;
}

/** «350 мл» / «1,2 л» — what is left or poured, the way a bartender says it. */
export function mlText(ml: number): string {
  if (Math.abs(ml) >= 1000) {
    const litres = (ml / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
    return `${litres} л`;
  }
  return `${ml} мл`;
}
