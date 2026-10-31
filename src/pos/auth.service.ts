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
import { getVertical, publicConfigOf } from './verticals/index.js';
import { clearPinMisses, reservePinAttempt, type PinLock } from './pin-attempts.js';
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
  };
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

  return toAuthResponse(auth, expiresAt);
}

function toAuthResponse(auth: PosAuthContext, expiresAt: Date): AuthResponse {
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
      feedback_url: auth.feedbackUrl,
      enabled_modules: effectiveEnabledModules(auth.enabledModules),
      module_remotes: auth.moduleRemotes,
      nav_overrides: auth.navOverrides,
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
  | { kind: 'invalid'; lock: PinLock | null }
  | { kind: 'locked'; lock: PinLock };

export async function attemptPinLogin(storeSlug: string, pin: string): Promise<PinLoginOutcome> {
  const slug = storeSlug.trim().toLowerCase();
  const normalizedPin = normalizePin(pin);
  if (!isValidPin(normalizedPin)) return { kind: 'invalid', lock: null };

  const storeResult = await pool.query(`SELECT id FROM pos_stores WHERE slug = $1`, [slug]);
  if (storeResult.rows.length === 0) return { kind: 'invalid', lock: null };
  const storeId = Number(storeResult.rows[0].id);

  const reservation = await reservePinAttempt(storeId);
  if (!reservation.ok) return { kind: 'locked', lock: reservation.lock };

  const staffResult = await pool.query(
    `SELECT * FROM pos_staff
     WHERE store_id = $1 AND is_active = TRUE AND pin_hash IS NOT NULL`,
    [storeId]
  );

  for (const staff of staffResult.rows) {
    const ok = await verifyPin(normalizedPin, staff.pin_hash);
    if (ok) {
      await clearPinMisses(storeId);
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
  return toAuthResponse(auth, expiresAt);
}

export async function listStaff(storeId: number) {
  const result = await pool.query(
    `SELECT id, store_id, role, display_name, login, is_active, created_at,
            (pin_hash IS NOT NULL) AS has_pin
     FROM pos_staff
     WHERE store_id = $1
     ORDER BY role ASC, display_name ASC`,
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

export async function createSeller(
  storeId: number,
  displayName: string,
  pin: string
): Promise<{ id: number }> {
  const normalizedPin = normalizePin(pin);
  if (!isValidPin(normalizedPin)) {
    throw new Error('PIN must be 4-6 digits');
  }
  const pinHash = await hashPin(normalizedPin);
  const result = await pool.query(
    `INSERT INTO pos_staff (store_id, role, display_name, pin_hash)
     VALUES ($1, 'seller', $2, $3)
     RETURNING id`,
    [storeId, displayName.trim(), pinHash]
  );
  return { id: Number(result.rows[0].id) };
}

export async function setStaffPin(storeId: number, staffId: number, pin: string): Promise<void> {
  const normalizedPin = normalizePin(pin);
  if (!isValidPin(normalizedPin)) {
    throw new Error('PIN must be 4-6 digits');
  }
  const pinHash = await hashPin(normalizedPin);
  const result = await pool.query(
    `UPDATE pos_staff
     SET pin_hash = $1, updated_at = NOW()
     WHERE id = $2 AND store_id = $3
     RETURNING id`,
    [pinHash, staffId, storeId]
  );
  if (result.rows.length === 0) {
    throw new Error('Staff not found');
  }
  // The owner's rule: a new PIN for anyone reopens PIN login, like «Розблокувати».
  await clearPinMisses(storeId);
}

export async function setStaffActive(
  storeId: number,
  staffId: number,
  isActive: boolean
): Promise<void> {
  const result = await pool.query(
    `UPDATE pos_staff
     SET is_active = $1, updated_at = NOW()
     WHERE id = $2 AND store_id = $3 AND role = 'seller'
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
