// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/lib/checkoutError.test.ts
//
// The till has to tell three failures apart, and getting it wrong costs money
// in opposite directions: telling the cashier to ring it again for a sale that
// already happened takes payment twice; showing a success screen for a sale
// that was voided hands over goods for nothing.

import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import {
  classifyCheckoutError,
  keepsCart,
  keepsModalOpen,
} from './checkoutError';
import { FiscalSaleUnknownError, OfflineFiscalError } from '../offline/errors';

function httpError(status: number, data: unknown): AxiosError {
  const error = new AxiosError('Request failed', 'ERR_BAD_RESPONSE');
  error.response = {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe('classifyCheckoutError', () => {
  it('reads 409 register_held as a handover, not a retry', () => {
    // Nothing was written and nothing will change by pressing again: another
    // till owns the register until it hands it over.
    const failure = classifyCheckoutError(
      httpError(409, {
        error: 'register_held',
        message: 'Касу ПРРО зайнято іншим пристроєм — запросіть передачу',
        holder: { device_id: 'abcdef1234567890', name: 'Каса 1' },
        support_code: 'FS-REGISTER-HELD',
      })
    );
    expect(failure).toEqual({
      kind: 'register_held',
      message: 'Касу ПРРО зайнято іншим пристроєм — запросіть передачу',
      holderName: 'Каса 1',
    });
    // The cart survives and the modal stays open — the cashier has to read it.
    expect(keepsCart(failure)).toBe(true);
    expect(keepsModalOpen(failure)).toBe(true);
  });

  it('falls back to a short device id when the other till has no name', () => {
    const failure = classifyCheckoutError(
      httpError(409, {
        error: 'register_held',
        message: 'Касу ПРРО зайнято іншим пристроєм',
        holder: { device_id: 'abcdef1234567890', name: null },
      })
    );
    expect(failure).toMatchObject({ kind: 'register_held', holderName: 'abcdef12' });
  });

  it('survives a register_held body with no holder block at all', () => {
    const failure = classifyCheckoutError(
      httpError(409, { error: 'register_held', message: 'Касу ПРРО зайнято' })
    );
    expect(failure).toMatchObject({ kind: 'register_held', holderName: null });
  });

  it('reads 503 as "nothing was written"', () => {
    const failure = classifyCheckoutError(
      httpError(503, {
        error: 'fiscal_unavailable',
        code: 'unavailable',
        message: 'Немає звʼязку з ПРРО — спробуйте ще раз',
        support_code: 'FS-UNAVAILABLE-503',
      })
    );
    expect(failure).toEqual({
      kind: 'fiscal_unavailable',
      message: 'Немає звʼязку з ПРРО — спробуйте ще раз',
      supportCode: 'FS-UNAVAILABLE-503',
    });
    // The pre-flight runs before anything is written, so retrying is free —
    // and the modal must stay up or the cashier never sees why.
    expect(keepsCart(failure)).toBe(true);
    expect(keepsModalOpen(failure)).toBe(true);
  });

  it('reads a voided 502 as "ring it again"', () => {
    const failure = classifyCheckoutError(
      httpError(502, {
        error: 'fiscal_failed',
        code: 'rejected',
        message: 'ПРРО відхилило чек',
        support_code: 'FS-REJECTED',
        sale_id: 42,
        sale_voided: true,
        sale_kept: false,
      })
    );
    expect(failure).toMatchObject({ kind: 'fiscal_failed_voided', saleId: 42 });
    expect(keepsCart(failure)).toBe(true);
    expect(keepsModalOpen(failure)).toBe(false);
  });

  it('reads a kept 502 as "the customer already paid"', () => {
    const failure = classifyCheckoutError(
      httpError(502, {
        error: 'fiscal_failed',
        code: 'unavailable',
        message: 'Немає звʼязку з ПРРО',
        support_code: 'FS-UNAVAILABLE',
        sale_id: 7,
        sale_voided: false,
        sale_kept: true,
      })
    );
    expect(failure).toMatchObject({ kind: 'fiscal_failed_kept', saleId: 7 });
    // The cart is cleared: those goods left the shop.
    expect(keepsCart(failure)).toBe(false);
  });

  it('treats a 502 that names neither key as kept, not voided', () => {
    // The server's "failed outside the document path" branch is the case that
    // matters: reading `sale_kept === true` would drop it into the wrong
    // outcome and tell the cashier to ring a completed sale again.
    const failure = classifyCheckoutError(
      httpError(502, {
        error: 'fiscal_failed',
        code: 'unknown',
        message: 'Помилка ПРРО',
        sale_id: 9,
      })
    );
    expect(failure).toMatchObject({ kind: 'fiscal_failed_kept', saleId: 9 });
  });

  it('reads the 409 replay of a voided sale', () => {
    const failure = classifyCheckoutError(
      httpError(409, {
        error: 'sale_voided_not_fiscalised',
        message: 'Цей чек скасовано — почніть новий',
        sale_id: 5,
      })
    );
    expect(failure).toMatchObject({ kind: 'sale_voided_replay', saleId: 5 });
    expect(keepsCart(failure)).toBe(true);
  });

  it('survives a 502 whose body is an HTML proxy page', () => {
    const failure = classifyCheckoutError(httpError(502, '<html>Bad Gateway</html>'));
    expect(failure.kind).toBe('rejected');
    expect(failure.message).toBeTruthy();
  });

  it('passes an ordinary rejection straight through', () => {
    const failure = classifyCheckoutError(httpError(400, { error: 'Not enough stock' }));
    expect(failure).toEqual({ kind: 'rejected', message: 'Not enough stock' });
  });

  it('handles a bare network error', () => {
    const failure = classifyCheckoutError(new AxiosError('Network Error'));
    expect(failure.kind).toBe('rejected');
  });

  it('recognises the offline block', () => {
    const failure = classifyCheckoutError(new OfflineFiscalError());
    expect(failure.kind).toBe('offline_blocked');
    // Nothing was written, so the cart stands and the modal stays up.
    expect(keepsCart(failure)).toBe(true);
    expect(keepsModalOpen(failure)).toBe(true);
  });

  it('carries the uuid through the unknown-state case', () => {
    const failure = classifyCheckoutError(new FiscalSaleUnknownError('uuid-1'));
    expect(failure).toMatchObject({ kind: 'unknown_state', clientUuid: 'uuid-1' });
    // Re-probing with that uuid is idempotent, which is why the modal waits.
    expect(keepsModalOpen(failure)).toBe(true);
  });
});
