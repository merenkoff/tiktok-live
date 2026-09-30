// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.customers.service.test.ts
//
// customers.service owns two things worth pinning down: the phone/children
// validation in front of every write, and the "never fail on a duplicate phone,
// merge into the existing row instead" recovery path that the offline cashier
// depends on when it replays queued customer writes.

import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import * as customers from '../pos/customers.service.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe('normalizePhone', () => {
  it('keeps digits only', () => {
    expect(customers.normalizePhone('+38 (067) 123-45-67')).toBe('380671234567');
  });

  it('collapses an all-punctuation phone to an empty string', () => {
    expect(customers.normalizePhone('++--()')).toBe('');
  });
});

describe('parseDiscountPercent', () => {
  it('reads a whole percent from 0 to 100', () => {
    expect(customers.parseDiscountPercent(0)).toBe(0);
    expect(customers.parseDiscountPercent(7)).toBe(7);
    expect(customers.parseDiscountPercent(100)).toBe(100);
    expect(customers.parseDiscountPercent('15')).toBe(15);
  });

  it('reads «nothing» as no discount', () => {
    expect(customers.parseDiscountPercent(undefined)).toBe(0);
    expect(customers.parseDiscountPercent(null)).toBe(0);
    expect(customers.parseDiscountPercent('')).toBe(0);
  });

  it.each([-1, 101, 2.5, NaN, 'abc', '7%', {}, [5], true])('refuses %j', (value) => {
    expect(() => customers.parseDiscountPercent(value)).toThrow('ціле число відсотків від 0 до 100');
  });
});

describe.skipIf(!hasDb)('POS customers service', () => {
  let store: TestStore;
  let other: TestStore;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('cust');
    other = await createTestStore('custx');
  }, 120000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
    await pool.end();
  });

  describe('createCustomer validation', () => {
    it('requires a name', async () => {
      await expect(
        customers.createCustomer(store.storeId, { name: '   ', phone: '0671112233' })
      ).rejects.toThrow('Name is required');
    });

    it('requires at least 8 phone digits', async () => {
      await expect(
        customers.createCustomer(store.storeId, { name: 'Ann', phone: '+38 (067)' })
      ).rejects.toThrow('Phone is required');
    });

    it('stores the phone normalized, not as typed', async () => {
      const created = await customers.createCustomer(store.storeId, {
        name: 'Normalized',
        phone: '+38 (067) 000-11-22',
      });
      expect(created.phone).toBe('380670001122');
    });

    it('turns a blank email into null', async () => {
      const created = await customers.createCustomer(store.storeId, {
        name: 'No email',
        phone: '380670001133',
        email: '   ',
      });
      expect(created.email).toBeNull();
    });

    it('rejects more than five children', async () => {
      await expect(
        customers.createCustomer(store.storeId, {
          name: 'Big family',
          phone: '380670001144',
          children_birthdays: Array.from({ length: 6 }, (_, i) => ({
            name: `Kid ${i}`,
            birthday: '2020-01-01',
          })),
        })
      ).rejects.toThrow('Maximum 5 children');
    });

    it('rejects a child birthday that is not YYYY-MM-DD', async () => {
      await expect(
        customers.createCustomer(store.storeId, {
          name: 'Bad date',
          phone: '380670001155',
          children_birthdays: [{ name: 'Kid', birthday: '01.01.2020' }],
        })
      ).rejects.toThrow('Child birthday must be YYYY-MM-DD at index 0');
    });

    it('rejects a child with no name', async () => {
      await expect(
        customers.createCustomer(store.storeId, {
          name: 'No kid name',
          phone: '380670001166',
          children_birthdays: [{ name: '  ', birthday: '2020-01-01' }],
        })
      ).rejects.toThrow('Child name required at index 0');
    });

    it('round-trips children through jsonb', async () => {
      const created = await customers.createCustomer(store.storeId, {
        name: 'Family',
        phone: '380670001177',
        children_birthdays: [
          { name: 'Kid A', birthday: '2019-05-04' },
          { name: 'Kid B', birthday: '2021-12-31' },
        ],
      });
      const read = await customers.getCustomer(store.storeId, created.id);
      expect(read?.children_birthdays).toEqual([
        { name: 'Kid A', birthday: '2019-05-04' },
        { name: 'Kid B', birthday: '2021-12-31' },
      ]);
    });
  });

  describe('duplicate handling', () => {
    it('merges into the existing row when the phone is already taken', async () => {
      const first = await customers.createCustomer(store.storeId, {
        name: 'Original',
        phone: '380670002200',
      });
      const second = await customers.createCustomer(store.storeId, {
        name: 'Renamed',
        phone: '+380 67 000 22 00',
        email: 'renamed@test.local',
      });
      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Renamed');
      expect(second.email).toBe('renamed@test.local');
    });

    it('is idempotent per client_uuid — a replay updates instead of inserting', async () => {
      const uuid = '11111111-1111-4111-8111-111111111111';
      const first = await customers.createCustomer(store.storeId, {
        name: 'Offline queued',
        phone: '380670003300',
        client_uuid: uuid,
      });
      const replay = await customers.createCustomer(store.storeId, {
        name: 'Offline queued (edited)',
        phone: '380670003300',
        client_uuid: uuid,
      });
      expect(replay.id).toBe(first.id);
      expect(replay.name).toBe('Offline queued (edited)');

      const all = await customers.listCustomers(store.storeId, '380670003300');
      expect(all).toHaveLength(1);
    });

    it('lets the same phone exist in a different store', async () => {
      const a = await customers.createCustomer(store.storeId, {
        name: 'Shared phone',
        phone: '380670004400',
      });
      const b = await customers.createCustomer(other.storeId, {
        name: 'Shared phone',
        phone: '380670004400',
      });
      expect(b.id).not.toBe(a.id);
      expect(b.store_id).toBe(other.storeId);
    });
  });

  describe('updateCustomer', () => {
    it('leaves omitted fields untouched', async () => {
      const created = await customers.createCustomer(store.storeId, {
        name: 'Partial',
        phone: '380670005500',
        email: 'keep@test.local',
        children_birthdays: [{ name: 'Kid', birthday: '2020-02-02' }],
      });
      const updated = await customers.updateCustomer(store.storeId, created.id, {
        name: 'Partial renamed',
      });
      expect(updated.name).toBe('Partial renamed');
      expect(updated.email).toBe('keep@test.local');
      expect(updated.phone).toBe('380670005500');
      expect(updated.children_birthdays).toEqual([{ name: 'Kid', birthday: '2020-02-02' }]);
    });

    it('clears the email when passed null explicitly', async () => {
      const created = await customers.createCustomer(store.storeId, {
        name: 'Clear email',
        phone: '380670005511',
        email: 'drop@test.local',
      });
      const updated = await customers.updateCustomer(store.storeId, created.id, { email: null });
      expect(updated.email).toBeNull();
    });

    it('refuses to update a customer belonging to another store', async () => {
      const mine = await customers.createCustomer(store.storeId, {
        name: 'Mine',
        phone: '380670006600',
      });
      await expect(
        customers.updateCustomer(other.storeId, mine.id, { name: 'Stolen' })
      ).rejects.toThrow('Customer not found');
    });
  });

  describe('listCustomers', () => {
    it('finds by a name fragment, case-insensitively', async () => {
      await customers.createCustomer(store.storeId, {
        name: 'Oksana Searchable',
        phone: '380670007700',
      });
      const found = await customers.listCustomers(store.storeId, 'searchable');
      expect(found.map((c) => c.name)).toContain('Oksana Searchable');
    });

    it('finds by a formatted phone the caller typed with punctuation', async () => {
      await customers.createCustomer(store.storeId, {
        name: 'Phone search',
        phone: '380670008800',
      });
      const found = await customers.listCustomers(store.storeId, '+38 (067) 000-88-00');
      expect(found.map((c) => c.name)).toContain('Phone search');
    });

    it('never returns another store rows', async () => {
      await customers.createCustomer(other.storeId, {
        name: 'Foreign customer',
        phone: '380679999999',
      });
      const mine = await customers.listCustomers(store.storeId);
      expect(mine.every((c) => c.store_id === store.storeId)).toBe(true);
      expect(mine.map((c) => c.name)).not.toContain('Foreign customer');
    });

    it('ignores the search term in snapshot mode — the cashier wants everything', async () => {
      const snapshot = await customers.listCustomers(store.storeId, 'searchable', true);
      const filtered = await customers.listCustomers(store.storeId, 'searchable');
      expect(snapshot.length).toBeGreaterThan(filtered.length);
    });

    it('sorts by name ascending', async () => {
      const list = await customers.listCustomers(store.storeId);
      const names = list.map((c) => c.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });
  });

  describe('deleteCustomer', () => {
    it('deletes a customer with no sales', async () => {
      const created = await customers.createCustomer(store.storeId, {
        name: 'Deletable',
        phone: '380670009900',
      });
      await customers.deleteCustomer(store.storeId, created.id);
      expect(await customers.getCustomer(store.storeId, created.id)).toBeNull();
    });

    it('refuses to delete a customer with sales history', async () => {
      const created = await customers.createCustomer(store.storeId, {
        name: 'Has sales',
        phone: '380670010100',
      });
      await pool.query(
        `INSERT INTO pos_sales (store_id, staff_id, receipt_number, customer_id, total_cents)
         VALUES ($1, $2, $3, $4, 1000)`,
        [store.storeId, store.sellerId, 'R-00001', created.id]
      );
      await expect(customers.deleteCustomer(store.storeId, created.id)).rejects.toThrow(
        'Cannot delete customer with sales history'
      );
    });

    it('reports a missing customer rather than silently succeeding', async () => {
      await expect(customers.deleteCustomer(store.storeId, 999_999_999)).rejects.toThrow(
        'Customer not found'
      );
    });
  });
  describe('personal discount', () => {
    it('defaults to 0 and round-trips a whole percent', async () => {
      const plain = await customers.createCustomer(store.storeId, { name: 'Plain', phone: '380670990001' });
      expect(plain.discount_percent).toBe(0);
      const gold = await customers.createCustomer(store.storeId, {
        name: 'Gold',
        phone: '380670990002',
        discount_percent: 10,
      });
      expect(gold.discount_percent).toBe(10);
      expect((await customers.getCustomer(store.storeId, gold.id))?.discount_percent).toBe(10);
    });

    it('is returned by the list, including the offline snapshot', async () => {
      const created = await customers.createCustomer(store.storeId, {
        name: 'Listed',
        phone: '380670990003',
        discount_percent: 5,
      });
      const all = await customers.listCustomers(store.storeId, undefined, true);
      expect(all.find((c) => c.id === created.id)?.discount_percent).toBe(5);
    });

    it('is left alone by an update that does not mention it', async () => {
      const created = await customers.createCustomer(store.storeId, {
        name: 'Keeps',
        phone: '380670990004',
        discount_percent: 12,
      });
      const renamed = await customers.updateCustomer(store.storeId, created.id, { name: 'Keeps renamed' });
      expect(renamed.discount_percent).toBe(12);
    });

    it('is set, changed and cleared by an update that does', async () => {
      const created = await customers.createCustomer(store.storeId, { name: 'Moves', phone: '380670990005' });
      expect((await customers.updateCustomer(store.storeId, created.id, { discount_percent: 8 })).discount_percent).toBe(8);
      expect((await customers.updateCustomer(store.storeId, created.id, { discount_percent: 3 })).discount_percent).toBe(3);
      expect((await customers.updateCustomer(store.storeId, created.id, { discount_percent: null })).discount_percent).toBe(0);
    });

    it('is left alone when a replayed write (no discount) merges into the card', async () => {
      const replayUuid = randomUUID();
      const created = await customers.createCustomer(store.storeId, {
        name: 'Merged',
        phone: '380670990006',
        discount_percent: 20,
        client_uuid: replayUuid,
      });
      // Same phone, no discount: the offline cashier's replay of a queued write.
      const merged = await customers.createCustomer(store.storeId, {
        name: 'Merged again',
        phone: '380670990006',
      });
      expect(merged.id).toBe(created.id);
      expect(merged.discount_percent).toBe(20);
      const replay = await customers.createCustomer(store.storeId, {
        name: 'Merged third',
        phone: '380670990006',
        client_uuid: replayUuid,
      });
      expect(replay.discount_percent).toBe(20);
    });

    it('refuses a value outside 0..100 or a fraction, on create and on update', async () => {
      await expect(
        customers.createCustomer(store.storeId, { name: 'Bad', phone: '380670990007', discount_percent: 101 })
      ).rejects.toThrow('від 0 до 100');
      const ok = await customers.createCustomer(store.storeId, { name: 'Ok', phone: '380670990008' });
      await expect(customers.updateCustomer(store.storeId, ok.id, { discount_percent: 2.5 })).rejects.toThrow(
        'ціле число'
      );
      await expect(customers.updateCustomer(store.storeId, ok.id, { discount_percent: -5 })).rejects.toThrow('від 0 до 100');
    });

    it('is also held by the database, for a writer that skips the service', async () => {
      const created = await customers.createCustomer(store.storeId, { name: 'Db guard', phone: '380670990009' });
      await expect(
        pool.query(`UPDATE pos_customers SET discount_percent = 101 WHERE id = $1`, [created.id])
      ).rejects.toThrow(/pos_customers_discount_percent_check/);
      await expect(
        pool.query(`UPDATE pos_customers SET discount_percent = -1 WHERE id = $1`, [created.id])
      ).rejects.toThrow(/pos_customers_discount_percent_check/);
    });
  });
});
