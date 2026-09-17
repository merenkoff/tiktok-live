// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The florist's bench, server side: what happens when a bouquet is assembled
 * for the window instead of for a customer standing there.
 *
 * Design: `TechDocs/POS_FLORIST_BENCH.md` §11. The short version is that a
 * window bouquet is a **catalogue card for one physical object** — its own
 * product, its own price, stock of exactly 1 — and the stems that went into it
 * leave the shelf through a production document (`ВР`), exactly as they would
 * if the owner had assembled a batch on `/admin/stock/production`.
 *
 * Why one card per bouquet rather than one «Букет на вітрині» card counted to
 * three: stock is a counter, not a set of distinct objects, and a 900 ₴ bouquet
 * and a 2400 ₴ bouquet cannot share a row and a price. The card is the object.
 *
 * Why one transaction rather than create-product → create-document → post:
 * each of those owns its own transaction, so a failure between them leaves a
 * card with no stock — a bouquet that exists in the catalogue and not in the
 * shop. This composes the low-level pieces instead, the same way `submitCount`
 * does for a count sheet.
 */

import { pool } from '../db.js';
import { logger } from '../logger.js';
import { createProductInTx } from './products.service.js';
import {
  priceOfComposition,
  produceComposite,
  type ComponentInput,
} from './composites.service.js';
import { internalBarcodeFor } from './core/internalBarcode.js';

type DbClient = { query: typeof pool.query };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A bouquet of more stems than this is a data-entry accident, not an order. */
const MAX_COMPONENTS = 60;

/** The tag every window bouquet joins, so the till has them one tap away. */
export const SHOWCASE_TAG = 'Вітрина';

export interface ShowcaseInput {
  storeId: number;
  staffId: number;
  /** Idempotency key minted by the till — a retry returns the first answer. */
  clientUuid: string;
  components: ComponentInput[];
  /** What to call it. Defaults to «Букет №<the production document's number>». */
  name?: string | null;
  /**
   * The shelf price, when the florist rounded the computed one. Omitted means
   * "use what the bench computed" (parts + the store's assembly charge).
   *
   * Settable here and NOT at checkout, and the difference matters: this is a
   * catalogue price on a real product card — the place prices are supposed to
   * live, visible in every report and on the printed tag. A freely settable
   * *line* price at the till is the hole `TechDocs/POS_FLORIST_BENCH.md` §3.5
   * refuses, because no receipt would ever show it.
   */
  priceCents?: number | null;
  note?: string | null;
}

export interface ShowcaseResult {
  product_id: number;
  variant_id: number;
  name: string;
  barcode: string;
  price_cents: number;
  cost_cents: number;
  document_id: number;
  doc_number: string;
  /** False when this was a retry of a `client_uuid` already assembled. */
  created: boolean;
}

export class BenchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BenchError';
  }
}

function normalizeComponents(input: ComponentInput[]): ComponentInput[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new BenchError('Букет порожній');
  }
  if (input.length > MAX_COMPONENTS) {
    throw new BenchError(`Забагато складників (максимум ${MAX_COMPONENTS})`);
  }
  const byVariant = new Map<number, number>();
  for (const row of input) {
    const variantId = Number(row?.component_variant_id);
    const quantity = Number(row?.quantity);
    if (!Number.isInteger(variantId) || variantId <= 0) {
      throw new BenchError('component_variant_id має бути додатним цілим');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BenchError('quantity має бути додатним цілим');
    }
    if (byVariant.has(variantId)) {
      throw new BenchError(`Складник ${variantId} повторюється`);
    }
    byVariant.set(variantId, quantity);
  }
  return [...byVariant].map(([component_variant_id, quantity]) => ({
    component_variant_id,
    quantity,
  }));
}

async function findExisting(
  client: DbClient,
  storeId: number,
  clientUuid: string
): Promise<ShowcaseResult | null> {
  const doc = await client.query(
    `SELECT d.id, d.doc_number, l.variant_id
     FROM pos_stock_documents d
     JOIN pos_stock_document_lines l ON l.document_id = d.id
     WHERE d.store_id = $1 AND d.client_uuid = $2
     ORDER BY l.id ASC
     LIMIT 1`,
    [storeId, clientUuid]
  );
  if (doc.rows.length === 0) return null;
  const variantId = Number(doc.rows[0].variant_id);
  const variant = await client.query(
    `SELECT v.id, v.barcode, v.price_cents, v.cost_cents, v.product_id, p.name
     FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     WHERE v.id = $1`,
    [variantId]
  );
  if (variant.rows.length === 0) return null;
  const row = variant.rows[0];
  return {
    product_id: Number(row.product_id),
    variant_id: variantId,
    name: String(row.name),
    barcode: String(row.barcode ?? ''),
    price_cents: Number(row.price_cents),
    cost_cents: Number(row.cost_cents),
    document_id: Number(doc.rows[0].id),
    doc_number: String(doc.rows[0].doc_number),
    created: false,
  };
}

/** Find-or-create the showcase tag, inside the caller's transaction. */
async function showcaseTagId(client: DbClient, storeId: number): Promise<number> {
  const existing = await client.query(
    `SELECT id FROM pos_tags WHERE store_id = $1 AND name = $2 LIMIT 1`,
    [storeId, SHOWCASE_TAG]
  );
  if (existing.rows.length > 0) return Number(existing.rows[0].id);
  const created = await client.query(
    `INSERT INTO pos_tags (store_id, parent_id, name, sort_order, show_in_catalog_bar)
     VALUES ($1, NULL, $2, 0, TRUE)
     RETURNING id`,
    [storeId, SHOWCASE_TAG]
  );
  return Number(created.rows[0].id);
}

/** `ВР-2026-00042` → `42`, for «Букет №42» on the price tag. */
function numberFromDoc(docNumber: string): string {
  const tail = docNumber.split('-').pop() ?? '';
  const n = Number(tail);
  return Number.isFinite(n) && n > 0 ? String(n) : tail;
}

/**
 * Assemble a bouquet for the window: a one-off catalogue card carrying exactly
 * this composition, plus a posted production document that takes its stems off
 * the shelf and puts one bouquet on it.
 *
 * The card's own `pos_product_components` rows ARE the record of what went in,
 * which is why no separate snapshot table exists: `produceComposite` reads them
 * to do the write-off, and a later reversal replays the recorded movements
 * rather than the recipe, so editing the card afterwards cannot corrupt
 * anything. Selling an `own` composite never reads the recipe at all.
 */
export async function assembleForShowcase(input: ShowcaseInput): Promise<ShowcaseResult> {
  const clientUuid = String(input.clientUuid ?? '').trim().toLowerCase();
  if (!UUID_RE.test(clientUuid)) throw new BenchError('client_uuid must be a UUID');
  const components = normalizeComponents(input.components);
  if (input.priceCents != null) {
    if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
      throw new BenchError('Ціна має бути цілим числом копійок, не меншим за 0');
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const already = await findExisting(client, input.storeId, clientUuid);
    if (already) {
      await client.query('COMMIT');
      return already;
    }

    // Priced through the one function checkout uses, so the number on the tag
    // is the number the bench showed the florist. It already adds the store's
    // assembly charge — applying `withLabour` on top of it would charge the
    // labour twice, which is a 56% markup in a shop that set 25%.
    const priceCents =
      input.priceCents ?? (await priceOfComposition(client, input.storeId, components));

    // The document number is minted first because it names the bouquet.
    const docNumber = await nextProductionNumber(client, input.storeId);
    const name = input.name?.trim() || `Букет №${numberFromDoc(docNumber)}`;

    const { productId, variantIds } = await createProductInTx(client, input.storeId, {
      name,
      description: `Зібрано на столі флориста, ${docNumber}`,
      kind: 'composite',
      stock_mode: 'own',
      one_off: true,
      variants: [
        {
          attributes: {},
          price_cents: priceCents,
          cost_cents: 0,
          // Zero: the production document below is what puts the bouquet on the
          // shelf. Seeding 1 here would be a second, unexplained movement.
          quantity: 0,
          components,
        },
      ],
    });
    const variantId = variantIds[0];

    // The barcode needs the id, so it lands in a second write. It is derived
    // from that id, so it cannot collide — see `core/internalBarcode.ts`.
    const barcode = internalBarcodeFor(variantId);
    await client.query(`UPDATE pos_variants SET barcode = $1 WHERE id = $2`, [
      barcode,
      variantId,
    ]);

    const tagId = await showcaseTagId(client, input.storeId);
    await client.query(
      `INSERT INTO pos_product_tags (product_id, tag_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [productId, tagId]
    );

    const doc = await client.query(
      `INSERT INTO pos_stock_documents
         (store_id, type, status, doc_number, occurred_at, note, created_by,
          posted_by, posted_at, client_uuid)
       VALUES ($1, 'production', 'posted', $2, NOW(), $3, $4, $4, NOW(), $5)
       RETURNING id`,
      [
        input.storeId,
        docNumber,
        input.note?.trim() || `Букет на вітрину: ${name}`,
        input.staffId,
        clientUuid,
      ]
    );
    const documentId = Number(doc.rows[0].id);

    const { unitCostCents } = await produceComposite(client, {
      storeId: input.storeId,
      variantId,
      quantity: 1,
      staffId: input.staffId,
      referenceType: 'stock_document',
      referenceId: documentId,
      note: input.note?.trim() || null,
    });

    await client.query(
      `INSERT INTO pos_stock_document_lines
         (document_id, store_id, variant_id, quantity, unit_cost_cents)
       VALUES ($1, $2, $3, 1, $4)`,
      [documentId, input.storeId, variantId, unitCostCents]
    );
    // What the bouquet cost the shop, so the window's realised margin is a real
    // number rather than a guess (this is what florist analytics will read).
    await client.query(`UPDATE pos_variants SET cost_cents = $1 WHERE id = $2`, [
      unitCostCents,
      variantId,
    ]);

    await client.query('COMMIT');
    logger.info('POS bench: bouquet assembled for the showcase', {
      storeId: input.storeId,
      variantId,
      docNumber,
      priceCents,
    });
    return {
      product_id: productId,
      variant_id: variantId,
      name,
      barcode,
      price_cents: priceCents,
      cost_cents: unitCostCents,
      document_id: documentId,
      doc_number: docNumber,
      created: true,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    // Two tills retrying the same bouquet: the loser trips the unique index on
    // (store_id, client_uuid) — hand it the winner's card rather than an error,
    // which is the whole point of the idempotency key.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
      const winner = await findExisting(pool, input.storeId, clientUuid);
      if (winner) return winner;
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The production counter, same shape as `nextDocNumber` in
 * `stock-documents.service.ts`. Duplicated rather than exported from there
 * because that module's copy is private and this needs the number *before* the
 * document row exists — the bouquet is named after it.
 */
async function nextProductionNumber(client: DbClient, storeId: number): Promise<string> {
  const year = new Date().getFullYear();
  const counterKey = `production_${year}`;
  await client.query(
    `INSERT INTO pos_store_counters (store_id, counter_key, next_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (store_id, counter_key) DO NOTHING`,
    [storeId, counterKey]
  );
  const result = await client.query(
    `UPDATE pos_store_counters
     SET next_value = next_value + 1
     WHERE store_id = $1 AND counter_key = $2
     RETURNING next_value - 1 AS seq`,
    [storeId, counterKey]
  );
  return `ВР-${year}-${String(Number(result.rows[0].seq)).padStart(5, '0')}`;
}
