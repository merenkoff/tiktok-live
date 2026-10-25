// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/debt-chain.service.ts — giving back what went through a «під
// запис» line's ПРРО prepayment chain (migration 079,
// TechDocs/grocery/G3_DEBTS.md §11 «Крок 2», 2-Б).
//
// The provider returns a chain only WHOLE — one call, one return document per
// document of it — so there are exactly two things to give back, each all of
// one chain at once:
//   · «Скасувати внески» — the line is still open: every «внесок» of its
//     chain goes back to the customer as money, the sum is owed again (a
//     `payment_void` per «внесок» in the journal) and the line leaves the
//     chain, so its next «внесок» opens a new one under the next number;
//   · the goods of a line the chain closed come back — the receipt that
//     closed it is refunded whole, the goods to the shelf from its snapshot,
//     and every «внесок» of the chain with it. The debt is not reopened: it
//     was paid, as with any paid goods brought back (§3 «Повернення
//     оплаченого товару»).
//
// Both are refunds and follow the refund route's rule rather than a sale's:
// written first, then registered, and once written the money goes back
// whatever ПРРО answers — a refusal or a timeout leaves the return documents
// to the retry and to the owner's «ПРРО» page and never undoes the refunds.
// What stops one before anything is written: the pre-flight (503 / 409), a
// chain document still on its way (`chain_pending` / `chain_parked`), another
// provider's chain, and a store that does not fiscalise now.

import { pool } from '../db.js';
import { logger } from '../logger.js';
import * as fiscalService from './fiscal/fiscal.service.js';
import { getSale, markRefundFiscalFailed, refundPrepaymentTx, refundSaleTx } from './sales.service.js';
import type { RefundSaleTxResult } from './sales.service.js';
import {
  DebtConflict,
  DebtError,
  DebtNotFound,
  assertChainSettled,
  lockCustomer,
} from './debt-lines.service.js';
import { derivedUuid } from './debt-payment.service.js';
import { getStatement } from './debts.service.js';
import type { DebtCreditView, DebtLineView } from './debts.service.js';
import type { RefundReasonCode } from './types.js';

type DbClient = { query: typeof pool.query };
type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSale>>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_CODES: RefundReasonCode[] = ['size', 'color', 'style', 'defect', 'other'];

/** Said beside the answer while a return document is still to be registered. */
export const RETURN_PENDING_WARNING =
  'Повернення записано — гроші покупцеві віддайте. Чеки повернення ще реєструються в ПРРО, повторювати нічого не треба.';

export interface ChainReturnInput {
  storeId: number;
  staffId: number;
  customerId: number;
  line_id: unknown;
  client_uuid: unknown;
  /** The goods' return only: why they come back — `defect` writes them off rather than shelving them. */
  reason_code?: unknown;
  /** The pre-flight, asked once, before anything is written. Absent = this call fiscalises nothing. */
  fiscal?: { gate: () => Promise<fiscalService.FiscalGate> };
}

export interface ChainReturnPart {
  /** `prepayment` — a «внесок» given back; `chain_close` — the receipt that closed the line, its goods back. */
  kind: 'prepayment' | 'chain_close';
  /** The sale as it stands after the refund; its `refunds` carry this one. */
  sale: SaleDetail;
  refund_id: number;
  /** The return document registered by THIS call; null on a repeat or while it is still to be. */
  fiscal: fiscalService.FiscalView | null;
}

export interface ChainReturnResult {
  /** The refunds, the receipt that closed the line first, then the «внески» newest first. */
  parts: ChainReturnPart[];
  /** What goes back to the customer — every refund with its cash rounding. */
  back_cents: number;
  /** Set while a return document is still to be registered: hand the money over, repeat nothing. */
  warning: string | null;
  credit: DebtCreditView;
  open_lines: DebtLineView[];
  /** This `client_uuid` had been used already — nothing new happened. */
  replay: boolean;
}

/** ПРРО could not be asked before anything was written — nothing was. */
export class ChainFiscalRefusal extends Error {
  constructor(
    message: string,
    readonly detail: { cause: unknown }
  ) {
    super(message);
    this.name = 'ChainFiscalRefusal';
  }
}

/** The key of the refund of `saleId` in the request keyed `clientUuid`. */
export function chainRefundUuidFor(clientUuid: string, saleId: number): string {
  return derivedUuid(`debt-chain-refund:${clientUuid}:${saleId}`);
}

/** «Скасувати внески»: every «внесок» of an open line's chain back to the customer, the sum owed again. */
export function cancelChainPrepayments(input: ChainReturnInput): Promise<ChainReturnResult> {
  return giveBackChain(input, 'cancel');
}

/** The goods of a line its chain closed, back on the shelf, and all the money for them back to the customer. */
export function returnChainGoods(input: ChainReturnInput): Promise<ChainReturnResult> {
  return giveBackChain(input, 'goods');
}

interface ChainLine {
  id: number;
  customer_id: number;
  product_name: string;
  variant_label: string;
  quantity: number;
  returned_quantity: number;
  paid_quantity: number;
  sale_id: number | null;
  written_off: boolean;
  fiscal_chain_id: string | null;
  fiscal_chain_provider: string | null;
}

interface ChainSale {
  id: number;
  receipt_number: string;
  /** The line a «внесок» went to; null on the receipt that closed it. */
  prepay_line_id: number | null;
  status: string;
  cash_rounding: number;
  provider_doc_id: string | null;
}

async function readLine(client: DbClient, storeId: number, customerId: number, lineId: number, lock: boolean): Promise<ChainLine> {
  const rows = await client.query(
    `SELECT id, customer_id, product_name, variant_label, quantity, returned_quantity, paid_quantity,
            sale_id, written_off_entry_id, fiscal_chain_id, fiscal_chain_provider
       FROM pos_debt_items
      WHERE store_id = $1 AND id = $2
      ${lock ? 'FOR UPDATE' : ''}`,
    [storeId, lineId]
  );
  const row = rows.rows[0];
  if (!row || Number(row.customer_id) !== customerId) throw new DebtNotFound('Рядок боргу не знайдено');
  return {
    id: Number(row.id),
    customer_id: Number(row.customer_id),
    product_name: String(row.product_name ?? ''),
    variant_label: String(row.variant_label ?? ''),
    quantity: Number(row.quantity),
    returned_quantity: Number(row.returned_quantity),
    paid_quantity: Number(row.paid_quantity ?? 0),
    sale_id: row.sale_id == null ? null : Number(row.sale_id),
    written_off: row.written_off_entry_id != null,
    fiscal_chain_id: row.fiscal_chain_id == null ? null : String(row.fiscal_chain_id),
    fiscal_chain_provider: row.fiscal_chain_provider == null ? null : String(row.fiscal_chain_provider),
  };
}

/** The chain's documents that stand: every sale under its number but a voided one. */
async function readChainSales(client: DbClient, storeId: number, chainId: string, lock: boolean): Promise<ChainSale[]> {
  const rows = await client.query(
    `SELECT s.id, s.receipt_number, s.debt_prepay_item_id, s.status, s.cash_rounding, r.provider_doc_id
       FROM pos_sales s
       LEFT JOIN pos_fiscal_receipts r ON r.sale_id = s.id AND r.doc_type = 'sale'
      WHERE s.store_id = $1 AND s.fiscal_chain_id = $2 AND s.status <> 'voided'
      ORDER BY s.id DESC
      ${lock ? 'FOR UPDATE OF s' : ''}`,
    [storeId, chainId]
  );
  return rows.rows.map((row) => ({
    id: Number(row.id),
    receipt_number: String(row.receipt_number ?? ''),
    prepay_line_id: row.debt_prepay_item_id == null ? null : Number(row.debt_prepay_item_id),
    status: String(row.status),
    cash_rounding: Number(row.cash_rounding ?? 0),
    provider_doc_id: row.provider_doc_id == null ? null : String(row.provider_doc_id),
  }));
}

function titleOf(line: Pick<ChainLine, 'product_name' | 'variant_label'>): string {
  return line.variant_label ? `${line.product_name} · ${line.variant_label}` : line.product_name;
}

/**
 * What of the chain this request gives back, or why it cannot: the «внески»
 * of an open line, or the receipt that closed the line with them. Every
 * document must still stand — a chain is given back once.
 */
function chainToGiveBack(
  mode: 'cancel' | 'goods',
  line: ChainLine,
  sales: ChainSale[]
): { close: ChainSale | null; prepayments: ChainSale[] } {
  const title = titleOf(line);
  const open =
    line.sale_id == null && !line.written_off && line.returned_quantity + line.paid_quantity < line.quantity;
  if (mode === 'cancel' && !open) {
    throw new DebtConflict(`«${title}» уже закрито — оновіть виписку`, 'stale_statement');
  }
  if (!line.fiscal_chain_id) {
    throw new DebtConflict(
      mode === 'cancel'
        ? `За «${title}» немає внесків у ПРРО — внесок без ПРРО скасовують у журналі виписки`
        : `«${title}» закрито не ланцюжком ПРРО — його повертають звичайним поверненням чека`,
      'no_chain'
    );
  }
  const prepayments = sales.filter((sale) => sale.prepay_line_id === line.id);
  const close = mode === 'goods' ? (sales.find((sale) => sale.id === line.sale_id && sale.prepay_line_id == null) ?? null) : null;
  if (mode === 'goods' && !close) {
    throw new DebtConflict(`«${title}» закрито не ланцюжком ПРРО — його повертають звичайним поверненням чека`, 'no_chain');
  }
  // Anything else under the number, or a document already given back, says
  // the screen is older than the chain.
  const ours = new Set([...prepayments.map((sale) => sale.id), ...(close ? [close.id] : [])]);
  if (prepayments.length === 0 || sales.some((sale) => !ours.has(sale.id))) {
    throw new DebtConflict('Виписка змінилася — оновіть її', 'stale_statement');
  }
  if ([...prepayments, ...(close ? [close] : [])].some((sale) => sale.status !== 'completed')) {
    throw new DebtConflict(
      mode === 'cancel' ? `Внески за «${title}» уже повернуто — оновіть виписку` : `«${title}» уже повернуто`,
      'already_returned'
    );
  }
  return { close, prepayments };
}

function parseInput(input: ChainReturnInput, mode: 'cancel' | 'goods') {
  const clientUuid = typeof input.client_uuid === 'string' ? input.client_uuid.trim().toLowerCase() : '';
  if (!UUID_RE.test(clientUuid)) throw new DebtError('client_uuid обовʼязковий і має бути UUID');
  const lineId = Number(input.line_id);
  if (!Number.isInteger(lineId) || lineId <= 0) throw new DebtError('Рядок боргу не знайдено');
  let reasonCode: RefundReasonCode | null = null;
  if (mode === 'goods' && input.reason_code != null) {
    if (!REASON_CODES.includes(input.reason_code as RefundReasonCode)) throw new DebtError('Невідома причина повернення');
    reasonCode = input.reason_code as RefundReasonCode;
  }
  return { clientUuid, lineId, reasonCode };
}

/** The refunds an earlier request with this key wrote for this line, if any. */
async function findWritten(storeId: number, lineId: number, clientUuid: string): Promise<Array<{ refundId: number; saleId: number }>> {
  const sales = await pool.query(
    `SELECT s.id FROM pos_sales s
      WHERE s.store_id = $1
        AND (s.debt_prepay_item_id = $2
             OR s.id = (SELECT sale_id FROM pos_debt_items WHERE store_id = $1 AND id = $2))`,
    [storeId, lineId]
  );
  const keys = sales.rows.map((row) => chainRefundUuidFor(clientUuid, Number(row.id)));
  if (keys.length === 0) return [];
  const refunds = await pool.query(
    `SELECT id, sale_id FROM pos_refunds WHERE store_id = $1 AND client_uuid = ANY($2::uuid[]) ORDER BY id ASC`,
    [storeId, keys]
  );
  return refunds.rows.map((row) => ({ refundId: Number(row.id), saleId: Number(row.sale_id) }));
}

async function answer(
  input: ChainReturnInput,
  written: Array<{ refundId: number; saleId: number }>,
  views: Map<number, fiscalService.FiscalView> | null,
  replay: boolean
): Promise<ChainReturnResult> {
  const parts: ChainReturnPart[] = [];
  let back = 0;
  for (const { refundId, saleId } of written) {
    const sale = (await getSale(input.storeId, saleId)) as SaleDetail;
    const refund = sale.refunds.find((r) => r.id === refundId);
    back += (refund?.total_cents ?? 0) + (refund?.rounding_cents ?? 0);
    parts.push({
      kind: sale.debt_prepayment ? 'prepayment' : 'chain_close',
      sale,
      refund_id: refundId,
      fiscal: views?.get(refundId) ?? null,
    });
  }
  const unregistered = parts.some((part) => {
    const status = part.fiscal?.status ?? part.sale.refunds.find((r) => r.id === part.refund_id)?.fiscal_status;
    return status !== 'done' && status !== 'none';
  });
  const statement = await getStatement(input.storeId, input.customerId);
  return {
    parts,
    back_cents: back,
    warning: unregistered ? RETURN_PENDING_WARNING : null,
    credit: statement.credit,
    open_lines: statement.open_lines,
    replay,
  };
}

async function giveBackChain(input: ChainReturnInput, mode: 'cancel' | 'goods'): Promise<ChainReturnResult> {
  const { clientUuid, lineId, reasonCode } = parseInput(input, mode);
  // This customer's line, or nothing — before anything is read for it.
  const line = await readLine(pool, input.storeId, input.customerId, lineId, false);

  // The same tap again: what it wrote is the answer, whatever stands now.
  const earlier = await findWritten(input.storeId, lineId, clientUuid);
  if (earlier.length > 0) return answer(input, earlier, null, true);

  // What can be checked before ПРРО is asked anything.
  const sales = line.fiscal_chain_id ? await readChainSales(pool, input.storeId, line.fiscal_chain_id, false) : [];
  chainToGiveBack(mode, line, sales);
  await assertChainSettled(pool, input.storeId, line.fiscal_chain_id as string);

  let gate: fiscalService.FiscalGate | null = null;
  if (input.fiscal) {
    try {
      gate = await input.fiscal.gate();
    } catch (error) {
      throw new ChainFiscalRefusal(error instanceof Error ? error.message : String(error), { cause: error });
    }
  }
  const provider = gate?.on ? gate.ctx?.provider : null;
  if (!provider) {
    throw new DebtConflict(
      'ПРРО зараз вимкнено, а повернути внески можна лише через ПРРО — увімкніть його в налаштуваннях',
      'chain_needs_prro'
    );
  }
  if (provider.id !== line.fiscal_chain_provider || !provider.prepaymentChain) {
    throw new DebtConflict('Внески за цей товар приймали через інший ПРРО — повернути їх можна лише там', 'chain_other_provider');
  }

  const client = await pool.connect();
  const written: Array<{ sale: ChainSale; tx: RefundSaleTxResult }> = [];
  let cashierName = '';
  try {
    await client.query('BEGIN');
    const customer = await lockCustomer(client, input.storeId, input.customerId);
    const locked = await readLine(client, input.storeId, input.customerId, lineId, true);
    if (locked.fiscal_chain_id !== line.fiscal_chain_id) {
      throw new DebtConflict('Виписка змінилася — оновіть її', 'stale_statement');
    }
    const { close, prepayments } = chainToGiveBack(
      mode,
      locked,
      await readChainSales(client, input.storeId, locked.fiscal_chain_id as string, true)
    );
    await assertChainSettled(client, input.storeId, locked.fiscal_chain_id as string);
    const staff = await client.query(`SELECT display_name FROM pos_staff WHERE id = $1`, [input.staffId]);
    cashierName = String(staff.rows[0]?.display_name ?? '');

    if (close) {
      const item = await client.query(
        `SELECT id, quantity, refunded_quantity FROM pos_sale_items
          WHERE sale_id = $1 AND debt_item_id = $2`,
        [close.id, locked.id]
      );
      if (item.rows.length !== 1) throw new DebtConflict('Виписка змінилася — оновіть її', 'stale_statement');
      written.push({
        sale: close,
        tx: await refundSaleTx(client, {
          storeId: input.storeId,
          saleId: close.id,
          staffId: input.staffId,
          items: [
            {
              sale_item_id: Number(item.rows[0].id),
              quantity: Number(item.rows[0].quantity) - Number(item.rows[0].refunded_quantity),
            },
          ],
          reason: 'Повернення товару, оплаченого частинами',
          reason_code: reasonCode,
          buyer_name: customer.name,
          client_uuid: chainRefundUuidFor(clientUuid, close.id),
          fiscal_status: 'pending',
          // What was taken is what goes back: the receipt's own cash rounding.
          cash_rounding: close.cash_rounding,
          chain_return: true,
        }),
      });
    }
    for (const prepayment of prepayments) {
      written.push({
        sale: prepayment,
        tx: await refundPrepaymentTx(client, {
          storeId: input.storeId,
          staffId: input.staffId,
          saleId: prepayment.id,
          client_uuid: chainRefundUuidFor(clientUuid, prepayment.id),
          reason: mode === 'cancel' ? 'Скасування внеску' : 'Повернення товару, оплаченого частинами',
          buyer_name: customer.name,
          fiscal_status: 'pending',
        }),
      });
    }

    if (mode === 'cancel') {
      // The money is back with the customer, so the sum is owed again — and
      // the line leaves the chain: its next «внесок» opens a new one.
      for (const { sale, tx } of written) {
        await client.query(
          `INSERT INTO pos_debt_entries (store_id, customer_id, kind, amount_cents, staff_id, sale_id, reason)
           VALUES ($1, $2, 'payment_void', $3, $4, $5, 'Внесок повернуто через ПРРО')
           ON CONFLICT (sale_id, kind) WHERE sale_id IS NOT NULL DO NOTHING`,
          [input.storeId, input.customerId, tx.totalCents, input.staffId, sale.id]
        );
      }
      const back = written.reduce((sum, { tx }) => sum + tx.totalCents, 0);
      await client.query(
        `UPDATE pos_debt_items
            SET prepaid_cents = prepaid_cents - $3, fiscal_chain_id = NULL, fiscal_chain_provider = NULL
          WHERE store_id = $1 AND id = $2`,
        [input.storeId, locked.id, back]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    // Two tills sending the same request collide on a refund's key.
    if ((error as { code?: string } | null)?.code === '23505') {
      const again = await findWritten(input.storeId, lineId, clientUuid);
      if (again.length > 0) return answer(input, again, null, true);
    }
    throw error;
  } finally {
    client.release();
  }

  const views = new Map<number, fiscalService.FiscalView>();
  try {
    const registered = await fiscalService.fiscalizeChainReturn(gate as fiscalService.FiscalGate, {
      relationId: line.fiscal_chain_id as string,
      cashierName,
      docs: written.map(({ sale, tx }) => ({
        refundId: tx.refundId,
        requestId: chainRefundUuidFor(clientUuid, sale.id),
        totalCents: tx.totalCents + tx.roundingCents,
        relatedProviderDocId: sale.provider_doc_id as string,
      })),
    });
    registered.forEach((view, i) => views.set(written[i].tx.refundId, view));
  } catch (error) {
    // The refunds stand — the money goes back, as with any refund. A failure
    // before a ledger row was written leaves nothing for the retry to find,
    // so the refunds say «failed» where the owner looks.
    if (error instanceof fiscalService.FiscalDocumentFailed) {
      for (const { tx } of written) views.set(tx.refundId, fiscalService.failureView(error));
    } else {
      for (const { tx } of written) await markRefundFiscalFailed(input.storeId, tx.refundId);
    }
    logger.error('Chain return fiscalisation failed', {
      storeId: input.storeId,
      lineId,
      chainId: line.fiscal_chain_id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return answer(
    input,
    written.map(({ sale, tx }) => ({ refundId: tx.refundId, saleId: sale.id })),
    views,
    false
  );
}
