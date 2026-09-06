// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.auth.service.test.ts
//
// The two login paths differ in kind: the owner logs in with a login+password
// scoped to nothing, the cashier with a PIN scoped to a store slug — and the
// PIN path has to try every active seller's hash because a PIN carries no
// identity of its own. Both must stay closed to inactive staff, and both must
// return the store's effective module set (that payload is what the SPA boots
// its feature flags from).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import * as authService from '../pos/auth.service.js';
import { getAuthByToken } from '../pos/core/auth.js';
import { DEFAULT_ENABLED_MODULES } from '../pos/core/modules.js';
import { hashPin } from '../pos/core/crypto.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  issueToken,
  setEnabledModules,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe.skipIf(!hasDb)('POS auth service', () => {
  let store: TestStore;
  let other: TestStore;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('auth');
    other = await createTestStore('authx');
  }, 120000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
    await pool.end();
  });

  describe('loginOwner', () => {
    it('issues a usable session for the right password', async () => {
      const result = await authService.loginOwner(store.ownerLogin, store.ownerPassword);
      expect(result).not.toBeNull();
      expect(result!.staff.role).toBe('owner');
      expect(result!.store.id).toBe(store.storeId);

      const ctx = await getAuthByToken(result!.token);
      expect(ctx?.staffId).toBe(store.ownerId);
    });

    it('matches the login case-insensitively', async () => {
      const result = await authService.loginOwner(
        store.ownerLogin.toUpperCase(),
        store.ownerPassword
      );
      expect(result).not.toBeNull();
    });

    it('tolerates surrounding whitespace in the login', async () => {
      const result = await authService.loginOwner(`  ${store.ownerLogin}  `, store.ownerPassword);
      expect(result).not.toBeNull();
    });

    it('returns null on a wrong password', async () => {
      expect(await authService.loginOwner(store.ownerLogin, 'wrong-password')).toBeNull();
    });

    it('returns null for an unknown login', async () => {
      expect(await authService.loginOwner('nobody@test.local', 'x')).toBeNull();
    });

    it('refuses a deactivated owner', async () => {
      const temp = await createTestStore('authoff');
      try {
        await pool.query(`UPDATE pos_staff SET is_active = FALSE WHERE id = $1`, [temp.ownerId]);
        expect(await authService.loginOwner(temp.ownerLogin, temp.ownerPassword)).toBeNull();
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('refuses a seller even if they somehow have a login and password', async () => {
      await pool.query(
        `UPDATE pos_staff SET login = $1, password_hash = (
           SELECT password_hash FROM pos_staff WHERE id = $2
         ) WHERE id = $3`,
        [`seller-${store.slug}@test.local`, store.ownerId, store.sellerId]
      );
      const result = await authService.loginOwner(
        `seller-${store.slug}@test.local`,
        store.ownerPassword
      );
      expect(result).toBeNull();
    });

    it('returns null when the owner row has no password hash', async () => {
      const temp = await createTestStore('authnopw');
      try {
        await pool.query(`UPDATE pos_staff SET password_hash = NULL WHERE id = $1`, [
          temp.ownerId,
        ]);
        expect(await authService.loginOwner(temp.ownerLogin, temp.ownerPassword)).toBeNull();
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('loginWithPin', () => {
    it('issues a session for the matching seller', async () => {
      const result = await authService.loginWithPin(store.slug, store.sellerPin);
      expect(result).not.toBeNull();
      expect(result!.staff.id).toBe(store.sellerId);
      expect(result!.staff.role).toBe('seller');
    });

    it('accepts a PIN typed with separators', async () => {
      const result = await authService.loginWithPin(store.slug, ' 43-21 ');
      expect(result).not.toBeNull();
    });

    it('matches the store slug case-insensitively', async () => {
      const result = await authService.loginWithPin(store.slug.toUpperCase(), store.sellerPin);
      expect(result).not.toBeNull();
    });

    it('returns null for a PIN that is not 4-6 digits', async () => {
      expect(await authService.loginWithPin(store.slug, '123')).toBeNull();
      expect(await authService.loginWithPin(store.slug, '1234567')).toBeNull();
      expect(await authService.loginWithPin(store.slug, 'abcd')).toBeNull();
    });

    it('returns null for an unknown store slug', async () => {
      expect(await authService.loginWithPin('no-such-store', store.sellerPin)).toBeNull();
    });

    it('returns null for a wrong PIN', async () => {
      expect(await authService.loginWithPin(store.slug, '9999')).toBeNull();
    });

    it('does not let a PIN from one store open another', async () => {
      expect(await authService.loginWithPin(other.slug, store.sellerPin)).not.toBeNull();
      // Both fixture stores seed the same PIN, so prove the scoping by changing one.
      await authService.setStaffPin(other.storeId, other.sellerId, '5555');
      expect(await authService.loginWithPin(store.slug, '5555')).toBeNull();
      expect(await authService.loginWithPin(other.slug, '5555')).not.toBeNull();
    });

    it('skips deactivated sellers', async () => {
      const temp = await createTestStore('pinoff');
      try {
        await authService.setStaffActive(temp.storeId, temp.sellerId, false);
        expect(await authService.loginWithPin(temp.slug, temp.sellerPin)).toBeNull();
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('session payload', () => {
    it('reports the default module set for a never-configured store', async () => {
      const result = await authService.loginOwner(store.ownerLogin, store.ownerPassword);
      expect(result!.store.enabled_modules).toEqual([...DEFAULT_ENABLED_MODULES]);
      expect(result!.store.module_remotes).toEqual({});
    });

    it('reports the stored module set once configured', async () => {
      const temp = await createTestStore('authmod');
      try {
        await setEnabledModules(temp.storeId, ['products', 'stock']);
        const result = await authService.loginOwner(temp.ownerLogin, temp.ownerPassword);
        expect(result!.store.enabled_modules).toEqual(['products', 'stock']);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('carries the store QR config and print flag', async () => {
      const result = await authService.loginOwner(store.ownerLogin, store.ownerPassword);
      expect(result!.store.qr_payment).toEqual({
        enabled: false,
        mode: 'static',
        static_image_url: null,
      });
      expect(result!.store.auto_print_receipt).toBe(false);
    });

    it('dates the expiry roughly two weeks out', async () => {
      const result = await authService.loginOwner(store.ownerLogin, store.ownerPassword);
      const days = (Date.parse(result!.expires_at) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(13.9);
      expect(days).toBeLessThan(14.1);
    });
  });

  describe('logout / me', () => {
    it('logout invalidates the token', async () => {
      const session = await authService.loginOwner(store.ownerLogin, store.ownerPassword);
      await authService.logout(session!.token);
      expect(await getAuthByToken(session!.token)).toBeNull();
    });

    it('me echoes the stored expiry for the live session', async () => {
      const session = await authService.loginOwner(store.ownerLogin, store.ownerPassword);
      const ctx = await getAuthByToken(session!.token);
      const echoed = await authService.me(ctx!);
      expect(echoed.token).toBe(session!.token);
      expect(echoed.expires_at).toBe(session!.expires_at);
    });
  });

  describe('getAuthByToken', () => {
    it('rejects an expired session', async () => {
      const expired = await issueToken(store.storeId, store.ownerId, { expired: true });
      expect(await getAuthByToken(expired)).toBeNull();
    });

    it('rejects a live session whose staff was deactivated', async () => {
      const temp = await createTestStore('ctxoff');
      try {
        const token = await issueToken(temp.storeId, temp.sellerId);
        expect(await getAuthByToken(token)).not.toBeNull();
        await pool.query(`UPDATE pos_staff SET is_active = FALSE WHERE id = $1`, [temp.sellerId]);
        expect(await getAuthByToken(token)).toBeNull();
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('rejects an unknown token', async () => {
      expect(await getAuthByToken('not-a-real-token')).toBeNull();
    });
  });

  describe('staff management', () => {
    it('lists staff with a has_pin flag and no hashes', async () => {
      const staff = await authService.listStaff(store.storeId);
      const owner = staff.find((s) => s.id === store.ownerId)!;
      const seller = staff.find((s) => s.id === store.sellerId)!;

      expect(owner.has_pin).toBe(false);
      expect(seller.has_pin).toBe(true);
      expect(Object.keys(seller)).not.toContain('pin_hash');
      expect(Object.keys(owner)).not.toContain('password_hash');
    });

    it('scopes the staff list to the store', async () => {
      const staff = await authService.listStaff(store.storeId);
      expect(staff.every((s) => s.store_id === store.storeId)).toBe(true);
    });

    it('creates a seller whose PIN then works for login', async () => {
      const created = await authService.createSeller(store.storeId, '  New Cashier  ', '246810');
      const staff = await authService.listStaff(store.storeId);
      expect(staff.find((s) => s.id === created.id)?.display_name).toBe('New Cashier');

      const login = await authService.loginWithPin(store.slug, '246810');
      expect(login!.staff.id).toBe(created.id);
    });

    it.each(['123', '1234567', 'abcd', ''])('rejects PIN %j on create', async (pin) => {
      await expect(authService.createSeller(store.storeId, 'Bad pin', pin)).rejects.toThrow(
        'PIN must be 4-6 digits'
      );
    });

    it('rotates a PIN — the old one stops working', async () => {
      const temp = await createTestStore('pinrot');
      try {
        await authService.setStaffPin(temp.storeId, temp.sellerId, '111111');
        expect(await authService.loginWithPin(temp.slug, temp.sellerPin)).toBeNull();
        expect(await authService.loginWithPin(temp.slug, '111111')).not.toBeNull();
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('refuses to set a PIN on staff from another store', async () => {
      await expect(
        authService.setStaffPin(other.storeId, store.sellerId, '1234')
      ).rejects.toThrow('Staff not found');
    });

    it('refuses an invalid PIN on rotation', async () => {
      await expect(
        authService.setStaffPin(store.storeId, store.sellerId, '12')
      ).rejects.toThrow('PIN must be 4-6 digits');
    });

    it('deactivating a seller kills their live sessions', async () => {
      const temp = await createTestStore('kill');
      try {
        const token = await issueToken(temp.storeId, temp.sellerId);
        await authService.setStaffActive(temp.storeId, temp.sellerId, false);

        const rows = await pool.query(`SELECT id FROM pos_sessions WHERE token = $1`, [token]);
        expect(rows.rows).toHaveLength(0);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('reactivating a seller does not resurrect old sessions', async () => {
      const temp = await createTestStore('revive');
      try {
        const token = await issueToken(temp.storeId, temp.sellerId);
        await authService.setStaffActive(temp.storeId, temp.sellerId, false);
        await authService.setStaffActive(temp.storeId, temp.sellerId, true);
        expect(await getAuthByToken(token)).toBeNull();
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('refuses to deactivate an owner', async () => {
      await expect(
        authService.setStaffActive(store.storeId, store.ownerId, false)
      ).rejects.toThrow('Seller not found');
    });

    it('refuses to deactivate a seller from another store', async () => {
      await expect(
        authService.setStaffActive(other.storeId, store.sellerId, false)
      ).rejects.toThrow('Seller not found');
    });
  });

  describe('PIN collisions inside one store', () => {
    it('logs in the first active seller whose hash matches', async () => {
      const temp = await createTestStore('collide');
      try {
        // Two sellers, identical PIN. The service scans until a hash verifies,
        // so a login is granted — which of the two is not contractual.
        await pool.query(
          `INSERT INTO pos_staff (store_id, role, display_name, pin_hash)
           VALUES ($1, 'seller', 'Twin', $2)`,
          [temp.storeId, await hashPin(temp.sellerPin)]
        );
        const result = await authService.loginWithPin(temp.slug, temp.sellerPin);
        expect(result).not.toBeNull();
        expect(result!.staff.role).toBe('seller');
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });
});
