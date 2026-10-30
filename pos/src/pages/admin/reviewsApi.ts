// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/reviewsApi.ts — what the owner reads of guests' feedback
// (TechDocs/POS_QR_MENU_FEEDBACK.md, phase F4), through the generic client so
// the `@pos/platform` surface does not move for it.

import { api } from '@pos/platform';

export type FeedbackScore = 1 | 2 | 3 | 4 | 5;

export interface FeedbackRow {
  id: number;
  score: number;
  tags: string[];
  tag_labels: string[];
  comment: string | null;
  phone: string | null;
  source: 'menu' | 'bill';
  created_at: string;
  table: { id: number; name: string; hall: string } | null;
  bill_no: number | null;
  handled_at: string | null;
  handled_by: string | null;
}

export interface FeedbackList {
  rows: FeedbackRow[];
  total: number;
  from: string;
  to: string;
}

export interface FeedbackSummary {
  from: string;
  to: string;
  count: number;
  average: number | null;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  tags: Array<{ code: string; label: string; count: number }>;
  unhandled_low: number;
  latest: Array<{ id: number; score: number; comment: string | null; created_at: string }>;
}

export interface FeedbackQuery {
  from?: string;
  to?: string;
  score?: number;
  handled?: boolean;
  limit?: number;
  offset?: number;
}

/** The score's word, as the guest's sheet labels its faces. */
export const FACE_WORDS: Record<number, string> = {
  1: 'Погано',
  2: 'Так собі',
  3: 'Нормально',
  4: 'Добре',
  5: 'Чудово',
};

function queryString(query: FeedbackQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function listFeedback(query: FeedbackQuery = {}): Promise<FeedbackList> {
  return api.posRequest<FeedbackList>('get', `/feedback${queryString(query)}`);
}

export function feedbackSummary(query: Pick<FeedbackQuery, 'from' | 'to'> = {}): Promise<FeedbackSummary> {
  return api.posRequest<FeedbackSummary>('get', `/feedback/summary${queryString(query)}`);
}

export function setFeedbackHandled(id: number, handled: boolean): Promise<FeedbackRow> {
  return api.posRequest<FeedbackRow>('post', `/feedback/${id}/handled`, { handled });
}

/** A store-local day `n` days before `day` (YYYY-MM-DD arithmetic in UTC, safe for calendar days). */
export function daysBefore(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!) - n * 86_400_000).toISOString().slice(0, 10);
}

/** «31.10, 19:42» in the device's locale — the owner reads it in their own zone. */
export function whenText(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** «стіл 5 · Зал», «з QR закладу». */
export function whereText(row: Pick<FeedbackRow, 'table' | 'source'>): string {
  if (!row.table) return 'з QR закладу';
  const seat = /^\d+$/.test(row.table.name) ? `стіл ${row.table.name}` : row.table.name;
  return row.table.hall ? `${seat} · ${row.table.hall}` : seat;
}
