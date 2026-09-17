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
import { applyStockDelta } from './stock.service.js';
import { internalBarcodeFor } from './core/internalBarcode.js';
import type { WriteoffReasonCode } from './types.js';

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
  /**
   * A photo of the finished bouquet, already uploaded through `/bench/photo`.
   * Optional: a bouquet without one still has its printed tag, and making the
   * camera mandatory would stop a sale over a picture.
   */
  imageUrl?: string | null;
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
      image_url: input.imageUrl?.trim() || null,
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

/**
 * A window bouquet that did not sell.
 *
 * The loss is the **bouquet**, not its stems: production took those off the
 * shelf days ago, and crediting them back would invent flowers that are in the
 * bin. So this is an ordinary `writeoff` document naming the card itself —
 * which is also what finally makes the window's shrinkage visible in a report
 * instead of a card sitting at quantity 1 forever.
 *
 * Staff level on purpose, and narrower than the owner's write-off screen: only
 * a `one_off` card. The florist made this bouquet and watched it die; the rest
 * of the fridge stays the owner's to write off, so a mis-tap at the till cannot
 * empty a stem line.
 */
export interface ShowcaseWriteoffInput {
  storeId: number;
  staffId: number;
  clientUuid: string;
  variantId: number;
  /** `damaged` = wilted, `gift` = given away. Both happen, and differently. */
  reasonCode: WriteoffReasonCode;
  note?: string | null;
}

export interface ShowcaseWriteoffResult {
  variant_id: number;
  quantity: number;
  document_id: number;
  doc_number: string;
  created: boolean;
}

const TILL_WRITEOFF_REASONS: readonly WriteoffReasonCode[] = ['damaged', 'gift'];

export async function writeOffShowcase(
  input: ShowcaseWriteoffInput
): Promise<ShowcaseWriteoffResult> {
  const clientUuid = String(input.clientUuid ?? '').trim().toLowerCase();
  if (!UUID_RE.test(clientUuid)) throw new BenchError('client_uuid must be a UUID');
  if (!TILL_WRITEOFF_REASONS.includes(input.reasonCode)) {
    throw new BenchError('Причина списання має бути «завʼяв» або «віддали»');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const already = await findExistingWriteoff(client, input.storeId, clientUuid);
    if (already) {
      await client.query('COMMIT');
      return already;
    }

    // Locked before anything is decided: the same bouquet can be sold on
    // another till while this one is deciding it is dead, and the loser must
    // find no stock rather than write off a bouquet that left in a bag.
    const card = await client.query(
      `SELECT p.one_off, COALESCE(s.quantity, 0)::int AS quantity, p.name
       FROM pos_variants v
       JOIN pos_products p ON p.id = v.product_id
       LEFT JOIN pos_stock s ON s.variant_id = v.id AND s.store_id = v.store_id
       WHERE v.id = $1 AND v.store_id = $2
       FOR UPDATE OF v`,
      [input.variantId, input.storeId]
    );
    if (card.rows.length === 0) throw new BenchError('Букет не знайдено');
    if (!card.rows[0].one_off) {
      throw new BenchError('З каси можна списати лише букет із вітрини');
    }
    const quantity = Number(card.rows[0].quantity);
    if (quantity <= 0) throw new BenchError('Цього букета вже немає на вітрині');

    const docNumber = await nextWriteoffNumber(client, input.storeId);
    const doc = await client.query(
      `INSERT INTO pos_stock_documents
         (store_id, type, status, doc_number, occurred_at, reason_code, note, created_by,
          posted_by, posted_at, client_uuid)
       VALUES ($1, 'writeoff', 'posted', $2, NOW(), $3, $4, $5, $5, NOW(), $6)
       RETURNING id`,
      [
        input.storeId,
        docNumber,
        input.reasonCode,
        input.note?.trim() || `Вітрина: ${card.rows[0].name}`,
        input.staffId,
        clientUuid,
      ]
    );
    const documentId = Number(doc.rows[0].id);

    await client.query(
      `INSERT INTO pos_stock_document_lines (document_id, store_id, variant_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [documentId, input.storeId, input.variantId, quantity]
    );
    await applyStockDelta(client, {
      storeId: input.storeId,
      variantId: input.variantId,
      delta: -quantity,
      reason: 'writeoff',
      staffId: input.staffId,
      referenceType: 'stock_document',
      referenceId: documentId,
      note: input.note?.trim() ?? undefined,
    });

    await client.query('COMMIT');
    logger.info('POS bench: showcase bouquet written off', {
      storeId: input.storeId,
      variantId: input.variantId,
      reasonCode: input.reasonCode,
      docNumber,
    });
    return {
      variant_id: input.variantId,
      quantity,
      document_id: documentId,
      doc_number: docNumber,
      created: true,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
      const winner = await findExistingWriteoff(pool, input.storeId, clientUuid);
      if (winner) return winner;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function findExistingWriteoff(
  client: DbClient,
  storeId: number,
  clientUuid: string
): Promise<ShowcaseWriteoffResult | null> {
  const doc = await client.query(
    `SELECT d.id, d.doc_number, l.variant_id, l.quantity
     FROM pos_stock_documents d
     JOIN pos_stock_document_lines l ON l.document_id = d.id
     WHERE d.store_id = $1 AND d.client_uuid = $2
     ORDER BY l.id ASC
     LIMIT 1`,
    [storeId, clientUuid]
  );
  if (doc.rows.length === 0) return null;
  return {
    variant_id: Number(doc.rows[0].variant_id),
    quantity: Number(doc.rows[0].quantity),
    document_id: Number(doc.rows[0].id),
    doc_number: String(doc.rows[0].doc_number),
    created: false,
  };
}

/** The write-off counter — same shape as `nextProductionNumber` above. */
async function nextWriteoffNumber(client: DbClient, storeId: number): Promise<string> {
  const year = new Date().getFullYear();
  const counterKey = `writeoff_${year}`;
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
  return `СП-${year}-${String(Number(result.rows[0].seq)).padStart(5, '0')}`;
}

/**
 * Attach a photo to a bouquet already standing in the window.
 *
 * The main path puts the picture on at assembly time, while the bouquet is
 * still on the bench — but a florist who tied one in a hurry, or whose hands
 * were wet, comes back to it from the window list. Same narrowness as the
 * write-off: only a `one_off` card, so the till cannot repaint the catalogue.
 */
export async function setShowcasePhoto(params: {
  storeId: number;
  variantId: number;
  imageUrl: string;
}): Promise<{ variant_id: number; image_url: string }> {
  const imageUrl = String(params.imageUrl ?? '').trim();
  // Only a path this backend itself issued. Accepting an arbitrary string would
  // let a till point a catalogue card at any URL on the internet, which is a
  // stored-content hole dressed up as a convenience.
  if (!/^\/pos-uploads\/[A-Za-z0-9._-]+$/.test(imageUrl)) {
    throw new BenchError('Некоректне посилання на фото');
  }

  const updated = await pool.query(
    `UPDATE pos_products p
        SET image_url = $3, updated_at = NOW()
       FROM pos_variants v
      WHERE v.id = $2 AND v.product_id = p.id
        AND p.store_id = $1 AND p.one_off = TRUE
      RETURNING p.id`,
    [params.storeId, params.variantId, imageUrl]
  );
  if (updated.rows.length === 0) {
    throw new BenchError('Фото можна додати лише букету з вітрини');
  }
  return { variant_id: params.variantId, image_url: imageUrl };
}
