// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Typed wrapper over the host's `api.posRequest` for mass markdowns (clothing
// D2) — the `techCardsApi.ts` shape. Nothing here is a new export of
// `@pos/platform`, which keeps the platform at 17.

import { api } from '@pos/platform';
import { ukPlural } from '../../../lib/plural';

export type MarkdownRounding = 1 | 100 | 1000;

/** Mirrors `MarkdownView` in `src/pos/markdowns.service.ts`. */
export interface MarkdownView {
  id: number;
  name: string;
  percent: number;
  rounding: MarkdownRounding;
  ends_on: string | null;
  created_at: string;
  ended_at: string | null;
  ended_reason: 'manual' | 'expired' | null;
  items: number;
  products: number;
  restored: number | null;
  skipped: number | null;
}

export type MarkdownSkipReason = 'in_markdown' | 'derived' | 'too_cheap';

export interface MarkdownSkipped {
  variant_id: number;
  product_name: string;
  label: string;
  reason: MarkdownSkipReason;
  markdown_name?: string;
}

export interface MarkdownPlannedItem {
  variant_id: number;
  product_id: number;
  product_name: string;
  label: string;
  price_before: number;
  compare_at_before: number | null;
  price_after: number;
  compare_at_after: number;
}

export interface MarkdownPreview {
  items: MarkdownPlannedItem[];
  skipped: MarkdownSkipped[];
  products: number;
}

export interface MarkdownInput {
  product_ids: number[];
  percent: number;
  rounding: MarkdownRounding;
  ends_on: string | null;
  name: string;
}

export interface MarkdownCreated {
  markdown: MarkdownView;
  applied: number;
  skipped: MarkdownSkipped[];
}

export interface MarkdownEnded {
  restored: number;
  skipped: number;
  already: boolean;
}

// `posRequest` is called as a METHOD of `api`, never detached: it reaches its
// axios client through `this`.
export function listMarkdowns(): Promise<MarkdownView[]> {
  return api.posRequest<MarkdownView[]>('get', '/markdowns');
}

export function previewMarkdown(input: MarkdownInput): Promise<MarkdownPreview> {
  return api.posRequest<MarkdownPreview>('post', '/markdowns/preview', input);
}

export function createMarkdown(input: MarkdownInput): Promise<MarkdownCreated> {
  return api.posRequest<MarkdownCreated>('post', '/markdowns', input);
}

export function endMarkdown(id: number): Promise<MarkdownEnded> {
  return api.posRequest<MarkdownEnded>('post', `/markdowns/${id}/end`);
}

/** What a markdown is called in a list — the server's `markdownCaption`. */
export function markdownCaption(m: Pick<MarkdownView, 'name' | 'percent'>): string {
  return m.name.trim() || `Уцінка −${m.percent} %`;
}

export const ROUNDING_OPTIONS = [
  { value: '1', label: 'До копійки' },
  { value: '100', label: 'До 1 ₴' },
  { value: '1000', label: 'До 10 ₴' },
] as const;

export function roundingLabel(rounding: MarkdownRounding): string {
  return ROUNDING_OPTIONS.find((o) => Number(o.value) === rounding)?.label ?? `До ${rounding / 100} ₴`;
}

/** Why a variant was left out, in the owner's words. */
export function skipReasonLabel(reason: MarkdownSkipReason, markdownName?: string): string {
  switch (reason) {
    case 'in_markdown':
      return `вже в уцінці «${markdownName ?? ''}»`;
    case 'derived':
      return 'ціна складається зі складників на касі';
    case 'too_cheap':
      return 'після округлення не лишилося б ціни';
  }
}

/** Skipped variants grouped by reason: «вже в уцінці «Осінь» — 3». */
export function groupSkipped(skipped: MarkdownSkipped[]): Array<{ label: string; count: number }> {
  const groups = new Map<string, number>();
  for (const s of skipped) {
    const label = skipReasonLabel(s.reason, s.markdown_name);
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return [...groups.entries()].map(([label, count]) => ({ label, count }));
}

/** «варіантів: 12 у 4 товарах» / «у 1 товарі» — the count phrase the dialog, the flash and the list share. */
export function countPhrase(items: number, products: number): string {
  return `варіантів: ${items} у ${products} ${ukPlural(products, 'товарі', 'товарах', 'товарах')}`;
}

/** `2026-10-15` → `15.10.2026`, the way the owner reads a date. */
export function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : day;
}
