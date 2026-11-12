// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/auth.service.ts

import { pool } from '../db.js';
import { logger } from '../logger.js';
import {
  generateSessionToken,
  hashPin,
  isValidPin,
  normalizePin,
  verifyPassword,
  verifyPin,
} from './core/crypto.js';
import { getAuthByToken, sessionExpiresAt } from './core/auth.js';
import { effectiveEnabledModules } from './core/modules.js';
import { getVertical, publicConfigOf, verticalOffersRole } from './verticals/index.js';
import { ROLE_UNAVAILABLE } from './core/roles.js';
import { clearPinMisses, reservePinAttempt, type PinLock } from './pin-attempts.js';
import { moduleRemotesForTill } from './license/moduleToken.js';
import type { VerticalPublicConfig } from './verticals/types.js';
import type {
  FiscalPublicConfig,
  ModuleRemoteEntry,
  NavOverrides,
  PosAuthContext,
  PosRole,
  QrPaymentPublicConfig,
} from './types.js';

export interface AuthResponse {
  token: string;
  expires_at: string;
  staff: {
    id: number;
    display_name: string;
    role: PosRole;
  };
  store: {
    id: number;
    name: string;
    slug: string;
    currency: string;
    /**
     * The store's sales vertical: its product attribute schema, its units and
     * the id of the module that supplies the sell screen's catalog.
     *
     * It travels with the login for the same reason the module set does — the
     * desktop cashier rebuilds its whole session from the cached `pos_auth`
     * when it starts cold offline, and a till that forgets what it sells shows
     * the wrong catalog and the wrong product fields.
     */
    vertical: VerticalPublicConfig;
    qr_payment: QrPaymentPublicConfig;
    /**
     * Whether this store fiscalises (ПРРО), and with whom — no credentials.
     * The desktop cashier reads this out of its cached `pos_auth` to refuse an
     * offline sale for a fiscalising store, so it has to travel with the login.
     */
    fiscal: FiscalPublicConfig;
    auto_print_receipt: boolean;
    /**
     * Assembly charge on a composite, in basis points. Travels with the login
     * for the same reason as `fiscal`: cold-offline, the cached `pos_auth` is
     * the only place the till can read it, and a bouquet it prices without it
     * would disagree with the server once the sale syncs.
     */
    florist_labour_bps: number;
    /**
     * Cash totals rounded to 0 (off), 10 or 50 kopecks (НБУ № 25, migration
     * 071). With the login for the same reason as `florist_labour_bps`: the
     * offline till shows and prints the rounded sum the server will file.
     */
    cash_rounding: number;
    /** Ask «Покупцю є 18 років?» once per receipt with excise goods (migration 102). */
    age_check: boolean;
    /**
     * The guest menu's feedback sheet — what the till prints as the QR
     * «Оцініть нас» at the bottom of a receipt (phase F7). Null unless the
     * menu is published, the owner takes feedback and the store has a kitchen.
     * With the login because the receipt is printed offline too; the owner's
     * switch reaches a till at its next login.
     */
    feedback_url: string | null;
    /** Effective toggleable module ids (empty stored set resolves to the defaults). */
    enabled_modules: string[];
    /**
     * Per-store module-remote map. A string value overrides a bundled module's
     * code (web, roadmap #9); an object value declares a new online-only module
     * for the desktop cashier (roadmap #13 Part C).
     */
    module_remotes: Record<string, string | ModuleRemoteEntry>;
    /**
     * Per-store menu appearance (label/icon/order per nav entry). It travels
     * with the login for the same reason the module set does: the desktop
     * cashier rebuilds its whole session from the cached `pos_auth` when it
     * starts cold offline, and a menu that reverts to factory labels there is
     * exactly the moment the cashier needs it not to.
     */
    nav_overrides: NavOverrides;
    /**
     * The store pours from bottles opened by their excise stamp (track ДК,
     * ДК5): some active variant has `bottle_ml`. Draws «Пляшки» on the till
     * rail and in the owner's sidebar; read at login and at `/auth/me`.
     */
    bottles: boolean;
  };
}

/** Does this store pour from stamped bottles (ДК5)? One indexed probe, at login only. */
async function storeHasBottles(storeId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM pos_variants WHERE store_id = $1 AND bottle_ml IS NOT NULL AND is_active LIMIT 1`,
    [storeId]
  );
  return result.rows.length > 0;
}

async function createSession(storeId: number, staffId: number): Promise<AuthResponse> {
  const token = generateSessionToken();
  const expiresAt = sessionExpiresAt();

  await pool.query(
    `INSERT INTO pos_sessions (store_id, staff_id, token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [storeId, staffId, token, expiresAt]
  );

  const auth = await getAuthByToken(token);
  if (!auth) {
    throw new Error('Failed to create session');
  }

  return toAuthResponse(auth, expiresAt, await storeHasBottles(storeId), await moduleRemotesForTill(auth.moduleRemotes));
}

/**
 * `moduleRemotes` is the store's map as a till should receive it: bare module
 * URLs of the licence server carry this copy's delivery token
 * (`moduleRemotesForTill`, POS_OPENCORE.md §8) — the stored map never does.
 */
function toAuthResponse(
  auth: PosAuthContext,
  expiresAt: Date,
  bottles: boolean,
  moduleRemotes: AuthResponse['store']['module_remotes']
): AuthResponse {
  return {
    token: auth.token,
    expires_at: expiresAt.toISOString(),
    staff: {
      id: auth.staffId,
      display_name: auth.displayName,
      role: auth.role,
    },
    store: {
      id: auth.storeId,
      name: auth.storeName,
      slug: auth.storeSlug,
      currency: auth.currency,
      vertical: publicConfigOf(getVertical(auth.vertical)),
      qr_payment: auth.qrPayment,
      fiscal: auth.fiscal,
      auto_print_receipt: auth.autoPrintReceipt,
      florist_labour_bps: auth.floristLabourBps,
      cash_rounding: auth.cashRounding,
      age_check: auth.ageCheck,
      feedback_url: auth.feedbackUrl,
      enabled_modules: effectiveEnabledModules(auth.enabledModules),
      module_remotes: moduleRemotes,
      nav_overrides: auth.navOverrides,
      bottles,
    },
  };
}

/**
 * A login is unique per store, not across stores (`idx_pos_staff_store_login`),
 * so one email can own several shops. The store code picks which one; without
 * it — a till built before the login form asked for the code — every owner row
 * with that login is tried oldest first, which is the store the bare
 * `rows[0]` used to land on, except that a wrong guess no longer fails a
 * password that is right for another of the rows.
 */
export async function loginOwner(
  login: string,
  password: string,
  storeSlug?: string | null
): Promise<AuthResponse | null> {
  const normalized = login.trim().toLowerCase();
  const slug = storeSlug?.trim().toLowerCase() || null;
  const result = await pool.query(
    `SELECT st.id, st.store_id, st.password_hash
     FROM pos_staff st
     JOIN pos_stores store ON store.id = st.store_id
     WHERE st.role = 'owner'
       AND st.is_active = TRUE
       AND lower(st.login) = $1
       AND ($2::text IS NULL OR lower(store.slug) = $2)
     ORDER BY st.id`,
    [normalized, slug]
  );

  for (const staff of result.rows) {
    if (!staff.password_hash) continue;
    if (!(await verifyPassword(password, staff.password_hash))) continue;
    logger.info('POS owner login', {
      staffId: staff.id,
      storeId: staff.store_id,
      byStoreCode: slug !== null,
    });
    return createSession(Number(staff.store_id), Number(staff.id));
  }
  return null;
}

/**
 * One PIN login, as the route answers it: a session, a wrong PIN (with the
 * lock that miss earned, if any — misses 5 and on close PIN login for a while,
 * `pin-attempts.ts`), or a refusal because PIN login is closed right now.
 *
 * An unknown store and a malformed PIN are `invalid` with no lock and count
 * nothing: there is no store to count against, and no PIN was compared.
 */
export type PinLoginOutcome =
  | { kind: 'ok'; auth: AuthResponse }
  /** The PIN was right, but the role cannot work here (a marketer outside a café, М3). */
  | { kind: 'refused'; error: string }
  | { kind: 'invalid'; lock: PinLock | null }
  | { kind: 'locked'; lock: PinLock };

export async function attemptPinLogin(storeSlug: string, pin: string): Promise<PinLoginOutcome> {
  const slug = storeSlug.trim().toLowerCase();
  const normalizedPin = normalizePin(pin);
  if (!isValidPin(normalizedPin)) return { kind: 'invalid', lock: null };

  const storeResult = await pool.query(`SELECT id, vertical FROM pos_stores WHERE slug = $1`, [slug]);
  if (storeResult.rows.length === 0) return { kind: 'invalid', lock: null };
  const storeId = Number(storeResult.rows[0].id);
  const vertical = storeResult.rows[0].vertical as string | null;

  const reservation = await reservePinAttempt(storeId);
  if (!reservation.ok) return { kind: 'locked', lock: reservation.lock };

  const staffResult = await pool.query(
    // Oldest first: two people who still share a PIN from before it had to be
    // unique (track МР) always resolve to the same one, never at random.
    `SELECT * FROM pos_staff
     WHERE store_id = $1 AND is_active = TRUE AND pin_hash IS NOT NULL
     ORDER BY id`,
    [storeId]
  );

  for (const staff of staffResult.rows) {
    const ok = await verifyPin(normalizedPin, staff.pin_hash);
    if (ok) {
      await clearPinMisses(storeId);
      if (!verticalOffersRole(vertical, String(staff.role))) {
        logger.warn('POS PIN login refused: the store no longer offers the role', {
          staffId: staff.id,
          storeId,
          role: staff.role,
        });
        return { kind: 'refused', error: ROLE_UNAVAILABLE };
      }
      logger.info('POS PIN login', { staffId: staff.id, storeId });
      return { kind: 'ok', auth: await createSession(storeId, Number(staff.id)) };
    }
  }

  if (reservation.lockIfMissed) {
    logger.warn('POS PIN login: wrong PIN, PIN login closed for a while', {
      storeId,
      miss: reservation.miss,
      until: reservation.lockIfMissed.until.toISOString(),
    });
  }
  return { kind: 'invalid', lock: reservation.lockIfMissed };
}

export class PinLoginLocked extends Error {
  constructor(readonly lock: PinLock) {
    super('PIN login is closed for this store');
  }
}

/**
 * The session for a store code and PIN, or null for a wrong one. Throws
 * `PinLoginLocked` while PIN login is closed (see `attemptPinLogin`).
 */
export async function loginWithPin(storeSlug: string, pin: string): Promise<AuthResponse | null> {
  const outcome = await attemptPinLogin(storeSlug, pin);
  if (outcome.kind === 'locked') throw new PinLoginLocked(outcome.lock);
  return outcome.kind === 'ok' ? outcome.auth : null;
}

export async function logout(token: string): Promise<void> {
  await pool.query(`DELETE FROM pos_sessions WHERE token = $1`, [token]);
}

export async function me(auth: PosAuthContext): Promise<AuthResponse> {
  const result = await pool.query(`SELECT expires_at FROM pos_sessions WHERE token = $1`, [
    auth.token,
  ]);
  const expiresAt = result.rows[0]?.expires_at
    ? new Date(result.rows[0].expires_at)
    : sessionExpiresAt();
  return toAuthResponse(
    auth,
    expiresAt,
    await storeHasBottles(auth.storeId),
    await moduleRemotesForTill(auth.moduleRemotes)
  );
}

export async function listStaff(storeId: number) {
  const result = await pool.query(
    `SELECT id, store_id, role, display_name, login, is_active, created_at,
            (pin_hash IS NOT NULL) AS has_pin
     FROM pos_staff
     WHERE store_id = $1
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'seller' THEN 1 ELSE 2 END, display_name ASC`,
    [storeId]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    store_id: Number(row.store_id),
    role: row.role as PosRole,
    display_name: row.display_name,
    login: row.login,
    is_active: row.is_active,
    has_pin: Boolean(row.has_pin),
    created_at: row.created_at,
  }));
}

/** A staff write refused in the owner's words, with the status the route answers. */
export class StaffError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400
  ) {
    super(message);
    this.name = 'StaffError';
  }
}

/** The roles an owner gives on «Співробітники»: never a second owner. */
export type StaffRole = Exclude<PosRole, 'owner'>;

function isStaffRole(value: unknown): value is StaffRole {
  return value === 'seller' || value === 'marketer';
}

/**
 * A PIN as this role must have it. A marketer's opens the cabinet, not a till,
 * so it is six digits (track МР, М2); a seller's stays four to six.
 */
function pinForRole(pin: string, role: PosRole): string {
  const normalized = normalizePin(pin);
  if (role === 'marketer') {
    if (!/^\d{6}$/.test(normalized)) throw new StaffError('PIN маркетолога — 6 цифр: він відкриває кабінет');
    return normalized;
  }
  if (!isValidPin(normalized)) throw new StaffError('PIN must be 4-6 digits');
  return normalized;
}

/**
 * Refuse a PIN another active person of the store already has. The PIN is what
 * says who logs in (`attemptPinLogin` takes the first match), so two people
 * sharing one would log in as whichever row came first — and a seller's PIN
 * opening a marketer's cabinet, or the other way round, is not a coin toss we
 * can allow. Compared against every hash: a café has a handful of people.
 */
async function assertPinFree(storeId: number, pin: string, exceptStaffId: number | null): Promise<void> {
  const others = await pool.query(
    `SELECT pin_hash FROM pos_staff
     WHERE store_id = $1 AND is_active = TRUE AND pin_hash IS NOT NULL
       AND ($2::bigint IS NULL OR id <> $2)`,
    [storeId, exceptStaffId]
  );
  for (const row of others.rows) {
    if (await verifyPin(pin, row.pin_hash)) {
      throw new StaffError('Такий PIN уже має інший співробітник — оберіть інший', 409);
    }
  }
}

/** Refuse a role the store's vertical does not offer (only the café has a marketer). */
async function assertRoleOffered(storeId: number, role: StaffRole): Promise<void> {
  const store = await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [storeId]);
  if (!verticalOffersRole(store.rows[0]?.vertical as string | null, role)) {
    throw new StaffError('Роль «Маркетолог» є лише в кафе й ресторані');
  }
}

/** A new seller or marketer, with a PIN no one else in the store has. */
export async function createStaff(
  storeId: number,
  input: { displayName: string; pin: string; role?: unknown }
): Promise<{ id: number; role: StaffRole }> {
  const role = input.role === undefined || input.role === null ? 'seller' : input.role;
  if (!isStaffRole(role)) throw new StaffError('Роль — продавець або маркетолог');
  await assertRoleOffered(storeId, role);
  const pin = pinForRole(input.pin, role);
  await assertPinFree(storeId, pin, null);
  const pinHash = await hashPin(pin);
  const result = await pool.query(
    `INSERT INTO pos_staff (store_id, role, display_name, pin_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [storeId, role, input.displayName.trim(), pinHash]
  );
  return { id: Number(result.rows[0].id), role };
}

export async function createSeller(
  storeId: number,
  displayName: string,
  pin: string
): Promise<{ id: number }> {
  const created = await createStaff(storeId, { displayName, pin, role: 'seller' });
  return { id: created.id };
}

export async function setStaffPin(storeId: number, staffId: number, pin: string): Promise<void> {
  const staff = await pool.query(`SELECT role FROM pos_staff WHERE id = $1 AND store_id = $2`, [staffId, storeId]);
  // Same order as before: a bad PIN is refused before an unknown person is.
  const normalized = pinForRole(pin, (staff.rows[0]?.role as PosRole | undefined) ?? 'seller');
  if (staff.rows.length === 0) {
    throw new Error('Staff not found');
  }
  await assertPinFree(storeId, normalized, staffId);
  const pinHash = await hashPin(normalized);
  await pool.query(
    `UPDATE pos_staff
     SET pin_hash = $1, updated_at = NOW()
     WHERE id = $2 AND store_id = $3`,
    [pinHash, staffId, storeId]
  );
  // The owner's rule: a new PIN for anyone reopens PIN login, like «Розблокувати».
  await clearPinMisses(storeId);
}

/**
 * Make a seller a marketer or the other way round (track МР, М9). Becoming a
 * marketer takes a new six-digit PIN in the same call — the stored hash cannot
 * say how long the old one is. Every session of that person ends: a till
 * logged in as a seller must not carry on as someone else.
 */
export async function setStaffRole(
  storeId: number,
  staffId: number,
  input: { role: unknown; pin?: unknown }
): Promise<{ id: number; role: StaffRole }> {
  if (!isStaffRole(input.role)) throw new StaffError('Роль — продавець або маркетолог');
  const role = input.role;
  const staff = await pool.query(`SELECT role FROM pos_staff WHERE id = $1 AND store_id = $2`, [staffId, storeId]);
  if (staff.rows.length === 0) throw new StaffError('Співробітника не знайдено', 404);
  const before = staff.rows[0].role as PosRole;
  if (before === 'owner') throw new StaffError('Роль власника не змінюється');
  await assertRoleOffered(storeId, role);
  const pinGiven = typeof input.pin === 'string' && input.pin.trim() !== '';
  if (role === 'marketer' && before !== 'marketer' && !pinGiven) {
    throw new StaffError('Маркетологу потрібен новий PIN із 6 цифр');
  }
  let pinHash: string | null = null;
  if (pinGiven) {
    const pin = pinForRole(input.pin as string, role);
    await assertPinFree(storeId, pin, staffId);
    pinHash = await hashPin(pin);
  }
  await pool.query(
    `UPDATE pos_staff
     SET role = $1, pin_hash = COALESCE($2, pin_hash), updated_at = NOW()
     WHERE id = $3 AND store_id = $4`,
    [role, pinHash, staffId, storeId]
  );
  if (before !== role) await pool.query(`DELETE FROM pos_sessions WHERE staff_id = $1`, [staffId]);
  if (pinHash) await clearPinMisses(storeId);
  return { id: staffId, role };
}

export async function setStaffActive(
  storeId: number,
  staffId: number,
  isActive: boolean
): Promise<void> {
  const result = await pool.query(
    `UPDATE pos_staff
     SET is_active = $1, updated_at = NOW()
     WHERE id = $2 AND store_id = $3 AND role <> 'owner'
     RETURNING id`,
    [isActive, staffId, storeId]
  );
  if (result.rows.length === 0) {
    throw new Error('Seller not found');
  }
  if (!isActive) {
    await pool.query(`DELETE FROM pos_sessions WHERE staff_id = $1`, [staffId]);
  }
}
