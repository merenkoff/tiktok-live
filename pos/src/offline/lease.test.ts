// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's reserve of tax-office codes (TechDocs/POS_FISCAL_OFFLINE.md,
// фаза 3): when it may print a fiscal receipt without a connection, and what
// it hands the receipt when it does.
//
// These are the decisions the cashier feels, and every one of them has to be
// made locally — by the time the server could answer, the customer is gone.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FiscalLeaseResponse, FiscalPublicConfig } from '../types';

const meta = new Map<string, unknown>();
vi.mock('./db', () => ({
  getMeta: vi.fn(async (key: string) => meta.get(key)),
  setMeta: vi.fn(async (key: string, value: unknown) => {
    meta.set(key, value);
  }),
}));
vi.mock('../services/api', () => ({
  api: { loadAuth: vi.fn(), fiscalLease: vi.fn() },
}));

const { api } = await import('../services/api');
const {
  availableCodes,
  clearLease,
  loadLease,
  refreshLease,
  refuseStamp,
  takeStamp,
  OFFLINE_STRETCH_MAX_MS,
} = await import('./lease');
const { OfflineFiscalError } = await import('./errors');

const REQUISITES = {
  organization: { name: 'ТОВ «Тест»', edrpou: '12345678', tax_number: null, is_vat: false },
  point: { name: 'Магазин', address: 'вул. Тестова, 1' },
  register: { fiscal_number: 'FN-1', title: 'Каса 1', address: null },
  taxes: [],
};

function fiscalConfig(over: Partial<FiscalPublicConfig> = {}): FiscalPublicConfig {
  return {
    enabled: true,
    provider: 'checkbox',
    offline_mode: true,
    register_fiscal_number: 'FN-1',
    requisites: REQUISITES,
    ...over,
  } as FiscalPublicConfig;
}

function setStore(fiscal: FiscalPublicConfig | null) {
  vi.mocked(api.loadAuth).mockReturnValue({ store: { fiscal } } as never);
}

function leaseAnswer(over: Partial<FiscalLeaseResponse> = {}): FiscalLeaseResponse {
  return {
    lease_size: 50,
    codes: [
      { fiscal_code: 'OFF-0001', serial_id: 1 },
      { fiscal_code: 'OFF-0002', serial_id: 2 },
    ],
    shift: { id: 7, opened_at: new Date().toISOString(), auto_close_due_at: hoursFromNow(20) },
    register_fiscal_number: 'FN-1',
    session: null,
    ...over,
  };
}

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

/** An axios-shaped rejection, which is what `refreshLease` reads. */
const httpError = (status: number, error: string) => ({ response: { status, data: { error } } });

beforeEach(async () => {
  vi.clearAllMocks();
  meta.clear();
  setStore(fiscalConfig());
  vi.mocked(api.fiscalLease).mockResolvedValue(leaseAnswer());
  await clearLease();
});

describe('refreshLease', () => {
  it('stores the reserve and what may be stamped inside it', async () => {
    const lease = await refreshLease(0);
    expect(api.fiscalLease).toHaveBeenCalledWith(0);
    expect(lease.codes).toEqual(['OFF-0001', 'OFF-0002']);
    expect(lease.shift).toMatchObject({ id: 7 });
    expect(lease.registerFiscalNumber).toBe('FN-1');
    expect(await availableCodes()).toBe(2);
  });

  it('asks for nothing and holds nothing when the store does not sell offline', async () => {
    setStore(fiscalConfig({ offline_mode: false }));
    expect((await refreshLease(0)).codes).toEqual([]);
    expect(api.fiscalLease).not.toHaveBeenCalled();
  });

  it('keeps the last reserve when the server cannot be reached', async () => {
    await refreshLease(0);
    vi.mocked(api.fiscalLease).mockRejectedValue(new Error('Network Error'));
    // This is the moment the reserve exists for; losing it here would mean a
    // till that goes offline at the worst time cannot sell at all.
    expect((await refreshLease(0)).codes).toEqual(['OFF-0001', 'OFF-0002']);
  });

  it('drops the reserve when another till takes the register', async () => {
    await refreshLease(0);
    vi.mocked(api.fiscalLease).mockRejectedValue(httpError(409, 'register_held'));
    const lease = await refreshLease(0);
    expect(lease.codes).toEqual([]);
    expect(lease.blocked).toBe('not_holder');
    expect(refuseStamp(fiscalConfig(), lease)).toBe('not_holder');
  });

  it('remembers that the owner switched offline selling off', async () => {
    await refreshLease(0);
    vi.mocked(api.fiscalLease).mockRejectedValue(httpError(409, 'offline_off'));
    expect((await refreshLease(0)).blocked).toBe('offline_off');
  });

  it('keeps a stamped code out of the reserve until the server has the receipt', async () => {
    await refreshLease(0);
    const { stamp } = await takeStamp();
    expect(stamp.fiscal_code).toBe('OFF-0001');

    // Still queued: the server has not seen the receipt, so it still lists the
    // code as ours. Handing it out again would put one tax-office number on
    // two receipts.
    await refreshLease(1);
    expect(await availableCodes()).toBe(1);
    expect((await takeStamp()).stamp.fiscal_code).toBe('OFF-0002');
  });

  it('ends the stretch once the outbox has drained', async () => {
    await refreshLease(0);
    const first = await takeStamp();
    expect(first.stamp.seq).toBe(1);
    await refreshLease(1);
    expect((await takeStamp()).stamp.seq).toBe(2);

    // Everything printed offline is filed: the next outage is its own stretch,
    // with its own session on the server and its own numbering.
    await refreshLease(0);
    const fresh = await loadLease();
    expect(fresh.stretchId).toBeNull();
    expect(fresh.nextSeq).toBe(1);
    const next = await takeStamp();
    expect(next.stamp.seq).toBe(1);
    expect(next.stamp.client_session_id).not.toBe(first.stamp.client_session_id);
  });
});

describe('takeStamp', () => {
  it('stamps the receipt with the next code, the till clock and the stretch', async () => {
    await refreshLease(0);
    const now = Date.UTC(2026, 8, 12, 9, 30);
    const { stamp, registerFiscalNumber } = await takeStamp(now);
    expect(stamp).toMatchObject({ seq: 1, fiscal_code: 'OFF-0001' });
    expect(stamp.fiscal_date).toBe(new Date(now).toISOString());
    expect(stamp.client_session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(registerFiscalNumber).toBe('FN-1');
  });

  it('keeps every receipt of one outage in the same stretch', async () => {
    await refreshLease(0);
    const first = await takeStamp();
    const second = await takeStamp();
    expect(second.stamp.client_session_id).toBe(first.stamp.client_session_id);
    expect(second.stamp.seq).toBe(2);
    expect(second.stamp.fiscal_code).toBe('OFF-0002');
  });

  it('spends the code before the receipt is printed, not after', async () => {
    // A crash between here and the printer costs a code. The opposite order
    // would risk the same code on two receipts, which the tax office refuses.
    await refreshLease(0);
    await takeStamp();
    expect((await loadLease()).spent).toEqual(['OFF-0001']);
  });

  it('refuses rather than stamping when a gate is closed', async () => {
    await refreshLease(0);
    setStore(fiscalConfig({ requisites: null }));
    await expect(takeStamp()).rejects.toBeInstanceOf(OfflineFiscalError);
    // And nothing was spent on the attempt.
    expect((await loadLease()).spent).toEqual([]);
  });
});

describe('refuseStamp', () => {
  const withLease = async (over: Partial<FiscalLeaseResponse> = {}) => {
    vi.mocked(api.fiscalLease).mockResolvedValue(leaseAnswer(over));
    return refreshLease(0);
  };

  it('lets a prepared till sell', async () => {
    expect(refuseStamp(fiscalConfig(), await withLease())).toBeNull();
  });

  it('refuses a store that is not in offline mode at all', async () => {
    const lease = await withLease();
    expect(refuseStamp(fiscalConfig({ offline_mode: false }), lease)).toBe('offline_off');
    expect(refuseStamp(fiscalConfig({ enabled: false }), lease)).toBe('offline_off');
    expect(refuseStamp(null, lease)).toBe('offline_off');
  });

  it('refuses before the register requisites have ever been fetched', async () => {
    // The header of a ПРРО receipt is not ours to invent (Положення № 13 п. 2),
    // so the first receipt of a register is online by necessity.
    expect(refuseStamp(fiscalConfig({ requisites: null }), await withLease())).toBe('no_requisites');
  });

  it('refuses outside an open shift', async () => {
    expect(refuseStamp(fiscalConfig(), await withLease({ shift: null }))).toBe('no_shift');
  });

  it('refuses as the shift approaches its 24 hours', async () => {
    // Earlier than the server would auto-close it: receipts dated after a
    // Z-report can never be filed.
    const lease = await withLease({
      shift: { id: 7, opened_at: null, auto_close_due_at: hoursFromNow(0.1) },
    });
    expect(refuseStamp(fiscalConfig(), lease)).toBe('shift_deadline');
  });

  it('refuses once the outage passes the tax office 36 hours', async () => {
    // A shift whose deadline we never learned — otherwise the 24h gate above
    // always fires first, being the sooner of the two and the one a cashier
    // can act on.
    const lease = await withLease({ shift: { id: 7, opened_at: null, auto_close_due_at: null } });
    const started = Date.now();
    expect(
      refuseStamp(fiscalConfig(), { ...lease, stretchStartedAt: started }, started + 1000)
    ).toBeNull();
    expect(
      refuseStamp(
        fiscalConfig(),
        { ...lease, stretchStartedAt: started },
        started + OFFLINE_STRETCH_MAX_MS + 1000
      )
    ).toBe('offline_limit');
  });

  it('refuses when the reserve is spent', async () => {
    await withLease();
    await takeStamp();
    await takeStamp();
    expect(refuseStamp(fiscalConfig(), await loadLease())).toBe('no_lease');
  });
});
