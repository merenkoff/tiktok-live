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

// ── email, social networks, the Google card (phase F1) ──────────────

const EMAIL_MAX = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** One address, as typed but trimmed; checked loosely — a mailto: link, not a mailbox probe. */
export function normalizeEmail(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new ProfileError('Email має бути текстом');
  const text = raw.trim();
  if (!text) return null;
  if (text.length > EMAIL_MAX || !EMAIL_RE.test(text)) {
    throw new ProfileError('Email: вкажіть адресу виду name@example.com');
  }
  return text;
}

export type SocialNetwork = 'instagram' | 'facebook' | 'tiktok';

/**
 * What a handle may be, per network — Instagram's own rule (letters, digits,
 * dots and underscores, up to 30), TikTok's (24), a Facebook page name (dots
 * and hyphens too). An owner usually pastes the whole address from the
 * browser, so a URL on the network's own host is read down to its handle.
 */
const SOCIAL: Record<SocialNetwork, { label: string; hostRe: RegExp; handleRe: RegExp; max: number }> = {
  instagram: {
    label: 'Instagram',
    hostRe: /^https?:\/\/(?:www\.)?instagram\.com\/@?([^/?#]+)/i,
    handleRe: /^[A-Za-z0-9._]{1,30}$/,
    max: 30,
  },
  facebook: {
    label: 'Facebook',
    hostRe: /^https?:\/\/(?:www\.|m\.)?facebook\.com\/([^/?#]+)/i,
    handleRe: /^[A-Za-z0-9.-]{1,80}$/,
    max: 80,
  },
  tiktok: {
    label: 'TikTok',
    hostRe: /^https?:\/\/(?:www\.)?tiktok\.com\/@?([^/?#]+)/i,
    handleRe: /^[A-Za-z0-9._]{1,24}$/,
    max: 24,
  },
};

/** A handle for `network`: «@нік», «нік» or the profile's address all read as «нік». */
export function normalizeHandle(raw: unknown, network: SocialNetwork): string | null {
  const spec = SOCIAL[network];
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new ProfileError(`${spec.label} має бути текстом`);
  let text = raw.trim();
  if (!text) return null;
  const fromUrl = spec.hostRe.exec(text);
  if (fromUrl) text = fromUrl[1]!;
  text = text.replace(/^@/, '').replace(/\/+$/, '');
  if (!text) return null;
  if (!spec.handleRe.test(text)) {
    throw new ProfileError(
      `${spec.label}: вкажіть нік без «@» — те, що стоїть в адресі після ${
        network === 'instagram' ? 'instagram.com/' : network === 'facebook' ? 'facebook.com/' : 'tiktok.com/@'
      } (до ${spec.max} символів)`
    );
  }
  return text;
}

/** The profile's address for a stored handle. Handles are checked on the way in, so nothing here needs escaping beyond the page's own. */
export function socialUrl(network: SocialNetwork, handle: string): string {
  const safe = encodeURIComponent(handle);
  if (network === 'instagram') return `https://www.instagram.com/${safe}/`;
  if (network === 'facebook') return `https://www.facebook.com/${safe}`;
  return `https://www.tiktok.com/@${safe}`;
}

const GOOGLE_URL_MAX = 300;
/** Google's own hosts for a place's card, a Maps link or a «write a review» link — and nothing that merely contains the word. */
const GOOGLE_HOSTS = new Set(['google.com', 'google.com.ua', 'share.google', 'maps.app.goo.gl', 'goo.gl', 'g.page', 'g.co']);

function isGoogleHost(host: string): boolean {
  return GOOGLE_HOSTS.has(host) || host.endsWith('.google.com') || host.endsWith('.google.com.ua');
}

/**
 * The one address we take from an owner: the place's Google card. `https`
 * only, on a Google host only, with no credentials in it — the page prints it
 * escaped and the guest follows it in a new tab.
 */
export function normalizeGoogleUrl(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new ProfileError('Посилання на Google має бути текстом');
  const text = raw.trim();
  if (!text) return null;
  const refuse = (): never => {
    throw new ProfileError(
      'Посилання на Google: скопіюйте його з Google Maps («Поділитися» → «Копіювати посилання»); приймаються лише адреси https на google.com, maps.app.goo.gl, share.google, g.page'
    );
  };
  if (text.length > GOOGLE_URL_MAX) refuse();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return refuse();
  }
  if (url.protocol !== 'https:' || url.username || url.password || !isGoogleHost(url.hostname.toLowerCase())) refuse();
  return text;
}

// ── house rules: the cork fee (phase F2) ────────────────────────────

/**
 * The place's own-alcohol terms, as the page prints them under its name from
 * any QR. Two figures the page formats itself, and the owner's own words.
 */
export interface Corkage {
  /** Per bottle, in kopecks; 0 means «свій алкоголь без збору» — a rule too. */
  fee_cents: number;
  /** The least a guest must order in food, per person, in kopecks — or null. */
  min_food_cents: number | null;
  /** Several lines in the owner's words under the figures, or null. */
  note: string | null;
}

/** 10 000 ₴ a bottle and 100 000 ₴ a guest: wide enough for any real rule, narrow enough to catch a sum typed in kopecks twice. */
export const CORKAGE_FEE_MAX_CENTS = 1_000_000;
export const CORKAGE_MIN_FOOD_MAX_CENTS = 10_000_000;
export const CORKAGE_NOTE_MAX = 600;

function wholeKopecks(value: unknown, what: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new ProfileError(`${what}: ціле число копійок від 0 до ${max}`);
  }
  return value;
}

/** Several lines: each made one line, blank ones dropped — a note is sentences, not layout. */
export function multiLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map(oneLine)
    .filter((line) => line !== '')
    .join('\n');
}

export function normalizeCorkage(raw: unknown): Corkage | null {
  if (raw === null) return null;
  if (!isPlainObject(raw)) {
    throw new ProfileError('Корковий збір: очікується збір за пляшку, мінімальне замовлення й умови');
  }
  const fee = wholeKopecks(raw.fee_cents, 'Корковий збір за пляшку', CORKAGE_FEE_MAX_CENTS);
  const min =
    raw.min_food_cents == null
      ? null
      : wholeKopecks(raw.min_food_cents, 'Мінімальне замовлення страв', CORKAGE_MIN_FOOD_MAX_CENTS);
  let note: string | null = null;
  if (raw.note != null) {
    if (typeof raw.note !== 'string') throw new ProfileError('Умови свого алкоголю мають бути текстом');
    const text = multiLine(raw.note);
    if (text.length > CORKAGE_NOTE_MAX) {
      throw new ProfileError(`Умови свого алкоголю задовгі: не більше ${CORKAGE_NOTE_MAX} символів`);
    }
    note = text || null;
  }
  // A zero minimum is no minimum.
  return { fee_cents: fee, min_food_cents: min ? min : null, note };
}

/** The terms as the database hands them back; anything that no longer passes reads as «not shown». */
export function readCorkage(raw: unknown): Corkage | null {
  try {
    return normalizeCorkage(raw ?? null);
  } catch {
    return null;
  }
}

// ── the patch ───────────────────────────────────────────────────────

export interface ProfilePatch {
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  hours?: WeekHours | null;
  email?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  google_url?: string | null;
  corkage?: Corkage | null;
}

export const PROFILE_FIELDS = [
  'logo_url',
  'address',
  'phone',
  'hours',
  'email',
  'instagram',
  'facebook',
  'tiktok',
  'google_url',
  'corkage',
] as const;

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
  if (body.email !== undefined) patch.email = normalizeEmail(body.email);
  if (body.instagram !== undefined) patch.instagram = normalizeHandle(body.instagram, 'instagram');
  if (body.facebook !== undefined) patch.facebook = normalizeHandle(body.facebook, 'facebook');
  if (body.tiktok !== undefined) patch.tiktok = normalizeHandle(body.tiktok, 'tiktok');
  if (body.google_url !== undefined) patch.google_url = normalizeGoogleUrl(body.google_url);
  if (body.corkage !== undefined) patch.corkage = normalizeCorkage(body.corkage);
  return patch;
}
