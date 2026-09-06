// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.suppliers.service.test.ts

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import * as suppliers from '../pos/suppliers.service.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe.skipIf(!hasDb)('POS suppliers service', () => {
  let store: TestStore;
  let other: TestStore;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('supp');
    other = await createTestStore('suppx');
  }, 120000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
    await pool.end();
  });

  it('creates a supplier with trimmed fields', async () => {
    const created = await suppliers.createSupplier(store.storeId, {
      name: '  Acme Textiles  ',
      phone: ' 0671234567 ',
      note: ' pays on delivery ',
    });
    expect(created.name).toBe('Acme Textiles');
    expect(created.phone).toBe('0671234567');
    expect(created.note).toBe('pays on delivery');
    expect(created.is_active).toBe(true);
  });

  it('turns blank optional fields into null rather than empty strings', async () => {
    const created = await suppliers.createSupplier(store.storeId, {
      name: 'Blank optionals',
      phone: '   ',
      note: '',
    });
    expect(created.phone).toBeNull();
    expect(created.note).toBeNull();
  });

  it('rejects a whitespace-only name', async () => {
    await expect(
      suppliers.createSupplier(store.storeId, { name: '   ' })
    ).rejects.toThrow('Supplier name required');
  });

  it('hides deactivated suppliers by default and shows them on demand', async () => {
    const created = await suppliers.createSupplier(store.storeId, { name: 'Retired' });
    await suppliers.updateSupplier(store.storeId, created.id, { is_active: false });

    const active = await suppliers.listSuppliers(store.storeId);
    expect(active.map((s) => s.name)).not.toContain('Retired');

    const all = await suppliers.listSuppliers(store.storeId, false);
    expect(all.map((s) => s.name)).toContain('Retired');
  });

  it('sorts by name ascending', async () => {
    await suppliers.createSupplier(store.storeId, { name: 'Zzz last' });
    await suppliers.createSupplier(store.storeId, { name: 'Aaa first' });
    const names = (await suppliers.listSuppliers(store.storeId)).map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  describe('updateSupplier', () => {
    it('leaves omitted fields at their current value', async () => {
      const created = await suppliers.createSupplier(store.storeId, {
        name: 'Keep me',
        phone: '0670000000',
        note: 'original note',
      });
      const updated = await suppliers.updateSupplier(store.storeId, created.id, {
        name: 'Renamed',
      });
      expect(updated.name).toBe('Renamed');
      expect(updated.phone).toBe('0670000000');
      expect(updated.note).toBe('original note');
    });

    it('clears a field when passed null explicitly', async () => {
      const created = await suppliers.createSupplier(store.storeId, {
        name: 'Clearable',
        phone: '0670000001',
      });
      const updated = await suppliers.updateSupplier(store.storeId, created.id, {
        phone: null,
      });
      expect(updated.phone).toBeNull();
    });

    it('rejects blanking the name', async () => {
      const created = await suppliers.createSupplier(store.storeId, { name: 'Named' });
      await expect(
        suppliers.updateSupplier(store.storeId, created.id, { name: '  ' })
      ).rejects.toThrow('Supplier name required');
    });

    it('refuses to touch a supplier from another store', async () => {
      const mine = await suppliers.createSupplier(store.storeId, { name: 'Mine' });
      await expect(
        suppliers.updateSupplier(other.storeId, mine.id, { name: 'Stolen' })
      ).rejects.toThrow('Supplier not found');
    });
  });

  it('scopes listing to the store', async () => {
    await suppliers.createSupplier(other.storeId, { name: 'Foreign supplier' });
    const mine = await suppliers.listSuppliers(store.storeId);
    expect(mine.every((s) => s.store_id === store.storeId)).toBe(true);
    expect(mine.map((s) => s.name)).not.toContain('Foreign supplier');
  });
});
