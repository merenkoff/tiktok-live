import type { AuthResponse } from '../types';
import { db, type StaffUnlockRow } from './db';
import { OfflineAuthError } from './errors';

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
    kind: params.kind,
    loginHint: params.loginHint?.trim().toLowerCase() || null,
    saltB64: toB64(salt),
    hashB64: toB64(hash),
    iterations: ITERATIONS,
    updatedAt: Date.now(),
  };
  await db.staffUnlock.put(row);
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
    },
    store: {
      id: row.storeId,
      name: row.storeName,
      slug: row.storeSlug,
      currency: row.storeCurrency,
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
  liveAuth: AuthResponse | null
): Promise<AuthResponse> {
  const hint = login.trim().toLowerCase();
  const rows = await db.staffUnlock.filter((r) => r.kind === 'password').toArray();
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
