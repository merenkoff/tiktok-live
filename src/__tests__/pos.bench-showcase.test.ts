// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import type { FastifyInstance } from 'fastify';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { assembleForShowcase, setShowcasePhoto, writeOffShowcase } from '../pos/bench.service.js';
import { completeSale } from '../pos/sales.service.js';
import { createProduct, getCatalog } from '../pos/products.service.js';
import { reverseDocument } from '../pos/stock-documents.service.js';
import { listOnHand } from '../pos/stock-reports.service.js';
import { internalBarcodeFor, isInternalBarcode } from '../pos/core/internalBarcode.js';

/**
 * A bouquet assembled for the window (`TechDocs/POS_FLORIST_BENCH.md` §11).
 *
 * The whole feature is stock arithmetic wearing a catalogue card, so these run
 * against the real schema. What has to hold: the stems leave the shelf once,
 * selling the bouquet does NOT take them again, and reversing the production
 * returns exactly the stems that went in.
 */
describe.skipIf(!hasDb)('POS florist bench — assembling for the showcase', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let storeId = 0;
  let staffId = 0;
  let roseId = 0;
  let eucalyptusId = 0;
  let wrapId = 0;

  async function stockOf(variantId: number): Promise<number> {
    const result = await pool.query(
      `SELECT quantity FROM pos_stock WHERE variant_id = $1 AND store_id = $2`,
      [variantId, storeId]
    );
    return Number(result.rows[0].quantity);
  }

  const bouquet = () => [
    { component_variant_id: roseId, quantity: 9 },
    { component_variant_id: eucalyptusId, quantity: 3 },
  ];

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('bench');
    storeId = store.storeId;
    staffId = store.ownerId;
    // 25%, the trade's usual assembly charge and what the demo shop carries.
    await pool.query(`UPDATE pos_stores SET florist_labour_bps = 2500 WHERE id = $1`, [storeId]);
    roseId = (await seedProduct(storeId, { name: 'Троянда', priceCents: 9000, quantity: 90 }))
      .variantId;
    eucalyptusId = (
      await seedProduct(storeId, { name: 'Евкаліпт', priceCents: 5500, quantity: 100 })
    ).variantId;
    wrapId = (await seedProduct(storeId, { name: 'Крафт', priceCents: 4000, quantity: 50 }))
      .variantId;
  }, 60000);

  // Every test assembles real bouquets out of the same fridge, so without this
  // the later ones run out of roses and fail for a reason that is not theirs.
  beforeEach(async () => {
    await pool.query(
      `UPDATE pos_stock SET quantity = CASE variant_id
         WHEN $2 THEN 90 WHEN $3 THEN 100 ELSE 50 END
       WHERE store_id = $1 AND variant_id = ANY($4::bigint[])`,
      [storeId, roseId, eucalyptusId, [roseId, eucalyptusId, wrapId]]
    );
  });

  afterAll(async () => {
    await app.close();
    await dropTestStore(storeId);
    await pool.end();
  });

  it('takes the stems off the shelf and puts one bouquet on it', async () => {
    const roses = await stockOf(roseId);
    const greens = await stockOf(eucalyptusId);

    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: bouquet(),
    });

    expect(made.created).toBe(true);
    expect(await stockOf(roseId)).toBe(roses - 9);
    expect(await stockOf(eucalyptusId)).toBe(greens - 3);
    expect(await stockOf(made.variant_id)).toBe(1);
    expect(made.doc_number).toMatch(/^ВР-\d{4}-\d{5}$/);
  });

  it('prices it with the assembly charge, exactly once', async () => {
    // 9 × 90 + 3 × 55 = 975; +25% = 1218.75. Getting 1524 here would mean the
    // labour was applied twice — `priceOfComposition` already adds it.
    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: bouquet(),
    });

    expect(made.price_cents).toBe(121875);
  });

  it('records what the bouquet cost the shop, not what it sells for', async () => {
    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: [{ component_variant_id: roseId, quantity: 5 }],
    });

    const variant = await pool.query(`SELECT cost_cents FROM pos_variants WHERE id = $1`, [
      made.variant_id,
    ]);
    // `seedProduct` leaves cost at 0, so the assembled cost is 0 too — the
    // point is that it is the SUM OF THE COMPONENTS' cost and never the price.
    expect(Number(variant.rows[0].cost_cents)).toBe(made.cost_cents);
    expect(made.cost_cents).not.toBe(made.price_cents);
  });

  it('takes the price the florist rounded to, when one is given', async () => {
    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: bouquet(),
      priceCents: 130000,
    });

    expect(made.price_cents).toBe(130000);
  });

  it('is one card for one object: a second bouquet is a second card', async () => {
    const first = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: bouquet(),
    });
    const second = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: [{ component_variant_id: roseId, quantity: 3 }],
      priceCents: 50000,
    });

    expect(second.variant_id).not.toBe(first.variant_id);
    expect(second.product_id).not.toBe(first.product_id);
    expect(second.price_cents).not.toBe(first.price_cents);
  });

  it('marks the card one_off and tags it for the till', async () => {
    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: bouquet(),
    });

    const product = await pool.query(
      `SELECT p.one_off, p.kind, p.stock_mode,
              (SELECT t.name FROM pos_product_tags pt
                 JOIN pos_tags t ON t.id = pt.tag_id
                WHERE pt.product_id = p.id LIMIT 1) AS tag
       FROM pos_products p WHERE p.id = $1`,
      [made.product_id]
    );
    expect(product.rows[0]).toMatchObject({
      one_off: true,
      kind: 'composite',
      stock_mode: 'own',
      tag: 'Вітрина',
    });
  });

  it('gives it a scannable internal barcode derived from its own id', async () => {
    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: bouquet(),
    });

    expect(made.barcode).toBe(internalBarcodeFor(made.variant_id));
    expect(isInternalBarcode(made.barcode)).toBe(true);
    expect(made.barcode).toHaveLength(13);
    // GS1 restricted circulation: a code that can never collide with a
    // manufacturer's article number.
    expect(made.barcode.startsWith('2')).toBe(true);
  });

  it('a retry of the same client_uuid returns the first bouquet, not a second one', async () => {
    const clientUuid = randomUUID();
    const roses = await stockOf(roseId);

    const first = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid,
      components: bouquet(),
    });
    const retry = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid,
      components: bouquet(),
    });

    expect(retry.created).toBe(false);
    expect(retry.variant_id).toBe(first.variant_id);
    expect(retry.doc_number).toBe(first.doc_number);
    // …and above all, the stems were taken once.
    expect(await stockOf(roseId)).toBe(roses - 9);
  });

  it('selling it does NOT take the stems again — production already did', async () => {
    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: bouquet(),
    });
    const roses = await stockOf(roseId);
    const greens = await stockOf(eucalyptusId);

    await completeSale({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      items: [{ variant_id: made.variant_id, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: made.price_cents }],
    });

    expect(await stockOf(made.variant_id)).toBe(0);
    expect(await stockOf(roseId)).toBe(roses);
    expect(await stockOf(eucalyptusId)).toBe(greens);
  });

  it('reversing the production gives back exactly the stems that went in', async () => {
    const roses = await stockOf(roseId);
    const greens = await stockOf(eucalyptusId);
    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: bouquet(),
    });

    await reverseDocument({ storeId, documentId: made.document_id, staffId });

    expect(await stockOf(roseId)).toBe(roses);
    expect(await stockOf(eucalyptusId)).toBe(greens);
    expect(await stockOf(made.variant_id)).toBe(0);
  });

  it('refuses to reverse once the bouquet has been sold', async () => {
    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: bouquet(),
    });
    await completeSale({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      items: [{ variant_id: made.variant_id, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: made.price_cents }],
    });

    await expect(
      reverseDocument({ storeId, documentId: made.document_id, staffId })
    ).rejects.toThrow();
  });

  it('refuses a bouquet the fridge cannot cover', async () => {
    await expect(
      assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: [{ component_variant_id: roseId, quantity: 100000 }],
      })
    ).rejects.toThrow();
  });

  it('refuses an empty bouquet, a repeated stem and a bad price', async () => {
    await expect(
      assembleForShowcase({ storeId, staffId, clientUuid: randomUUID(), components: [] })
    ).rejects.toThrow('Букет порожній');

    await expect(
      assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: [
          { component_variant_id: roseId, quantity: 3 },
          { component_variant_id: roseId, quantity: 2 },
        ],
      })
    ).rejects.toThrow(/повторюється/);

    await expect(
      assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
        priceCents: -1,
      })
    ).rejects.toThrow(/Ціна/);

    await expect(
      assembleForShowcase({ storeId, staffId, clientUuid: 'not-a-uuid', components: bouquet() })
    ).rejects.toThrow('client_uuid must be a UUID');
  });

  it('shows up on the till as a bouquet card with one in stock', async () => {
    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: [{ component_variant_id: roseId, quantity: 4 }],
    });

    const catalog = await getCatalog(storeId, {});
    const row = catalog.find((item) => item.variant_id === made.variant_id);
    expect(row).toMatchObject({ kind: 'composite', stock_mode: 'own', quantity: 1 });
    // `own`, so the till rings it like any other product — its recipe is not
    // the sale's business, and the stems are already gone.
    expect(row?.components).toHaveLength(1);
  });

  it('is counted on the stock report, unlike a derived bouquet', async () => {
    const made = await assembleForShowcase({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      components: [{ component_variant_id: wrapId, quantity: 2 }],
    });

    const onHand = await listOnHand(storeId, {});
    expect(onHand.some((row) => row.variant_id === made.variant_id)).toBe(true);
  });

  describe('POST /bench/showcase', () => {
    const url = '/api/pos/bench/showcase';

    it('is the florist\'s own work, so a seller may do it', async () => {
      // The owner is not standing at the bench. This is the same call the
      // `/stock/counts` sheet makes — staff level, gated by the `stock` module.
      const res = await app.inject({
        method: 'POST',
        url,
        headers: auth(store.sellerToken),
        payload: { client_uuid: randomUUID(), components: bouquet() },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ created: true, price_cents: 121875 });
    });

    it('answers 200 with the same bouquet on a retry', async () => {
      const clientUuid = randomUUID();
      const payload = { client_uuid: clientUuid, components: bouquet() };

      const first = await app.inject({
        method: 'POST',
        url,
        headers: auth(store.sellerToken),
        payload,
      });
      const second = await app.inject({
        method: 'POST',
        url,
        headers: auth(store.sellerToken),
        payload,
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(200);
      expect(second.json().variant_id).toBe(first.json().variant_id);
    });

    it('needs a session', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        payload: { client_uuid: randomUUID(), components: bouquet() },
      });
      expect(res.statusCode).toBe(401);
    });

    it('reports a refusal as text the florist can act on', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: auth(store.sellerToken),
        payload: { client_uuid: randomUUID(), components: [] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Букет порожній');
    });
  });

  describe('writing off a bouquet that did not sell', () => {
    it('takes the bouquet, and never gives the stems back', async () => {
      // The whole point. Production took the stems days ago; crediting them
      // here would invent flowers that are in the bin.
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
      });
      const roses = await stockOf(roseId);
      const greens = await stockOf(eucalyptusId);

      const off = await writeOffShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        variantId: made.variant_id,
        reasonCode: 'damaged',
      });

      expect(off.created).toBe(true);
      expect(off.quantity).toBe(1);
      expect(off.doc_number).toMatch(/^СП-\d{4}-\d{5}$/);
      expect(await stockOf(made.variant_id)).toBe(0);
      expect(await stockOf(roseId)).toBe(roses);
      expect(await stockOf(eucalyptusId)).toBe(greens);
    });

    it('records the reason, so a gift and a loss are not the same number', async () => {
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
      });
      const off = await writeOffShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        variantId: made.variant_id,
        reasonCode: 'gift',
        note: 'Віддали сусідці',
      });

      const doc = await pool.query(
        `SELECT type, status, reason_code, note FROM pos_stock_documents WHERE id = $1`,
        [off.document_id]
      );
      expect(doc.rows[0]).toMatchObject({
        type: 'writeoff',
        status: 'posted',
        reason_code: 'gift',
        note: 'Віддали сусідці',
      });
    });

    it('refuses a catalogue bouquet — the till may only write off the window', async () => {
      // «Ніжність» is also composite+own, but it is a product line assembled in
      // batches. Letting a mis-tap at the till write one off would be the same
      // button emptying a stem line.
      const product = await createProduct(storeId, {
        name: 'Букет «Ніжність»',
        kind: 'composite',
        stock_mode: 'own',
        variants: [
          {
            attributes: {},
            price_cents: 90000,
            quantity: 0,
            components: [{ component_variant_id: roseId, quantity: 9 }],
          },
        ],
      });
      const variantId = (product!.variants[0] as { id: number }).id;
      await pool.query(
        `UPDATE pos_stock SET quantity = 3 WHERE variant_id = $1 AND store_id = $2`,
        [variantId, storeId]
      );

      await expect(
        writeOffShowcase({
          storeId,
          staffId,
          clientUuid: randomUUID(),
          variantId,
          reasonCode: 'damaged',
        })
      ).rejects.toThrow(/лише букет із вітрини/);
      expect(await stockOf(variantId)).toBe(3);
    });

    it('refuses a bouquet that already left', async () => {
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
      });
      await completeSale({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        items: [{ variant_id: made.variant_id, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: made.price_cents }],
      });

      await expect(
        writeOffShowcase({
          storeId,
          staffId,
          clientUuid: randomUUID(),
          variantId: made.variant_id,
          reasonCode: 'damaged',
        })
      ).rejects.toThrow(/вже немає на вітрині/);
    });

    it('refuses a reason the till has no business sending', async () => {
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
      });
      await expect(
        writeOffShowcase({
          storeId,
          staffId,
          clientUuid: randomUUID(),
          variantId: made.variant_id,
          // `lost` is a stock-taking word; a florist at the counter is saying
          // either "it wilted" or "we gave it away".
          reasonCode: 'lost',
          })
      ).rejects.toThrow(/Причина списання/);
      expect(await stockOf(made.variant_id)).toBe(1);
    });

    it('a retry writes it off once', async () => {
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
      });
      const clientUuid = randomUUID();
      const first = await writeOffShowcase({
        storeId,
        staffId,
        clientUuid,
        variantId: made.variant_id,
        reasonCode: 'damaged',
      });
      const retry = await writeOffShowcase({
        storeId,
        staffId,
        clientUuid,
        variantId: made.variant_id,
        reasonCode: 'damaged',
      });

      expect(retry.created).toBe(false);
      expect(retry.document_id).toBe(first.document_id);
      expect(await stockOf(made.variant_id)).toBe(0);
    });

    it('is staff-level over the wire, and refuses a catalogue card there too', async () => {
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
      });

      const ok = await app.inject({
        method: 'POST',
        url: '/api/pos/bench/writeoff',
        headers: auth(store.sellerToken),
        payload: {
          client_uuid: randomUUID(),
          variant_id: made.variant_id,
          reason_code: 'damaged',
        },
      });
      expect(ok.statusCode).toBe(201);

      const stem = await app.inject({
        method: 'POST',
        url: '/api/pos/bench/writeoff',
        headers: auth(store.sellerToken),
        payload: { client_uuid: randomUUID(), variant_id: roseId, reason_code: 'damaged' },
      });
      expect(stem.statusCode).toBe(400);
      expect(stem.json().error).toMatch(/лише букет із вітрини/);
    });
  });

  describe('the bouquet\'s photo', () => {
    async function imageOf(productId: number): Promise<string | null> {
      const row = await pool.query(`SELECT image_url FROM pos_products WHERE id = $1`, [productId]);
      return row.rows[0].image_url;
    }

    it('rides along when the photo was taken on the bench', async () => {
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
        imageUrl: '/pos-uploads/abc-123.jpg',
      });

      expect(await imageOf(made.product_id)).toBe('/pos-uploads/abc-123.jpg');
    });

    it('is optional — a bouquet still has its printed tag', async () => {
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
      });

      expect(await imageOf(made.product_id)).toBeNull();
    });

    it('can be added afterwards, from the window list', async () => {
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
      });

      await setShowcasePhoto({
        storeId,
        variantId: made.variant_id,
        imageUrl: '/pos-uploads/later.png',
      });

      expect(await imageOf(made.product_id)).toBe('/pos-uploads/later.png');
    });

    it('refuses a catalogue card — the till may not repaint the catalogue', async () => {
      const product = await createProduct(storeId, {
        name: 'Троянда в каталозі',
        variants: [{ attributes: {}, price_cents: 9000, quantity: 5 }],
      });
      const variantId = (product!.variants[0] as { id: number }).id;

      await expect(
        setShowcasePhoto({ storeId, variantId, imageUrl: '/pos-uploads/x.jpg' })
      ).rejects.toThrow(/лише букету з вітрини/);
      expect(await imageOf(product!.id)).toBeNull();
    });

    it('refuses a link this backend did not issue', async () => {
      // A till that could point a card at any URL on the internet is a
      // stored-content hole dressed up as a convenience.
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
      });

      for (const bad of [
        'https://evil.example/x.jpg',
        '/pos-uploads/../../etc/passwd',
        'javascript:alert(1)',
        '',
      ]) {
        await expect(
          setShowcasePhoto({ storeId, variantId: made.variant_id, imageUrl: bad })
        ).rejects.toThrow(/Некоректне посилання/);
      }
      expect(await imageOf(made.product_id)).toBeNull();
    });

    it('is staff-level over the wire, and still refuses a catalogue card', async () => {
      const made = await assembleForShowcase({
        storeId,
        staffId,
        clientUuid: randomUUID(),
        components: bouquet(),
      });

      const ok = await app.inject({
        method: 'POST',
        url: '/api/pos/bench/showcase/photo',
        headers: auth(store.sellerToken),
        payload: { variant_id: made.variant_id, image_url: '/pos-uploads/ok.webp' },
      });
      expect(ok.statusCode).toBe(200);
      expect(await imageOf(made.product_id)).toBe('/pos-uploads/ok.webp');

      const stem = await app.inject({
        method: 'POST',
        url: '/api/pos/bench/showcase/photo',
        headers: auth(store.sellerToken),
        payload: { variant_id: roseId, image_url: '/pos-uploads/ok.webp' },
      });
      expect(stem.statusCode).toBe(400);
    });

    it('needs a session to upload one at all', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/pos/bench/photo' });
      expect(res.statusCode).toBe(401);
    });
  });
});
