// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { AuthResponse, FiscalProviderId } from '../types';
import { DEFAULT_ENABLED_MODULE_IDS } from '../modules/constants';
import { DEFAULT_VERTICAL } from '../lib/vertical';
import { db, type StaffUnlockRow } from './db';
import { OfflineAuthError } from './errors';

const DEFAULT_MODULES: string[] = [...DEFAULT_ENABLED_MODULE_IDS];

const ITERATIONS = 100_000;
const encoder = new TextEncoder();

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function deriveBits(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return new Uint8Array(bits);
}

function unlockId(storeSlug: string, staffId: number): string {
  return `${storeSlug.toLowerCase()}:${staffId}`;
}

export async function saveStaffUnlock(params: {
  auth: AuthResponse;
  secret: string;
  kind: 'pin' | 'password';
  loginHint?: string | null;
}): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(params.secret, salt, ITERATIONS);
  const row: StaffUnlockRow = {
    id: unlockId(params.auth.store.slug, params.auth.staff.id),
    storeSlug: params.auth.store.slug.toLowerCase(),
    storeId: params.auth.store.id,
    storeName: params.auth.store.name,
    storeCurrency: params.auth.store.currency,
    staffId: params.auth.staff.id,
    displayName: params.auth.staff.display_name,
    role: params.auth.staff.role,
    blockedSections: params.auth.staff.blocked_sections ?? [],
    kind: params.kind,
    loginHint: params.loginHint?.trim().toLowerCase() || null,
    saltB64: toB64(salt),
    hashB64: toB64(hash),
    iterations: ITERATIONS,
    updatedAt: Date.now(),
    qrPaymentEnabled: params.auth.store.qr_payment?.enabled ?? false,
    qrPaymentMode: params.auth.store.qr_payment?.mode ?? 'static',
    qrStaticImageUrl: params.auth.store.qr_payment?.static_image_url ?? null,
    autoPrintReceipt: params.auth.store.auto_print_receipt ?? false,
    vertical: params.auth.store.vertical ?? null,
    enabledModules: params.auth.store.enabled_modules ?? DEFAULT_MODULES,
    navOverrides: params.auth.store.nav_overrides ?? {},
    fiscalEnabled: params.auth.store.fiscal?.enabled ?? false,
    moduleRemotes: params.auth.store.module_remotes ?? {},
    fiscalProvider: params.auth.store.fiscal?.provider ?? null,
    fiscal: params.auth.store.fiscal ?? null,
    ...storeSettingsOf(params.auth.store, null),
  };
  await db.staffUnlock.put(row);
}

type StoreSettings = Pick<
  StaffUnlockRow,
  'cashRounding' | 'ageCheck' | 'attribution' | 'feedbackUrl' | 'floristLabourBps' | 'bottles'
>;

/**
 * The store's own settings that the sell screen and the receipt read off the
 * session — everything in `AuthResponse['store']` that is neither identity nor
 * one of the blocks cached above.
 *
 * A field the answer does not carry at all is «not said» (an older backend, an
 * older cached auth), never «off»: it keeps what the row already knows, and on
 * a first write is left out so the row reads exactly as an old one. `null` for
 * `feedback_url` IS said — the owner takes no feedback — which is why this
 * compares with `undefined` rather than using `??`.
 */
function storeSettingsOf(store: AuthResponse['store'], row: StaffUnlockRow | null): StoreSettings {
  const said = <T,>(value: T | undefined, known: T | undefined): T | undefined =>
    value !== undefined ? value : known;
  const next: StoreSettings = {
    cashRounding: said(store.cash_rounding, row?.cashRounding),
    ageCheck: said(store.age_check, row?.ageCheck),
    attribution: said(store.attribution, row?.attribution),
    feedbackUrl: said(store.feedback_url, row?.feedbackUrl),
    floristLabourBps: said(store.florist_labour_bps, row?.floristLabourBps),
    bottles: said(store.bottles, row?.bottles),
  };
  // Dexie's `update` deletes a key it is handed as `undefined`; an absent key
  // is the same thing said without the write.
  for (const key of Object.keys(next) as Array<keyof StoreSettings>) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

/**
 * Refresh the cached store flags without re-deriving the PIN verifier.
 *
 * `saveStaffUnlock` needs the raw secret, so it can only run at login — which
 * means every cached flag (`autoPrintReceipt`, `enabledModules`, the QR config,
 * and now `fiscal`) went stale until the next online login. A store that
 * enabled ПРРО at noon would keep queuing offline sales on a till that logged
 * in at nine, which is precisely the case the offline block exists to stop.
 * Called from the online login and from every successful `/me`.
 */
export async function updateStaffUnlockStoreFlags(auth: AuthResponse): Promise<void> {
  if (auth.offlineSession) return;
  const id = unlockId(auth.store.slug, auth.staff.id);
  const row = await db.staffUnlock.get(id);
  if (!row) return;
  await db.staffUnlock.update(id, {
    // The owner who closes «Ефір» for a cashier at noon expects tomorrow's
    // offline morning to hide it too.
    blockedSections: auth.staff.blocked_sections ?? row.blockedSections ?? [],
    storeName: auth.store.name,
    storeCurrency: auth.store.currency,
    qrPaymentEnabled: auth.store.qr_payment?.enabled ?? row.qrPaymentEnabled ?? false,
    qrPaymentMode: auth.store.qr_payment?.mode ?? row.qrPaymentMode ?? 'static',
    qrStaticImageUrl: auth.store.qr_payment?.static_image_url ?? null,
    autoPrintReceipt: auth.store.auto_print_receipt ?? false,
    // A store whose vertical changed at noon must not keep selling from the
    // wrong catalog on a till that logged in at nine.
    vertical: auth.store.vertical ?? row.vertical ?? null,
    enabledModules: auth.store.enabled_modules ?? DEFAULT_MODULES,
    navOverrides: auth.store.nav_overrides ?? row.navOverrides ?? {},
    fiscalEnabled: auth.store.fiscal?.enabled ?? false,
    fiscalProvider: auth.store.fiscal?.provider ?? null,
    // The requisites the receipt header is printed from, the register's own
    // number and the rate code all live in here: a till that logs in cold
    // tomorrow prints from this row.
    fiscal: auth.store.fiscal ?? null,
    moduleRemotes: auth.store.module_remotes ?? row.moduleRemotes ?? {},
    // The owner who switches cash rounding on at noon expects tomorrow's
    // offline morning to round too — and a row written by a build that did
    // not keep these learns them here, without anyone typing a PIN again.
    ...storeSettingsOf(auth.store, row),
  });
}

async function verifyRow(row: StaffUnlockRow, secret: string): Promise<boolean> {
  const salt = fromB64(row.saltB64);
  const expected = fromB64(row.hashB64);
  const actual = await deriveBits(secret, salt, row.iterations);
  return timingSafeEqual(expected, actual);
}

function sessionFromUnlock(row: StaffUnlockRow, liveAuth: AuthResponse | null): AuthResponse {
  const liveOk =
    liveAuth &&
    liveAuth.staff.id === row.staffId &&
    liveAuth.store.id === row.storeId &&
    Boolean(liveAuth.token) &&
    !liveAuth.token.startsWith('offline:') &&
    new Date(liveAuth.expires_at).getTime() > Date.now();

  if (liveOk && liveAuth) {
    return { ...liveAuth, offlineSession: false };
  }

  return {
    token: `offline:${row.staffId}`,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    offlineSession: true,
    staff: {
      id: row.staffId,
      display_name: row.displayName,
      role: row.role,
      blocked_sections: row.blockedSections ?? [],
    },
    store: {
      id: row.storeId,
      name: row.storeName,
      slug: row.storeSlug,
      currency: row.storeCurrency,
      qr_payment: {
        enabled: row.qrPaymentEnabled ?? false,
        mode: row.qrPaymentMode ?? 'static',
        static_image_url: row.qrStaticImageUrl ?? null,
      },
      auto_print_receipt: row.autoPrintReceipt ?? false,
      // The settings the payment screen and the receipt read. A row written
      // before they were kept yields what such a session always had: no
      // rounding, no age question, no feedback QR, no assembly charge, no
      // «Пляшки» — until the next online login or `/me` fills the row in.
      cash_rounding: row.cashRounding ?? 0,
      age_check: row.ageCheck ?? false,
      attribution: row.attribution ?? false,
      feedback_url: row.feedbackUrl ?? null,
      florist_labour_bps: row.floristLabourBps ?? 0,
      bottles: row.bottles ?? false,
      // A row written before verticals existed yields clothing, which is what
      // that store was.
      vertical: row.vertical ?? DEFAULT_VERTICAL,
      enabled_modules: row.enabledModules ?? DEFAULT_MODULES,
      module_remotes: row.moduleRemotes ?? {},
      nav_overrides: row.navOverrides ?? {},
      // A row written before the whole block was cached still yields a
      // correct switch; what it cannot yield is the receipt header, which is
      // why an offline stamp refuses without requisites.
      fiscal: row.fiscal ?? {
        enabled: row.fiscalEnabled ?? false,
        provider: (row.fiscalProvider as FiscalProviderId | null) ?? null,
      },
    },
  };
}

export async function localPinLogin(
  storeSlug: string,
  pin: string,
  liveAuth: AuthResponse | null
): Promise<AuthResponse> {
  const slug = storeSlug.trim().toLowerCase();
  const rows = await db.staffUnlock.where('storeSlug').equals(slug).toArray();
  const pinRows = rows.filter((r) => r.kind === 'pin');
  if (pinRows.length === 0) {
    throw new OfflineAuthError('Перший вхід на цій касі потребує інтернету', 'no_cache');
  }
  for (const row of pinRows) {
    if (await verifyRow(row, pin)) return sessionFromUnlock(row, liveAuth);
  }
  throw new OfflineAuthError('Невірний логін, пароль або PIN.', 'mismatch');
}

export async function localOwnerLogin(
  login: string,
  password: string,
  liveAuth: AuthResponse | null,
  storeSlug?: string
): Promise<AuthResponse> {
  const hint = login.trim().toLowerCase();
  // The same email may own several stores; the code says which one is meant.
  const slug = storeSlug?.trim().toLowerCase() || null;
  const rows = await db.staffUnlock
    .filter((r) => r.kind === 'password' && (slug === null || r.storeSlug === slug))
    .toArray();
  const matches = rows.filter((r) => r.loginHint === hint);
  const candidates = matches.length > 0 ? matches : rows.filter((r) => r.role === 'owner');
  if (candidates.length === 0) {
    throw new OfflineAuthError('Перший вхід на цій касі потребує інтернету', 'no_cache');
  }
  for (const row of candidates) {
    if (await verifyRow(row, password)) return sessionFromUnlock(row, liveAuth);
  }
  throw new OfflineAuthError('Невірний логін, пароль або PIN.', 'mismatch');
}

export async function hasUnlockForAuth(auth: AuthResponse): Promise<boolean> {
  const row = await db.staffUnlock.get(unlockId(auth.store.slug, auth.staff.id));
  return Boolean(row);
}
