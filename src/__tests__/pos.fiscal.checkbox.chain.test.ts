// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.checkbox.chain.test.ts — the Checkbox adapter's
// prepayment chains (TechDocs/grocery/G3_DEBTS.md §11 «Крок 2»), against a
// mocked fetch fed with what the test register really answered on 2026-10-25
// (`fixtures/checkbox/runs/20261025-173126Z-prepayment/`).
//
// What is pinned is what the run taught and the orchestrator relies on: our
// number is the chain's (answer 1); a further document is sent only after the
// chain says it expects exactly what we think is owed (answer 2); a repeat is
// found rather than sent twice — `relation_id_not_unique` for an opening
// (answer 7), `already_paid` for a further one (answer 8); and a return is
// one call answered by a receipt per document, told apart by
// `related_receipt_id` or, after a lost answer, by the chain's
// `returned_receipts_mapping` (answer 9).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkboxProvider } from '../pos/fiscal/providers/checkbox/index.js';
import { classifyCheckboxError } from '../pos/fiscal/providers/checkbox/errors.js';
import { CheckboxApiError } from '../pos/fiscal/providers/checkbox/client.js';
import type { FiscalCallCtx, FiscalDocLine, FiscalSaleDoc } from '../pos/fiscal/types.js';

const RUN = join(__dirname, 'fixtures/checkbox/runs/20261025-173126Z-prepayment');
const fixture = (name: string) => JSON.parse(readFileSync(join(RUN, `${name}.json`), 'utf-8'));

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => 'application/json' },
  };
}

function stubFetch(...responses: unknown[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

function ctx(): FiscalCallCtx {
  return {
    storeId: 1,
    creds: { provider: 'checkbox', config: {}, secrets: { licenceKey: 'lic', cashierPin: '1' } },
    session: { token: 'jwt', expiresAt: null },
    clientName: 'the-live-shop-pos',
    clientVersion: '1',
    signal: AbortSignal.timeout(10_000),
  };
}

const BASE = 'https://api.checkbox.in.ua/api/v1';

/** The cap of chain A: 1 × 590.00, nothing off. */
function cap(owed = 59000): FiscalDocLine {
  return {
    name: 'Кепка',
    quantityMilli: 1000,
    unitPriceCents: 59000,
    lineTotalCents: owed,
    discountCents: 59000 - owed,
    taxCode: null,
    barcode: null,
    uktzed: null,
    sourceLineRef: 'debt-1',
    unit: 'шт',
  };
}

function chainDoc(overrides: Partial<FiscalSaleDoc> & Pick<FiscalSaleDoc, 'chain'>): FiscalSaleDoc {
  return {
    kind: 'sale',
    requestId: 'req-1',
    ourNumber: 'R-00001',
    cashierName: 'Касир',
    lines: [cap()],
    payments: [{ method: 'cash', amountCents: 30000 }],
    totalCents: 30000,
    discountCents: 0,
    ...overrides,
  };
}

const A1 = fixture('A1_open_300_cash_receipt');
const A2 = fixture('A2_after_open_relation');
const A3 = fixture('A3_second_prepayment_100_cash_receipt');
const A6 = fixture('A6_after_closing_relation');
const RELATION = A2.relation_id as string;

describe('opening a chain', () => {
  it('sends the line as the chain’s goods, our number as its own, and the «внесок» as its payment', async () => {
    const fetchMock = stubFetch(jsonResponse(201, { ...A1, status: 'CREATED' }), jsonResponse(200, A1));
    const result = await checkboxProvider.registerSale(
      ctx(),
      chainDoc({ requestId: A1.id, chain: { relationId: RELATION, op: 'open' } })
    );

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/prepayment-receipts`);
    expect(JSON.parse(opts.body)).toEqual({
      id: A1.id,
      cashier_name: 'Касир',
      goods: [{ good: { code: 'debt-1', name: 'Кепка', price: 59000 }, quantity: 1000 }],
      payments: [{ type: 'CASH', value: 30000 }],
      custom_relation_id: RELATION,
    });
    // Then the receipt is read until it is final, like a sale's.
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/receipts/${A1.id}`);
    expect(result).toMatchObject({ providerDocId: A1.id, fiscalCode: A1.fiscal_code });
  });

  it('carries a line discount the way a sale does (answer 5)', async () => {
    const fetchMock = stubFetch(jsonResponse(201, A1), jsonResponse(200, A1));
    await checkboxProvider.registerSale(
      ctx(),
      chainDoc({ requestId: A1.id, lines: [cap(53100)], chain: { relationId: RELATION, op: 'open' } })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).goods[0].discounts).toEqual([
      { type: 'DISCOUNT', mode: 'VALUE', value: 5900 },
    ]);
  });

  it('refuses, sending nothing, a «внесок» that is not below what is owed', async () => {
    const fetchMock = stubFetch();
    await expect(
      checkboxProvider.registerSale(
        ctx(),
        chainDoc({ totalCents: 59000, payments: [{ method: 'cash', amountCents: 59000 }], chain: { relationId: RELATION, op: 'open' } })
      )
    ).rejects.toMatchObject({ kind: 'rejected', providerCode: 'chain_sum' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('finds its own opening again when the number comes back taken (answer 7)', async () => {
    const taken = fixture('A8_open_again_same_id_error');
    stubFetch(jsonResponse(taken.status, taken.body), jsonResponse(200, A2));
    await expect(
      checkboxProvider.registerSale(ctx(), chainDoc({ requestId: A1.id, chain: { relationId: RELATION, op: 'open' } }))
    ).rejects.toMatchObject({ kind: 'duplicate', existingProviderDocId: A1.id });
  });

  it('is refused, not duplicated, when the number is taken by someone else’s chain', async () => {
    const taken = fixture('A8_open_again_same_id_error');
    stubFetch(jsonResponse(taken.status, taken.body), jsonResponse(200, A2));
    await expect(
      checkboxProvider.registerSale(ctx(), chainDoc({ requestId: 'not-the-first', chain: { relationId: RELATION, op: 'open' } }))
    ).rejects.toMatchObject({ kind: 'rejected', providerCode: 'chain_id_taken' });
  });
});

describe('a further document of a chain', () => {
  it('looks at the chain first, then sends only the money (answer 2)', async () => {
    const fetchMock = stubFetch(jsonResponse(200, A2), jsonResponse(201, A3), jsonResponse(200, A3));
    const result = await checkboxProvider.registerSale(
      ctx(),
      chainDoc({
        requestId: A3.id,
        lines: [cap(29000)],
        totalCents: 10000,
        payments: [{ method: 'cash', amountCents: 10000 }],
        chain: { relationId: RELATION, op: 'pay' },
      })
    );
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/prepayment-receipts/${RELATION}`);
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    const [url, opts] = fetchMock.mock.calls[1];
    expect(url).toBe(`${BASE}/prepayment-receipts/${RELATION}`);
    expect(JSON.parse(opts.body)).toEqual({
      id: A3.id,
      cashier_name: 'Касир',
      payments: [{ type: 'CASH', value: 10000 }],
    });
    expect(result.providerDocId).toBe(A3.id);
  });

  it('closes the chain with rounded cash and the rounding mode, as a sale settles (answer 4)', async () => {
    const before = fixture('C2_after_open_relation');
    const closing = fixture('C3_rest_cash_rounded_round50_receipt');
    const sent = fixture('C3_rest_cash_rounded_round50_request');
    const fetchMock = stubFetch(jsonResponse(200, before), jsonResponse(201, closing), jsonResponse(200, closing));
    await checkboxProvider.registerSale(ctx(), {
      kind: 'sale',
      requestId: closing.id,
      ourNumber: 'R-00002',
      cashierName: 'Касир',
      lines: [{ ...cap(before.left_to_pay), unitPriceCents: before.total_sum }],
      payments: [{ method: 'cash', amountCents: sent.payments[0].value }],
      totalCents: before.left_to_pay,
      discountCents: 0,
      cashRounding: { step: 50, amountCents: sent.payments[0].value - before.left_to_pay },
      chain: { relationId: before.relation_id, op: 'pay' },
    });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.payments).toEqual(sent.payments);
    expect(body.rounding_mode).toBe('ROUND_50');
  });

  it('answers a repeat with the document it already holds, sending nothing', async () => {
    const fetchMock = stubFetch(jsonResponse(200, fixture('A4_after_second_relation')));
    await expect(
      checkboxProvider.registerSale(
        ctx(),
        chainDoc({ requestId: A3.id, lines: [cap(19000)], totalCents: 10000, chain: { relationId: RELATION, op: 'pay' } })
      )
    ).rejects.toMatchObject({ kind: 'duplicate', existingProviderDocId: A3.id });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses, sending nothing, when Checkbox expects another sum than we think is owed', async () => {
    const fetchMock = stubFetch(jsonResponse(200, A2));
    await expect(
      checkboxProvider.registerSale(
        ctx(),
        chainDoc({ requestId: 'r-x', lines: [cap(28000)], totalCents: 28000, chain: { relationId: RELATION, op: 'pay' } })
      )
    ).rejects.toMatchObject({ kind: 'rejected', providerCode: 'chain_left_mismatch' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a payment into a chain that is paid, or that Checkbox has not got', async () => {
    stubFetch(jsonResponse(200, A6));
    await expect(
      checkboxProvider.registerSale(ctx(), chainDoc({ requestId: 'r-y', lines: [cap(1000)], totalCents: 1000, chain: { relationId: RELATION, op: 'pay' } }))
    ).rejects.toMatchObject({ kind: 'rejected', providerCode: 'chain_closed' });
    stubFetch(jsonResponse(404, { message: 'Not Found' }));
    await expect(
      checkboxProvider.registerSale(ctx(), chainDoc({ requestId: 'r-z', lines: [cap(1000)], totalCents: 1000, chain: { relationId: 'gone', op: 'pay' } }))
    ).rejects.toMatchObject({ kind: 'rejected', providerCode: 'chain_missing' });
  });

  it('reads an «already paid» as its own document when the receipt is there (answer 8)', async () => {
    const paid = fixture('A7_pay_a_paid_chain_error');
    stubFetch(jsonResponse(200, A2), jsonResponse(paid.status, paid.body), jsonResponse(200, A3));
    await expect(
      checkboxProvider.registerSale(
        ctx(),
        chainDoc({ requestId: A3.id, lines: [cap(29000)], totalCents: 29000, chain: { relationId: RELATION, op: 'pay' } })
      )
    ).rejects.toMatchObject({ kind: 'duplicate', existingProviderDocId: A3.id });
  });

  it('and as a refusal when no receipt of ours is there', async () => {
    const returned = fixture('B5_pay_a_returned_chain_error');
    stubFetch(jsonResponse(200, A2), jsonResponse(returned.status, returned.body), jsonResponse(404, {}));
    await expect(
      checkboxProvider.registerSale(
        ctx(),
        chainDoc({ requestId: 'never-sent', lines: [cap(29000)], totalCents: 10000, chain: { relationId: RELATION, op: 'pay' } })
      )
    ).rejects.toMatchObject({ kind: 'rejected', providerCode: 'prepayment.already_returned' });
  });
});

describe('reading and returning a chain', () => {
  it('reads it in the contract’s words: our number, what is left, its documents in order', async () => {
    stubFetch(jsonResponse(200, fixture('A4_after_second_relation')));
    const state = await checkboxProvider.prepaymentChain!.getChain(ctx(), RELATION);
    expect(state).toMatchObject({
      relationId: RELATION,
      status: 'open',
      totalCents: 59000,
      paidCents: 40000,
      leftCents: 19000,
      documents: [A1.id, A3.id],
      returns: {},
    });
  });

  it('returns it in one call, each return tied to the document it undoes (answer 9)', async () => {
    const returns = [1, 2, 3].map((n) => fixture(`A9_return_whole_chain_${n}_receipt`));
    const fetchMock = stubFetch(
      jsonResponse(201, returns.map((r) => ({ ...r, status: 'CREATED' }))),
      ...returns.map((r) => jsonResponse(200, r))
    );
    const result = await checkboxProvider.prepaymentChain!.returnChain(ctx(), RELATION, { cashierName: 'Касир' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/prepayment-receipts/${RELATION}/return`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cashier_name: 'Касир' });
    expect(result.map((r) => r.relatedProviderDocId)).toEqual(returns.map((r) => r.related_receipt_id));
    expect(result.map((r) => r.result.providerDocId)).toEqual(returns.map((r) => r.id));
  });

  it('after a lost answer finds the returns through the chain’s mapping, not its empty list', async () => {
    const after = fixture('A10_after_return_relation');
    const mapping = after.receipt_chain.returned_receipts_mapping as Record<string, string>;
    const returns = Object.values(mapping).map((id) => ({ ...fixture('A9_return_whole_chain_1_receipt'), id }));
    stubFetch(
      jsonResponse(400, { code: 'prepayment.already_returned', message: 'Усі чеки передплати було повернуто' }),
      jsonResponse(200, after),
      ...returns.map((r) => jsonResponse(200, r))
    );
    const result = await checkboxProvider.prepaymentChain!.returnChain(ctx(), RELATION, { cashierName: 'Касир' });
    expect(Object.fromEntries(result.map((r) => [r.relatedProviderDocId, r.result.providerDocId]))).toEqual(mapping);
  });
});

describe('classifying a chain’s refusals', () => {
  it('a check of the request itself is `rejected` — nothing was created', () => {
    for (const code of ['prepayment.sum_equals_total_sum', 'prepayment.sum_too_large', 'receipt.return_prepayment']) {
      expect(classifyCheckboxError(new CheckboxApiError(400, code, { code, message: 'x' })).kind).toBe('rejected');
    }
  });

  it('a refusal a repeat of our own document also gets stays `unknown` until the adapter has looked', () => {
    for (const code of ['prepayment.relation_id_not_unique', 'prepayment.already_paid', 'prepayment.already_returned']) {
      expect(classifyCheckboxError(new CheckboxApiError(400, code, { code, message: 'x' })).kind).toBe('unknown');
    }
  });
});
