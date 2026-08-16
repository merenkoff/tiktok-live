import { api, isNetworkError } from '../services/api';
import type { CatalogItem, PosCustomer, PosTag, SaleDetail } from '../types';
import { filterCatalog } from './catalog-filter';
import {
  db,
  getMeta,
  setMeta,
  type CachedCustomer,
  type OutboxCustomerPayload,
  type OutboxSalePayload,
} from './db';
import { cacheCatalogImages, withCachedImages } from './photos';
import { useOfflineStatus } from './status';

let refreshInFlight: Promise<void> | null = null;

async function nextLocalCustomerId(): Promise<number> {
  const current = (await getMeta<number>('localCustomerSeq')) ?? 0;
  const next = current - 1;
  await setMeta('localCustomerSeq', next);
  return next;
}

export async function getCachedTags(): Promise<PosTag[]> {
  return (await getMeta<PosTag[]>('tagsTree')) ?? [];
}

export async function refreshSnapshot(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const [items, tags, customers] = await Promise.all([
      api.getCatalog({ snapshot: true }),
      api.getTags(),
      api.listCustomers(undefined, true),
    ]);
    await db.transaction('rw', db.catalog, db.customers, db.meta, async () => {
      await db.catalog.clear();
      if (items.length) await db.catalog.bulkPut(items);
      await setMeta('tagsTree', tags);
      const localOnly = await db.customers.filter((c) => c.id < 0).toArray();
      await db.customers.clear();
      if (customers.length) await db.customers.bulkPut(customers);
      if (localOnly.length) await db.customers.bulkPut(localOnly);
      await setMeta('lastSyncAt', Date.now());
      const auth = api.loadAuth();
      if (auth) await setMeta('storeId', auth.store.id);
    });
    void cacheCatalogImages(items);
    await useOfflineStatus.getState().refreshPending();
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function ensureSnapshot(): Promise<void> {
  const count = await db.catalog.count();
  const last = await getMeta<number>('lastSyncAt');
  const stale = !last || Date.now() - last > 2 * 60 * 1000;
  if (navigator.onLine && api.hasLiveJwt()) {
    if (count === 0 || stale) {
      try {
        await refreshSnapshot();
        return;
      } catch (error) {
        if (!isNetworkError(error) || count === 0) throw error;
      }
    } else {
      void refreshSnapshot().catch(() => undefined);
    }
  }
}

export async function getTags(): Promise<PosTag[]> {
  await ensureSnapshot();
  const tags = await getCachedTags();
  if (tags.length) return tags;
  if (navigator.onLine && api.hasLiveJwt()) {
    const fresh = await api.getTags();
    await setMeta('tagsTree', fresh);
    return fresh;
  }
  return tags;
}

export async function getCatalog(opts?: {
  q?: string;
  barcode?: string;
  tag_id?: number;
}): Promise<CatalogItem[]> {
  await ensureSnapshot();
  const [items, tags] = await Promise.all([db.catalog.toArray(), getCachedTags()]);
  return withCachedImages(filterCatalog(items, tags, opts));
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export async function listCustomers(q?: string): Promise<PosCustomer[]> {
  await ensureSnapshot();
  const all = await db.customers.toArray();
  const query = q?.trim();
  if (!query) return all.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  const digits = normalizePhone(query);
  const lower = query.toLowerCase();
  return all
    .filter((c) => {
      if (c.name.toLowerCase().includes(lower)) return true;
      if (c.phone.includes(query) || (digits && c.phone.includes(digits))) return true;
      return false;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

async function enqueueCustomer(payload: OutboxCustomerPayload): Promise<void> {
  const existing = await db.outbox.filter((row) => row.clientUuid === payload.client_uuid).first();
  const row = {
    id: existing?.id ?? crypto.randomUUID(),
    type: 'customer' as const,
    clientUuid: payload.client_uuid,
    payload,
    status: 'pending' as const,
    attempts: existing?.attempts ?? 0,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await db.outbox.put(row);
  await useOfflineStatus.getState().refreshPending();
}

async function putCustomer(customer: CachedCustomer): Promise<void> {
  await db.customers.put(customer);
}

export async function createCustomer(payload: {
  name: string;
  phone: string;
  email?: string | null;
  children_birthdays?: PosCustomer['children_birthdays'];
  client_uuid?: string | null;
}): Promise<PosCustomer> {
  const clientUuid = payload.client_uuid?.trim() || crypto.randomUUID();
  if (navigator.onLine && api.hasLiveJwt()) {
    try {
      const created = await api.createCustomer({ ...payload, client_uuid: clientUuid });
      await putCustomer(created);
      return created;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }

  const now = new Date().toISOString();
  const auth = api.loadAuth();
  const local: CachedCustomer = {
    id: await nextLocalCustomerId(),
    store_id: auth?.store.id ?? 0,
    name: payload.name.trim(),
    phone: normalizePhone(payload.phone),
    email: payload.email?.trim() || null,
    children_birthdays: payload.children_birthdays ?? [],
    created_at: now,
    updated_at: now,
    client_uuid: clientUuid,
  };
  await putCustomer(local);
  await enqueueCustomer({
    client_uuid: clientUuid,
    local_id: local.id,
    server_id: null,
    name: local.name,
    phone: local.phone,
    email: local.email,
    children_birthdays: local.children_birthdays,
  });
  return local;
}

export async function updateCustomer(
  id: number,
  payload: {
    name?: string;
    phone?: string;
    email?: string | null;
    children_birthdays?: PosCustomer['children_birthdays'];
    client_uuid?: string | null;
  }
): Promise<PosCustomer> {
  const existing = await db.customers.get(id);
  if (id > 0 && navigator.onLine && api.hasLiveJwt()) {
    try {
      const updated = await api.updateCustomer(id, payload);
      await putCustomer(updated);
      return updated;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }

  if (!existing) throw new Error('Customer not found');
  const next: CachedCustomer = {
    ...existing,
    name: payload.name !== undefined ? payload.name.trim() : existing.name,
    phone: payload.phone !== undefined ? normalizePhone(payload.phone) : existing.phone,
    email: payload.email !== undefined ? payload.email?.trim() || null : existing.email,
    children_birthdays:
      payload.children_birthdays !== undefined
        ? payload.children_birthdays
        : existing.children_birthdays,
    client_uuid: payload.client_uuid ?? existing.client_uuid ?? crypto.randomUUID(),
    updated_at: new Date().toISOString(),
  };
  await putCustomer(next);
  await enqueueCustomer({
    client_uuid: next.client_uuid!,
    local_id: next.id,
    server_id: next.id > 0 ? next.id : null,
    name: next.name,
    phone: next.phone,
    email: next.email,
    children_birthdays: next.children_birthdays,
  });
  return next;
}

function variantLabel(item: CatalogItem): string {
  return [item.color, item.size].filter(Boolean).join(' / ');
}

function localSaleDetail(
  clientUuid: string,
  payload: OutboxSalePayload,
  catalog: CatalogItem[]
): SaleDetail {
  const byId = new Map(catalog.map((item) => [item.variant_id, item]));
  let subtotal = 0;
  const items = payload.items.map((line, i) => {
    const cat = byId.get(line.variant_id);
    const unit = cat?.price_cents ?? 0;
    const total = unit * line.quantity;
    subtotal += total;
    return {
      id: -(i + 1),
      variant_id: line.variant_id,
      product_name: cat?.product_name ?? 'Товар',
      variant_label: cat ? variantLabel(cat) : '',
      quantity: line.quantity,
      unit_price_cents: unit,
      compare_at_unit_cents: cat?.compare_at_cents ?? null,
      line_discount_cents: 0,
      line_total_cents: total,
      refunded_quantity: 0,
    };
  });
  const auth = api.loadAuth();
  const short = clientUuid.replace(/-/g, '').slice(0, 8).toUpperCase();
  return {
    id: -Date.now(),
    receipt_number: `OFF-${short}`,
    status: 'completed',
    subtotal_cents: subtotal,
    total_cents: payload.payments.reduce((s, p) => s + p.amount_cents, 0) || subtotal,
    refunded_cents: 0,
    staff_name: auth?.staff.display_name ?? '',
    customer_id: payload.customer_id && payload.customer_id > 0 ? payload.customer_id : null,
    created_at: new Date().toISOString(),
    items,
    payments: payload.payments.map((p, i) => ({
      id: -(i + 1),
      method: p.method,
      amount_cents: p.amount_cents,
    })),
    refunds: [],
  };
}

async function applyLocalStockDelta(items: Array<{ variant_id: number; quantity: number }>): Promise<void> {
  await db.transaction('rw', db.catalog, async () => {
    for (const line of items) {
      const row = await db.catalog.get(line.variant_id);
      if (!row) continue;
      await db.catalog.put({ ...row, quantity: row.quantity - line.quantity });
    }
  });
}

export async function completeSale(payload: {
  items: Array<{ variant_id: number; quantity: number }>;
  payments: Array<{ method: 'cash' | 'card'; amount_cents: number }>;
  note?: string;
  cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
  customer_id?: number | null;
}): Promise<SaleDetail> {
  const clientUuid = crypto.randomUUID();
  let customer = payload.customer_id ? await db.customers.get(payload.customer_id) : undefined;
  if (!customer && payload.customer_id) {
    const listed = await db.customers.toArray();
    customer = listed.find((c) => c.id === payload.customer_id);
  }

  const salePayload: OutboxSalePayload = {
    client_uuid: clientUuid,
    items: payload.items,
    payments: payload.payments,
    note: payload.note,
    cart_discount: payload.cart_discount ?? null,
    customer_id: payload.customer_id && payload.customer_id > 0 ? payload.customer_id : null,
    customer_client_uuid: customer?.client_uuid ?? null,
  };

  if (navigator.onLine && api.hasLiveJwt()) {
    try {
      const sale = await api.completeSale({
        ...payload,
        customer_id: salePayload.customer_id,
        client_uuid: clientUuid,
      });
      await applyLocalStockDelta(payload.items);
      void refreshSnapshot().catch(() => undefined);
      return sale;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }

  await db.outbox.add({
    id: crypto.randomUUID(),
    type: 'sale',
    clientUuid,
    payload: salePayload,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
  });
  await applyLocalStockDelta(payload.items);
  await useOfflineStatus.getState().refreshPending();
  const catalog = await db.catalog.toArray();
  return localSaleDetail(clientUuid, salePayload, catalog);
}

export async function replaceLocalCustomer(localId: number, server: PosCustomer): Promise<void> {
  await db.transaction('rw', db.customers, async () => {
    if (localId !== server.id) await db.customers.delete(localId);
    await db.customers.put(server);
  });
}
