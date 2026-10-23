# Internal inventory for the grocery vertical (Explore agent, 2026-10-22)

## Integer quantities (main blocker)
- INTEGER columns: pos_stock.quantity (002:119; ≥0 CHECK dropped 010:21), pos_stock_movements.delta (002:132), pos_sale_items.quantity/refunded_quantity (002:176,179), pos_refund_items.quantity (002:218), pos_stock_document_lines quantity/system_qty/counted_qty (006:70-73), components 037:43, 037:81, 045:50, 052:269; parked items 042:89, reservations 042:109, preorder items 043:98, modifier component 046:61, bill items 052:226, guest order items 058:71, pack_qty 054.
- Rule written in comments: 035:135-136, 037:59-60 ("quantity stays INTEGER counted in this unit").
- View pos_stock_reserved uses SUM(r.quantity)::int (042:124-131); ~15 ::int casts in services (sales.service.ts:1683, analytics.service.ts:115, products.service.ts:226).
- Fiscal: MILLI_PER_UNIT=1000, quantityMilli = quantity*1000 (src/pos/fiscal/mapping.ts:22-23,117,200); src/pos/fiscal/types.ts:218-226 says weighted goods need a schema change; Checkbox mapLine derives discount = unitPrice × qtyMilli/1000 − lineTotal, assumes exact integer (payload.ts:28-29,49-71).
- Rust: ReceiptItem.quantity: i64, no unit field, printed "  {qty} x {price}" (pos/src-tauri/src/hardware/receipt.rs:15-25,284-290); precheck.rs:42, kitchen_ticket.rs:31 also i64.
- Cart useCartStore (pos/src/hooks/useCart.ts): addItem(item, qty=1) merges, caps at stock, refuses stock ≤ 0 (221-225, 256, 277); setQty (327-339) only from −/+ buttons (SaleSidebar.tsx:243-259, MobileCartSheet.tsx:164-173). No typed quantity.
- Integer validators: parked-carts.service.ts:167, preorders.service.ts:161, bench.service.ts:110, composites.service.ts:206,873, guest-orders.service.ts:202, stock-documents.service.ts:1475; UI «склад рахується цілими» ManageStockModal.tsx:74-76, StockActionPage.tsx:546-557, receiveMatrix.ts:138. Checkout no explicit check (sales.service.ts:358); INTEGER column rejects.
- Unit stored (pos_sale_items.unit 035:121, CartLine.unit pos/src/types.ts:1041) but never printed: receipt payload drops it (pos/src/lib/receipt.ts:193-200; ReceiptPrintable.tsx:84), cart caption none (SaleSidebar.tsx:201), fiscal name = product + label (mapping.ts:72-76); only next to stock in VariantPicker.tsx:112,229.
- Units: clothing ['шт'] (clothing.ts:39), flowers ['шт'] (flowers.ts:45), cafe ['шт','г','мл'] (cafe.ts:33); normalizeUnit (attributes.ts:87-96). No 'кг'/'л'.
- Café г/мл = non-sellable ingredients with cost per g/ml (048:176-196, beans 60 коп/г). price_cents INTEGER per base unit (002:97) → per-gram price moves in 10 ₴/кг steps; water rounded 0.58 → 1 коп/мл (POS_VERTICALS.md:944-953). No per-kg/per-100 g price anywhere. pack_qty only a receiving typing aid (pos/src/lib/pack.ts).

## Barcodes
- buildInternalBarcode (src/pos/gtin/internal-code.ts:17,31-41): '29' + 10-digit counter from global pos_internal_barcode_seq (023); generateInternalBarcode (products.service.ts:877-893); autoBarcode (330). Comment 10-15 deliberately avoids 20–24 because retail scales use them.
- SECOND generator: internalBarcodeFor(variantId) = '2' + id padded to 11 (src/pos/core/internalBarcode.ts:29,32,62-70), used for showcase bouquets (bench.service.ts:249) → in practice 20… codes = inside the weighed-goods range. Client isInternalBarcode knows only '29' (pos/src/lib/internalBarcode.ts:18-22).
- Lookup exact match only: server v.barcode = $n (products.service.ts:953-955); offline filterCatalog === (catalog-filter.ts:52-54); lookupBarcode (useSalesCatalog.ts:160-163).
- Unknown code at till: banner «Штрихкод не знайдено» only (ClothingCatalog.tsx:55, FlowersCatalog.tsx:101, CafeCatalog.tsx:102).
- GTIN enrichment only in the receiving form for new items (StockActionPage.tsx:300-366, skips internal at 335): cache → Open Food/Products/Beauty Facts (gtin/open-facts.ts, lib/gtinLookup.ts:31) → paid providers. pos_gtin_cache (gtin VARCHAR(14) PK, name, brand, image_url, best_source; 008); per-store gtin_lookup_enabled. Routes /gtin/:code, /gtin/ingest, /gtin/lookup/quota-providers, /gtin/learn/* (routes/gtin.routes.ts).
- scanDetector.ts: 60 ms gap, min length 4 (37,41), physical key; ScanWedge window keydown (ScanWedge.tsx:87); camera via html5-qrcode.
- NO parsing of 20–29 price/weight-embedded barcodes anywhere.

## Price tags
- PriceTag: store, name, variant label, price, compare-at, sku, EAN-13, copies (pos/src/lib/priceTag.ts:20-35). Prints `{money} ₴` with no unit (PriceTagsPrintable.tsx:207-220). No per-kg/l unit price, no expiry/packing date. Non-'шт' items default to 1 copy (priceTag.ts:68-70). Media roll/labels 40×25…70×40 + rotation (priceTagMedia.ts:42,66), layout priceLabelLayout.ts. HTML through OS only; no ESC/POS tag renderer (priceTag.ts:13).

## Hardware
- Tauri commands (pos/src-tauri/src/lib.rs:30-41): list_hardware, list_printers, print_receipt, print_kitchen_ticket, print_precheck, check/install_update, sync/prune_module_remotes, print_webview. Pinned in EXPECTED_COMMANDS (pos/scripts/check-tauri-capabilities.mjs:38-49); checklist POS_MODULE_TAURI_CAPABILITIES.md:153-166.
- ESC/POS via escpos FileDriver → raw job via printers crate (receipt.rs:192-202,443-455).
- Cargo.toml: hidapi 2, escpos 0.19, printers 2.3; NO serialport crate. hidapi only lists USB HID devices (hardware/mod.rs); catalog.rs knows one scanner.
- capabilities/default.json: only opener:allow-open-url (GitHub releases).
- No scale/serial/WebSerial/WebHID code anywhere.

## Stock
- Suppliers: name, phone, note, is_active (006:7-16); no invoice number, payment status, supplier debt (POS_CLOTHING.md:570, backlog S3).
- Document types CHECK: receipt, writeoff, adjustment, inventory, production (038:17-20); movement reasons CHECK 006:97-100; production records movements as writeoff/receipt (composites.service.ts:893,906).
- NO expiry/batch/lot/best-before anywhere.
- Markdowns 063: percent, rounding 1/100/1000, ends_on DATE + hourly cron, per-variant before/after; per variant not per batch.
- Low stock: listLowStock(threshold = 3) fixed (stock.service.ts:211-231; admin/attention.ts:114).
- Stocktake: offline count sheets → draft inventory doc; inputMode numeric (CountSheetPage.tsx:232).
- Write-off reasons: generic (verticals/types.ts:67-72); café adds spoiled/tasting/staff (cafe.ts:41-49); enforced stock-documents.service.ts:299-303; reason_code no DB CHECK.

## Customers & payments
- pos_customers: name, phone (unique per store), email, children_birthdays (005:8-16), client_uuid (010), discount_percent 0..100 (061). NO balance/debt/credit/bonus.
- Payment methods CHECK cash/card/qr (011:22-24; refunds 014); TS PaymentMethod src/pos/types.ts:42, pos/src/types.ts:7; server sales.service.ts:383-388.
- Split payments: a sale can carry several payments; checkout 'mixed' = cash+card (CheckoutModal.tsx:44,165-166,186); bills split (bill-payment.service.ts). No advance for pre-orders (043:24-29).

## Fiscal
- pos_products.fiscal_tax_code / fiscal_uktzed (024:164-170 "reserved, unused — required only for excise goods"); loaded fiscal.service.ts:672-687, sent payload.ts:63,67; NOT editable via any API/UI.
- Paper receipt prints the store's default VAT letter on every line (receipt.ts:59-83; POS_FISCAL_OFFLINE.md:901-902).
- Excise stamps: none. Checkbox API has `excise_barcodes`; our CheckboxGoodPayload lacks it (client.ts:114-121).
- Cash rounding to 10 коп: none; receipt line 23 «заокруглення» listed missing (POS_FISCAL_OFFLINE.md:904,1234).
- Discounts: markdown lowers unit_price_cents; cart discount spread across lines, last takes remainder (sales.service.ts:63-111); Checkbox discounts[{VALUE}] per line; assertLinesMatchTotal (mapping.ts:263-274).

## Till UI
- ClothingCatalog = built-in fallback for every vertical (tag bar, folders, ProductTile, VariantPicker, ScanWedge, camera).
- Florist QuantityPad 1-9/C/0/⌫ integers only (bench/QuantityPad.tsx:35). Cash pad padInput accepts comma + 2 decimals (lib/cash.ts:42) — closest reusable for typing a weight/price.
- Quick keys: only tags pinned to catalog bar (show_in_catalog_bar 004:8) + folders. No favourites/PLU.
- Open price refused by design: client never sends a price (sales.service.ts:240-249, RegisterPage.tsx:428-430, POS_FLORIST_BENCH.md:273-275). 007 placeholders = receiving lines for unknown products (+needs_review), not till lines. One-off product (041) + showcase flow = only "item with its own label".

## Offline desktop
- Dexie: meta, staffUnlock, catalog (variant_id/product_id/barcode), customers, outbox (sale|customer), sales (offline/db.ts:176-198); stocktake own DB.
- Snapshot full catalog incl. non-sellable + tags + customers; stale after 2 min (repository.ts:85-119).
- Offline sale total = unit*quantity (repository.ts:326), local stock deltas (430-453).
- Fractions would touch: line/outbox/local-sale shapes, local rounding rule, refundLineAmount (sales.service.ts:124-133), PLATFORM_VERSION bump (=18, platform/version.ts:120).

## Site & docs
- VERTICALS: clothing, flowers, cafe, restaurant (site/src/lib/productFacts.ts:443,468-531).
- ROADMAP `scales` under CAFE: «Салат-бар і випічка на вагу: підключені ваги, дробова кількість, ціна за 100 г», 10 % (627-632); loyalty points 20 % (543); pre-order advance 30 % (585); price tags with QR 10 % (571).
- SITE_PROMISES.md:28 same scales promise «(quantity — цілі одиниці)»; :16 loyalty. Nothing on продукти/борг/alcohol/expiry.
- TechDocs: POS_VERTICALS.md:96-99 INTEGER deliberate, NUMERIC future; POS_CAFE.md:324-332 §9.3; POS_CAFE.md:579-580 weighed + NUMERIC excluded; POS_CLOTHING.md:570 no supplier debt; POS_CLOTHING.md:695 + pos/UI_CASHIER.md:326,483 weighed items get one tag; prro/POS_FISCAL_PRRO.md:237-238 УКТЗЕД reserved for future excise store; prro/POS_FISCAL_OFFLINE.md:1197 excise/УКТЗЕД receipt lines never checked vs regulation; prro/dps/document-structures.md:35,65-67 excise tax type, wine example; prro/dps/polozhennya-13.md:299,667 excise stamp on receipt. «термін придатності», «grocery»: no hits.

## Demo pattern
- Demo data in migrations, pos_demo_seed stamps (039:66-78): 039 flowers, 048 café, 053 restaurant, 055 clothing, 067 Sun City (generated by scripts/demo-suncity/gen-migration.mjs), 069 cash-demo-* (once). Picture generators scripts/gen-demo-*.mjs.
- Vertical: pos_stores.vertical TEXT no CHECK (034); super PATCH /super/stores/:id {vertical, module_remotes} (super.routes.ts:53-62); setStoreVertical relabels (super.service.ts:124-143); UI pos/src/super/StoreEditor.tsx; checklist POS_VERTICALS.md:110-123.

## Hard constraints
1. INTEGER quantities in ~18 columns + ::int view/casts + Number.isInteger checks; runner re-applies every boot → guarded type change; pos_stock_reserved must be dropped/recreated.
2. Fiscal ×1000 + derived discount assume whole units (payload.ts:49-56, types.ts:224) → rounding rule must match Checkbox line sum.
3. Price = integer kopecks per base unit (002:97) → no per-kg/100 g price; per-gram moves in 10 ₴/кг steps.
4. Barcode lookup exact match, no 2x parsing (products.service.ts:953-955, catalog-filter.ts:52-54); bench '2'+id codes already produce 20… colliding with scale labels (core/internalBarcode.ts:32).
5. Cart +/− only, refuses zero stock (useCart.ts:221-225,331) while server allows negative stock on sale (stock.service.ts:73-75).
6. Unit nowhere on receipt/fiscal name/Rust i64 (receipt.rs:18,287).
7. No scale/serial (no serialport crate, no WebSerial); new Tauri command → EXPECTED_COMMANDS.
8. Per-product VAT/УКТЗЕД not editable; one VAT letter for all lines; no excise stamps (client.ts:114-121).
9. No customer balance/debt; payment method CHECK cash/card/qr (011:22-24); no advances.
10. No expiry/batch; low-stock threshold fixed 3 (stock.service.ts:211).
