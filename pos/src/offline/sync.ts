// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { api, isNetworkError, isUnauthorized } from '../services/api';
import {
  classifySyncError,
  isDue,
  nextRowState,
  type SyncVerdict,
} from './outboxPolicy';

/** A sale whose customer has not reached the server yet. Not the sale's fault. */
class CustomerNotSyncedError extends Error {
  constructor() {
    super('Customer not synced yet');
    this.name = 'CustomerNotSyncedError';
  }
}
import {
  db,
  getDeviceId,
  type OutboxCustomerPayload,
  type OutboxSalePayload,
  type OutboxRow,
} from './db';
import { isOfflinePosEnabled } from './enabled';
import {
  putLocalSale,
  refreshSalesCache,
  refreshSnapshot,
  replaceLocalCustomer,
} from './repository';
import { useOfflineStatus } from './status';
import { syncOfflineModules } from './moduleHooks';

let started = false;
let running = false;

/**
 * Record an attempt against a row.
 *
 * The verdict decides whether the row stays retryable or goes terminal; either
 * way `lastAttemptAt` is stamped, which is what makes the backoff actually
 * back off (it used to be measured from `createdAt`, so any row older than the
 * 60s ceiling was retried on every single tick, forever).
 */
async function markAttempt(row: OutboxRow, verdict: SyncVerdict): Promise<void> {
  await db.outbox.update(row.id, nextRowState(row, verdict));
}

async function syncCustomer(row: OutboxRow): Promise<void> {
  const payload = row.payload as OutboxCustomerPayload;
  const body = {
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    children_birthdays: payload.children_birthdays,
    client_uuid: payload.client_uuid,
  };
  const saved =
    payload.server_id && payload.server_id > 0
      ? await api.updateCustomer(payload.server_id, body)
      : await api.createCustomer(body);
  await replaceLocalCustomer(payload.local_id, saved);
  await db.outbox.delete(row.id);
}

async function resolveSaleCustomerId(payload: OutboxSalePayload): Promise<number | null> {
  if (payload.customer_id && payload.customer_id > 0) return payload.customer_id;
  if (!payload.customer_client_uuid) return null;
  const local = await db.customers.filter((c) => c.client_uuid === payload.customer_client_uuid).first();
  if (local && local.id > 0) return local.id;
  return null;
}

async function syncSale(row: OutboxRow): Promise<void> {
  const payload = row.payload as OutboxSalePayload;
  if (payload.customer_client_uuid) {
    const local = await db.customers
      .filter((c) => c.client_uuid === payload.customer_client_uuid)
      .first();
    if (local && local.id < 0) {
      throw new CustomerNotSyncedError();
    }
  }
  const customerId = await resolveSaleCustomerId(payload);
  const sale = await api.completeSale({
    items: payload.items,
    payments: payload.payments,
    note: payload.note,
    cart_discount: payload.cart_discount,
    customer_id: customerId,
    client_uuid: payload.client_uuid,
  });
  // Record client_uuid -> server id so the receipts screen can address this
  // sale on the server once it exists there.
  await putLocalSale(sale, payload.client_uuid, sale.id);
  await db.outbox.delete(row.id);
}

export async function runSync(): Promise<void> {
  if (!isOfflinePosEnabled() || running) return;
  if (!navigator.onLine || !api.hasLiveJwt()) return;
  running = true;
  let shipped = 0;
  useOfflineStatus.getState().setSyncing(true);
  useOfflineStatus.getState().setLastError(null);
  try {
    const customers = await db.outbox.where('type').equals('customer').sortBy('createdAt');
    for (const row of customers) {
      if (!isDue(row)) continue;
      try {
        await syncCustomer(row);
      } catch (error) {
        // One expired session would otherwise mark every queued row, and with
        // an attempt cap that wipes the whole queue in a handful of ticks.
        if (isUnauthorized(error)) {
          useOfflineStatus.getState().setLastError('Сесію завершено — увійдіть знову');
          return;
        }
        const verdict = classifySyncError(error, 'customer');
        await markAttempt(row, verdict);
        useOfflineStatus.getState().setLastError(verdict.message);
      }
    }

    const sales = await db.outbox.where('type').equals('sale').sortBy('createdAt');
    for (const row of sales) {
      if (!isDue(row)) continue;
      try {
        await syncSale(row);
        shipped += 1;
      } catch (error) {
        if (isUnauthorized(error)) {
          useOfflineStatus.getState().setLastError('Сесію завершено — увійдіть знову');
          return;
        }
        // A sale waiting on its customer is not this row's fault — burning an
        // attempt on it would kill a perfectly good receipt after ~8 ticks.
        if (error instanceof CustomerNotSyncedError) {
          useOfflineStatus.getState().setLastError('Чек: очікує на збереження клієнта');
          continue;
        }
        const verdict = classifySyncError(error, 'sale');
        await markAttempt(row, verdict);
        useOfflineStatus.getState().setLastError(verdict.message);
      }
    }

    // Feature modules with their own queues (roadmap #12 track 3) go after the
    // shell's rows — a count sheet may reference a customer or sale that had
    // to land first. A module that throws is reported and skipped.
    await syncOfflineModules((id, error) => {
      if (!isNetworkError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        useOfflineStatus.getState().setLastError(`Модуль ${id}: ${message}`);
      }
    });

    try {
      await refreshSnapshot();
      // Only re-pull receipts when this cycle actually changed some — the sales
      // screen refreshes its own mirror on mount, so idle tills stay quiet.
      if (shipped > 0) await refreshSalesCache();
    } catch {
      /* keep local cache */
    }
  } catch (error) {
    if (!isNetworkError(error) && error instanceof Error) {
      useOfflineStatus.getState().setLastError(error.message);
    }
  } finally {
    running = false;
    useOfflineStatus.getState().setSyncing(false);
    await useOfflineStatus.getState().refreshPending();
    if (useOfflineStatus.getState().pending === 0) {
      useOfflineStatus.getState().setLastError(null);
    }
  }
}

export function startOfflineRuntime(): void {
  if (started || !isOfflinePosEnabled()) return;
  started = true;
  void getDeviceId();
  // Interim builds queued a 'void' outbox type that no longer exists; drop any
  // leftovers so they cannot wedge the pending counter.
  void db.outbox.filter((r) => String(r.type) === 'void').delete();
  const status = useOfflineStatus.getState();
  status.setOnline(navigator.onLine);
  void status.refreshPending();

  window.addEventListener('online', () => {
    useOfflineStatus.getState().setOnline(true);
    void runSync();
  });
  window.addEventListener('offline', () => {
    useOfflineStatus.getState().setOnline(false);
  });
  window.setInterval(() => {
    void runSync();
  }, 30_000);
  void runSync();
}
