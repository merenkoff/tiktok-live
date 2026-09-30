// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/profile.ts — what the guest's menu says about the place
// itself: logo, address, phone, opening hours (TechDocs/POS_QR_MENU.md, Q3a).
//
// Pure: no database, no clock of its own. What the owner types is checked here
// on the way IN (so a bad value is a 400 the card can show, not a broken page),
// and turned into the few strings the page prints on the way OUT. The page
// still escapes everything it prints — this is validation, not sanitising.

import { oneLine } from '../core/text.js';

export class ProfileError extends Error {}

// ── hours ───────────────────────────────────────────────────────────

/** ISO weekdays: "1" is Monday, "7" is Sunday. */
export const DAY_KEYS = ['1', '2', '3', '4', '5', '6', '7'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

const DAY_SHORT: Record<DayKey, string> = { '1': 'Пн', '2': 'Вт', '3': 'Ср', '4': 'Чт', '5': 'Пт', '6': 'Сб', '7': 'Нд' };

export interface DayHours {
  open: string;
  close: string;
}

/** A missing day is a closed day. */
export type WeekHours = Partial<Record<DayKey, DayHours>>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CLOSED = 'зачинено';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The week the owner sent, or null for «no hours» (`null`, `{}`, or every day
 * closed-by-omission). A day whose `close` is at or before its `open` runs past
 * midnight — a bar open 18:00–02:00 is the ordinary case, so only `open ==
 * close` is refused (it would be «24 години» or a slip, and 00:00–23:59 says
 * the former).
 */
export function normalizeHours(raw: unknown): WeekHours | null {
  if (raw === null) return null;
  if (!isPlainObject(raw)) throw new ProfileError('Години роботи: очікується розклад за днями тижня');
  const week: WeekHours = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(DAY_KEYS as readonly string[]).includes(key)) {
      throw new ProfileError(`Години роботи: невідомий день «${key}»`);
    }
    if (value === null) continue;
    if (!isPlainObject(value) || typeof value.open !== 'string' || typeof value.close !== 'string') {
      throw new ProfileError(`Години роботи: у дня ${DAY_SHORT[key as DayKey]} мають бути «з» і «до»`);
    }
    if (!TIME_RE.test(value.open) || !TIME_RE.test(value.close)) {
      throw new ProfileError(`Години роботи: у дня ${DAY_SHORT[key as DayKey]} час має бути у форматі ГГ:ХХ`);
    }
    if (value.open === value.close) {
      throw new ProfileError(`Години роботи: у дня ${DAY_SHORT[key as DayKey]} «з» і «до» однакові`);
    }
    week[key as DayKey] = { open: value.open, close: value.close };
  }
  return Object.keys(week).length > 0 ? week : null;
}

/** Hours as the database hands them back; anything that is not a valid week reads as «not said». */
export function readHours(raw: unknown): WeekHours | null {
  try {
    return normalizeHours(raw ?? null);
  } catch {
    return null;
  }
}

/** The ISO weekday of `at` in `timezone`. A zone this runtime does not know reads as Kyiv, the store default. */
function dayKeyAt(at: Date, timezone: string): DayKey {
  const names: Record<string, DayKey> = { Mon: '1', Tue: '2', Wed: '3', Thu: '4', Fri: '5', Sat: '6', Sun: '7' };
  let name: string;
  try {
    name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(at);
  } catch {
    name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Kyiv', weekday: 'short' }).format(at);
  }
  return names[name] ?? '1';
}

/**
 * «08:00–22:00» or «зачинено» for the day `at` falls on IN THE STORE'S ZONE —
 * the server's own zone (UTC on the host) would name the wrong day for a guest
 * standing in Kyiv at half past midnight. Null when the owner gave no hours.
 */
export function hoursTodayText(hours: WeekHours | null, at: Date, timezone: string): string | null {
  if (!hours) return null;
  const day = hours[dayKeyAt(at, timezone)];
  return day ? `${day.open}–${day.close}` : CLOSED;
}

export interface HoursRow {
  /** «Пн–Пт», «Сб», «Щодня». */
  days: string;
  /** «08:00–22:00» or «зачинено». */
  text: string;
}

/**
 * The week as a reader wants it: runs of neighbouring days with the same hours
 * folded into one row. Sunday and Monday are not neighbours (the week starts
 * on Monday), so «Нд, Пн» never appears as a range.
 */
export function groupHours(hours: WeekHours | null): HoursRow[] {
  if (!hours) return [];
  const rows: Array<{ first: DayKey; last: DayKey; text: string }> = [];
  for (const key of DAY_KEYS) {
    const day = hours[key];
    const text = day ? `${day.open}–${day.close}` : CLOSED;
    const previous = rows[rows.length - 1];
    if (previous && previous.text === text) previous.last = key;
    else rows.push({ first: key, last: key, text });
  }
  if (rows.length === 1) return [{ days: 'Щодня', text: rows[0]!.text }];
  return rows.map((row) => ({
    days: row.first === row.last ? DAY_SHORT[row.first] : `${DAY_SHORT[row.first]}–${DAY_SHORT[row.last]}`,
    text: row.text,
  }));
}

// ── address, phone, logo ────────────────────────────────────────────

const ADDRESS_MAX = 200;
const PHONE_MAX = 32;

/** Free text, one line: control characters and line breaks become spaces. */
export function normalizeAddress(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new ProfileError('Адреса має бути текстом');
  const text = oneLine(raw);
  if (text.length > ADDRESS_MAX) throw new ProfileError(`Адреса задовга: не більше ${ADDRESS_MAX} символів`);
  return text || null;
}

/**
 * A phone as the owner writes it — «+380 44 123-45-67», «(044) 123 45 67» —
 * kept as typed (with the spaces collapsed) because that is how the page shows
 * it, and checked by its digits: 7 to 15, an optional leading «+».
 */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new ProfileError('Телефон має бути текстом');
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (text.length > PHONE_MAX || !/^\+?[0-9()\-\s.]+$/.test(text) || digits.length < 7 || digits.length > 15) {
    throw new ProfileError('Телефон: від 7 до 15 цифр, можна з «+», пробілами, дужками й дефісами');
  }
  return text;
}

/** The `tel:` address for a stored phone: its digits, with the leading «+» if it had one. Null for anything that has no digits. */
export function phoneHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return `tel:${phone.trim().startsWith('+') ? '+' : ''}${digits}`;
}

/** What a saved upload looks like: `<uuid>.<ext>` under `/pos-uploads/` — a path this backend issued, nothing else. */
const LOGO_RE = /^\/pos-uploads\/[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,5}$/;

export function normalizeLogoUrl(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string' || !LOGO_RE.test(raw)) {
    throw new ProfileError('Логотип: завантажте картинку кнопкою «Обрати файл»');
  }
  return raw;
}

// ── the patch ───────────────────────────────────────────────────────

export interface ProfilePatch {
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  hours?: WeekHours | null;
}

export const PROFILE_FIELDS = ['logo_url', 'address', 'phone', 'hours'] as const;

/**
 * The fields the owner sent, each checked. An absent field means «leave it», a
 * `null` one means «clear it» — so a card that only changed the phone cannot
 * wipe the hours by not mentioning them.
 */
export function normalizeProfilePatch(body: Record<string, unknown>): ProfilePatch {
  const patch: ProfilePatch = {};
  if (body.logo_url !== undefined) patch.logo_url = normalizeLogoUrl(body.logo_url);
  if (body.address !== undefined) patch.address = normalizeAddress(body.address);
  if (body.phone !== undefined) patch.phone = normalizePhone(body.phone);
  if (body.hours !== undefined) patch.hours = normalizeHours(body.hours);
  return patch;
}
