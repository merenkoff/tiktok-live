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
import type { PosAuthContext, PosRole, QrPaymentPublicConfig } from './types.js';

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
    qr_payment: QrPaymentPublicConfig;
    auto_print_receipt: boolean;
    /** Effective toggleable module ids (empty stored set resolves to the defaults). */
    enabled_modules: string[];
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
      qr_payment: auth.qrPayment,
      auto_print_receipt: auth.autoPrintReceipt,
      enabled_modules: effectiveEnabledModules(auth.enabledModules),
    },
  };
}

export async function loginOwner(login: string, password: string): Promise<AuthResponse | null> {
  const normalized = login.trim().toLowerCase();
  const result = await pool.query(
    `SELECT st.*, store.name AS store_name, store.slug AS store_slug, store.currency
     FROM pos_staff st
     JOIN pos_stores store ON store.id = st.store_id
     WHERE st.role = 'owner'
       AND st.is_active = TRUE
       AND lower(st.login) = $1`,
    [normalized]
  );

  if (result.rows.length === 0) return null;
  const staff = result.rows[0];
  if (!staff.password_hash) return null;

  const ok = await verifyPassword(password, staff.password_hash);
  if (!ok) return null;

  logger.info('POS owner login', { staffId: staff.id, storeId: staff.store_id });
  return createSession(Number(staff.store_id), Number(staff.id));
}

export async function loginWithPin(storeSlug: string, pin: string): Promise<AuthResponse | null> {
  const slug = storeSlug.trim().toLowerCase();
  const normalizedPin = normalizePin(pin);
  if (!isValidPin(normalizedPin)) return null;

  const storeResult = await pool.query(`SELECT id FROM pos_stores WHERE slug = $1`, [slug]);
  if (storeResult.rows.length === 0) return null;
  const storeId = Number(storeResult.rows[0].id);

  const staffResult = await pool.query(
    `SELECT * FROM pos_staff
     WHERE store_id = $1 AND is_active = TRUE AND pin_hash IS NOT NULL`,
    [storeId]
  );

  for (const staff of staffResult.rows) {
    const ok = await verifyPin(normalizedPin, staff.pin_hash);
    if (ok) {
      logger.info('POS PIN login', { staffId: staff.id, storeId });
      return createSession(storeId, Number(staff.id));
    }
  }

  return null;
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
