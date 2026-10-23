// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The words the «Ліди» tab uses for what the server sends as ids
// (TechDocs/CRM_LEADS.md). Unknown ids are shown as they are — a new form or
// product on the site must never make a lead disappear from the table.

import type { SuperLeadStatus } from './superApi';

export const STATUS_ORDER: SuperLeadStatus[] = ['new', 'contacted', 'demo', 'client', 'lost'];

export const STATUS_LABEL: Record<SuperLeadStatus, string> = {
  new: 'Нові',
  contacted: 'Зв’язались',
  demo: 'Демо',
  client: 'Клієнт',
  lost: 'Відмова',
};

const INTEREST_LABEL: Record<string, string> = {
  pos: 'Каса (загалом)',
  odyah: 'Одяг',
  kvity: 'Квіти',
  kafe: 'Кафе',
  restoran: 'Ресторан',
  produkty: 'Продукти',
  live: 'TikTok LIVE',
  other: 'Інше',
};

export const INTEREST_OPTIONS = Object.entries(INTEREST_LABEL).map(([id, label]) => ({ id, label }));

const INTENT_LABEL: Record<string, string> = {
  demo: 'Хоче демо',
  waitlist: 'Лист очікування',
  question: 'Питання',
  callback: 'Передзвонити',
  'live-trial': 'Спробувати LIVE',
};

export function interestLabel(id: string | null): string {
  return id ? INTEREST_LABEL[id] ?? id : '—';
}

export function intentLabel(id: string | null): string {
  return id ? INTENT_LABEL[id] ?? id : '—';
}

/** `dovidka:kavapp-chy-…` → «Довідка: kavapp-chy-…»; the rest as the site named it. */
export function formLabel(formId: string): string {
  if (formId === 'unknown') return 'Стара форма';
  if (formId === 'imported') return 'Перенесено зі старої таблиці';
  if (formId.startsWith('dovidka:')) return `Довідка: ${formId.slice('dovidka:'.length)}`;
  return formId;
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
}
