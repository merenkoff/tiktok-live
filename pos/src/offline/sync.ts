import { api, isNetworkError } from '../services/api';
import { db, getDeviceId, type OutboxCustomerPayload, type OutboxSalePayload, type OutboxRow } from './db';
import { isOfflinePosEnabled } from './enabled';
import { refreshSnapshot, replaceLocalCustomer } from './repository';
import { useOfflineStatus } from './status';

const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];
let started = false;
let running = false;

function backoff(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

async function markError(row: OutboxRow, message: string): Promise<void> {
  await db.outbox.update(row.id, {
    status: 'error',
    attempts: row.attempts + 1,
    lastError: message,
  });
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
      throw new Error('Customer not synced yet');
    }
  }
  const customerId = await resolveSaleCustomerId(payload);
  await api.completeSale({
    items: payload.items,
    payments: payload.payments,
    note: payload.note,
    cart_discount: payload.cart_discount,
    customer_id: customerId,
    client_uuid: payload.client_uuid,
  });
  await db.outbox.delete(row.id);
}

export async function runSync(): Promise<void> {
  if (!isOfflinePosEnabled() || running) return;
  if (!navigator.onLine || !api.hasLiveJwt()) return;
  running = true;
  useOfflineStatus.getState().setSyncing(true);
  useOfflineStatus.getState().setLastError(null);
  try {
    const customers = await db.outbox.where('type').equals('customer').sortBy('createdAt');
    for (const row of customers) {
      if (row.status === 'error' && Date.now() - row.createdAt < backoff(row.attempts)) continue;
      try {
        await syncCustomer(row);
      } catch (error) {
        const message = isNetworkError(error)
          ? 'Немає відповіді сервера'
          : error instanceof Error
            ? error.message
            : 'Customer sync failed';
        await markError(row, message);
        useOfflineStatus.getState().setLastError(message);
      }
    }

    const sales = await db.outbox.where('type').equals('sale').sortBy('createdAt');
    for (const row of sales) {
      if (row.status === 'error' && Date.now() - row.createdAt < backoff(row.attempts)) continue;
      try {
        await syncSale(row);
      } catch (error) {
        const message = isNetworkError(error)
          ? 'Немає відповіді сервера'
          : error instanceof Error
            ? error.message
            : 'Sale sync failed';
        await markError(row, message);
        useOfflineStatus.getState().setLastError(message);
      }
    }

    try {
      await refreshSnapshot();
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
