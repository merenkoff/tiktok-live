// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a write that got no answer leaves behind for the next attempt.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  UNANSWERED_TTL_MS,
  customerScope,
  issueScope,
  rememberUnanswered,
  resetUnanswered,
  settle,
  unansweredBody,
  unansweredKey,
} from './pendingKeys';

beforeEach(() => resetUnanswered());

describe('pendingKeys', () => {
  it('hands the same key back until the server settles the write', () => {
    const scope = customerScope('pay', 7);
    expect(unansweredKey(scope)).toBeNull();
    rememberUnanswered(scope, 'k-1', 1000);
    expect(unansweredKey(scope, 2000)).toBe('k-1');
    settle(scope);
    expect(unansweredKey(scope, 3000)).toBeNull();
  });

  it('forgets a key too old to say anything about the cart in front of the cashier', () => {
    const scope = customerScope('return', 7);
    rememberUnanswered(scope, 'k-1', 0);
    expect(unansweredKey(scope, UNANSWERED_TTL_MS)).toBe('k-1');
    expect(unansweredKey(scope, UNANSWERED_TTL_MS + 1)).toBeNull();
    // And stays forgotten.
    expect(unansweredKey(scope, 0)).toBeNull();
  });

  it('never lets a handover replay into a different cart, customer or discount', () => {
    const bread = [{ variant_id: 10, quantity: 2 }];
    const base = issueScope(7, bread, null);
    rememberUnanswered(base, 'k-1');
    expect(unansweredKey(issueScope(7, bread, null))).toBe('k-1');
    expect(unansweredKey(issueScope(8, bread, null))).toBeNull();
    expect(unansweredKey(issueScope(7, [{ variant_id: 10, quantity: 3 }], null))).toBeNull();
    expect(unansweredKey(issueScope(7, bread, { type: 'percent', value: 10 }))).toBeNull();
  });

  it('keeps the kinds of one customer apart', () => {
    rememberUnanswered(customerScope('pay', 7), 'k-pay');
    expect(unansweredKey(customerScope('return', 7))).toBeNull();
    expect(unansweredKey(customerScope('writeoff', 7))).toBeNull();
    expect(unansweredKey(customerScope('pay', 8))).toBeNull();
  });

  it('keeps what a repayment sent with its key, so a sheet opened again sends the same request', () => {
    const scope = customerScope('pay', 7);
    const body = { line_ids: [3, 1], payments: [{ method: 'cash', amount_cents: 39000 }], cash_rounding: 50 };
    rememberUnanswered(scope, 'k-1', 1000, body);
    expect(unansweredBody(scope, 2000)).toEqual(body);
    // Gone with the key — too old, or settled.
    expect(unansweredBody(scope, 1000 + UNANSWERED_TTL_MS + 1)).toBeUndefined();
    rememberUnanswered(scope, 'k-2', 3000, body);
    settle(scope);
    expect(unansweredBody(scope, 4000)).toBeUndefined();
    // A write that remembers no request leaves none.
    rememberUnanswered(scope, 'k-3', 5000);
    expect(unansweredBody(scope, 6000)).toBeUndefined();
  });
});
