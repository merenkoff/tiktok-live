# Selling weighed and loose goods in small grocery shops: barcodes, label scales, checkout scales, legal metrology, PLU, camera recognition (technical reference for a Ukrainian POS)

Retrieved 2026-10-22. Tags on each finding: **[P]** primary source (the standard, law, spec, vendor's own doc or source code), **[S]** second-hand (integrator guide, forum, search-result snippet), **[V]** vendor marketing claim, **[C]** open-source code read directly, **[R]** this repository.
Process note: the session's shared web-search budget ran out part-way through. Everything after that point came from direct downloads of known primary URLs (GS1, USB-IF, OIML, zakon.rada.gov.ua, legislation.gov.uk, MDN browser-compat-data, crates.io, GitHub raw), and no search engine was used. The gaps listed under each question come largely from this limit.

## 1. GS1 restricted circulation numbers (RCN) for variable-measure items: what prefixes 20–29 mean, Ukrainian/European layouts, how a POS should parse them, collisions with the shop's own 29-codes, DataBar Expanded and Sunrise 2027

### Takeaway
Under GS1 rules, prefixes 02 and 20–29 are RCNs. They are not GTINs, and each GS1 Member Organisation defines their layout. GS1 Ukraine's published table makes **20–23 MO-assigned variable-measure codes** (item + optional verifier + 4/5-digit "any variable quantity"), **24–28 reserved** and **29 retailer-assigned in-store** (10 free digits). So the POS's own `29…` codes sit exactly in Ukraine's in-store range. The prefix-to-layout map for scale labels is still a per-store configuration, so it must be configurable, and the POS should try an exact barcode match before decoding an RCN. RCNs may only be carried in EAN/UPC and never in 2D symbols. The GS1 route to expiry/weight/price in a barcode, including Sunrise 2027 2D codes, needs a GTIN plus Application Identifiers, which is not realistic for in-store scale labels in a small shop.

### Cited Findings

#### GS1 General Specifications, Release 26.0 (ratified Jan 2026) — global rules [P]
Source for this block: [GS1 General Specifications R26.0 PDF](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf). Section numbers are in brackets.
- RCNs "SHALL NOT be used globally or in open environments". GS1 allocates them "either for internal use by companies or to GS1 Member Organisations for assignment based on business needs in their country (e.g., variable measure trade item identification, coupons)". They exist as RCN-8, RCN-12 and RCN-13 [1.2.2.2.1]. — [GS1 GenSpecs R26.0](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- "RCNs SHALL only be encoded in EAN-8, EAN-13, UPC-A, or UPC-E barcodes. RCNs SHALL NOT be encoded using any GS1 Application Identifiers." The note that follows says GS1 supports "an ambition to read 2D barcodes at retail points of sale around the world by the end of 2027. As RCNs cannot be encoded using GS1 Application Identifiers, they are not permitted for use in 2D barcodes", and that "for fresh food products, the use of GTIN is strongly recommended for both fixed weight and variable measure products" [1.2.2.2.1]. — [GS1 GenSpecs R26.0](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- Table 1-4 (GS1 Prefix ranges): `02` = "Used to issue Restricted Circulation Numbers within a geographic region (MO defined)". `04` = RCNs "within a company (GS1 user company defined)". `20 – 29` = "Used to issue Restricted Circulation Numbers within a geographic region (MO defined)". `952` = "Used for demonstrations and examples of the GS1 system". — [GS1 GenSpecs R26.0, Table 1-4](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- Fixed-measure RCNs [2.1.11]: "When assigned to company internal use, the structure and management of the numbers … are the responsibility of the user. Number changes and reuse of expired numbers must be managed by the user". MOs "may assign one or several of the GS1 Prefixes 02, 20 through 29" for fixed-measure RCN-13/RCN-12 within a region or company. — [GS1 GenSpecs R26.0 §2.1.11](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- Variable measure at retail POS [2.1.12]. There are two applications: (a) GTIN + attributes in **GS1 DataBar Expanded / Expanded Stacked** ("During a transition period, 2D barcodes may be applied in addition to the linear barcode"; GTINs SHALL be encoded with AI (01)); (b) RCN, which "SHALL be encoded in EAN/UPC barcodes". — [GS1 GenSpecs R26.0 §2.1.12](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- RCN variable measure [2.1.12.2]: items "sold in random quantity against a fixed price per unit quantity … either marked in the store by the retailer or are marked at the source by the supplier". MOs "SHOULD assign one or several of the GS1 Prefixes 02, 20 through 29" and "SHOULD make part of this capacity available to user companies for company internal applications". The fields "can be structured in a variety of ways to represent the product type, net weight, calculated price, or number of units", and "scanning equipment and applications can then be programmed to use the prefix as an instruction to decode the ensuing data fields". — [GS1 GenSpecs R26.0 §2.1.12.2](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- Table 2-29, recommended RCN-13 structures (each MO determines the exact structure): prefix `02`: `I I I I I V P P P P C` or `I I I I V P P P P P C`. Prefixes `20–29`: `I I I I I I P P P P C` or `I I I I I P P P P P C`. Here I = item reference, V = price check digit (§7.9), P = price in local currency, C = standard check digit. "The price field may contain zero, one, or two implied decimal places"; the decimal point is not encoded but must be printed in the human-readable text. — [GS1 GenSpecs R26.0 Table 2-29](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- "When the price (or weight) of an item is encoded using this element string, a price verifier digit or a measure verifier digit SHOULD be used." "The item measure may be weight only if local weights and measures regulations permit." "The barcode reader normally performs the price verifier digit and the measure verifier digit calculation. Failing this, the calculation must take place in the application software." A different format (or a separate prefix) is required for each position of the implied decimal point. — [GS1 GenSpecs R26.0 §2.1.12.2](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- Verifier-digit algorithm [7.9.2–7.9.4]. Weighting factors and their weighted-product tables, digit 0..9 → product:
  - **2-**: 0,2,4,6,8,9,1,3,5,7
  - **3**: 0,3,6,9,2,5,8,1,4,7
  - **5+**: 0,5,1,6,2,7,3,8,4,9
  - **5-**: 0,5,9,4,8,3,7,2,6,1
  - **4-digit field**: factors `2- 2- 3 5-`; sum the products, multiply by 3; the units digit is the verifier. Spec example: 2875 → 9.
  - **5-digit field**: factors `5+ 2- 5- 5+ 2-`; sum, subtract from the next multiple of 10, then find that value in the **5-** product row; the digit in that column is the verifier. Spec example: 14685 → 6.
  - I implemented both and reproduced the spec's examples exactly (2875→9, 14685→6).
  — [GS1 GenSpecs R26.0 §7.9.2–7.9.4](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- GTIN-based variable measure [2.1.12.1]. Three retailer processes are allowed: the customer bags and labels; staff label pre-packs; or the item is "weighed at POS to generate the price". Required attributes are one of AI (30), (31nn), (32nn), (35nn), (36nn). Carriers are DataBar Expanded / Expanded Stacked. A GTIN-13 is zero-filled to 14 digits after AI (01). — [GS1 GenSpecs R26.0 §2.1.12.1](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- AI formats: `310n` net weight in kg (variable measure), `N4+N6`, where n = number of implied decimals (so `3103` + `001234` = 1.234 kg). `392n` amount payable for a variable-measure item in a single monetary area, `N4+N..15` (variable length; `3922` = 2 decimals). `393n` = the same with an ISO currency code, `N4+N3+N..15`. `395n` amount payable per unit of measure, `N4+N6`. — [GS1 GenSpecs R26.0 §3.2, §3.6.8, §3.6.11](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- ASP 3 conformance table [8.4, Table 8-7]. **RCN path**: identifiers RCN-12/RCN-13, carriers **EAN-13, UPC-A** only, 2D marked "N/A". **GTIN path**: DataBar Expanded is mandatory. GS1 DataMatrix, Data Matrix (GS1 Digital Link URI) or QR Code (GS1 Digital Link URI) "may be used in addition" during the migration period, and become conformant on their own only "once POS system support … reaches pervasive adoption". — [GS1 GenSpecs R26.0 §8.4](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- Symbology identifiers the POS should ask the scanner to transmit [5.1.3]: `]E0` EAN-13/UPC-A/UPC-E (13 digits), `]E4` EAN-8, `]C1` GS1-128, `]e0` GS1 DataBar, `]d2` GS1 DataMatrix, `]Q3` GS1 QR, `]d1`/`]Q1` Data Matrix / QR carrying a GS1 Digital Link URI. DataBar Expanded carries at most 74 numeric / 41 alphabetic characters. In "GS1-128 emulation mode" a DataBar Expanded payload longer than 48 characters is sent as **two** `]C1` messages split at an element-string boundary. — [GS1 GenSpecs R26.0 §5.1.3, §5.5.4](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- Multiple barcodes on one item [4.15.1]: "All barcode scanning systems SHALL deploy symbology identifiers". When several GS1 barcodes are on one entity, "The system SHALL only process one set of the desired data", and it SHOULD produce one beep. — [GS1 GenSpecs R26.0 §4.15.1](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)

#### GS1 "Summary of GS1 Prefixes 20–29 by GS1 Member Organisation", Release 5.1.5 (draft, Mar 2026) [P]
- Intro: "13-digit numbers created using the GS1 prefix 02 and 20 through 29 are NOT GTINs and are not globally unique". "Individual GS1 Member Organisations remain the definitive source of any local solutions". Solutions "have traditionally been purely national (due to each country having a different currency)". — [GS1 Summary 20–29 R5.1.5](https://www.gs1.org/docs/barcodes/SummaryOfGS1MOPrefixes20-29.pdf)
- **GS1 Ukraine** (§2.77, p. 88). Legend: R retailer-assigned, I MO-assigned, V verifier digit, Q any variable quantity, C check digit.

  | Prefix | Positions 3–12 | Note |
  |---|---|---|
  | 02 | R R R R R R R R R R | retailer |
  | 20 | I I I I I V Q Q Q Q | MO item(5) + verifier + Q(4) |
  | 21 | I I I I V Q Q Q Q Q | MO item(4) + verifier + Q(5) |
  | 22 | I I I I I I Q Q Q Q | MO item(6) + Q(4), no verifier |
  | 23 | I I I I I Q Q Q Q Q | MO item(5) + Q(5), no verifier |
  | 24–28 | — | reserved |
  | 29 | R R R R R R R R R R | retailer (in-store) |

  "Q = Any Variable Quantity. Actual coefficient value and unit of measure are available in the national electronic catalogue of 'branded' Variable Measure retail items maintained by GS1 Ukraine (http://catalog.gs1ua.org/)." "There is no specific national solution for Loose Produce Coding." Coupons: `99 1 I I I I I I I I I C`. — [GS1 Summary 20–29 R5.1.5, §2.77](https://www.gs1.org/docs/barcodes/SummaryOfGS1MOPrefixes20-29.pdf)
- European neighbours, same document (W weight, P price, N pieces):
  - **Poland**: 20 R/M free; 21 `IIIIVWWWWW`; 23 `IIIIVPPPPP`; 24 `R/M×4 V PPPPP`; 25 and 27 `IIIIV` + W/N×5; 26 `IIIIVPPPPP`; 29 `R/M×4 V` + W/N×5; 02, 22 and 28 reserved.
  - **Germany**: 20 free; 22 `RRRRVPPPPP` (EUR); 23 `IIIIVPPPPP`; 24 total department price; 25/26 pieces; 28 `RRRRVWWWWW` (kg, retailer); 29 `IIIIVWWWWW` (kg, national).
  - **Czech Republic**: 21 `RRRRVPPPPP` CZK; 28 `RRRRVWWWWW`; 29 `IIIIVWWWWW`.
  - **Slovakia**: 24 internal price in EUR; 25 national price in EUR; 27/29 national weight; 28 internal weight (all `xxxxV` + 5).
  - **Hungary**: 21–24 `RRRRVPPPPP`; 25 pieces; 28 `RRRRVWWWWW`.
  - **Austria**: 21 retailer weight; 22 retailer price; 23/27 GS1 Austria-managed; 28 pieces.
  - **Netherlands**: 21/22 `RRRRVPPPPP`; 23 national price; 28 wholesale weight.
  - **UK**: 20 and 28 `IIIMMVPPPP` (variable weight); the rest free.
  - **Lithuania**: 21 `RRRRRWWWWW`; 23/25/27 weight.
  - **Estonia**: 20–22 price; 23–25 and 27 weight.
  - **Moldova**: 02 and 20–25, 28, 29 all "In-store use"; 27 national.
  - **Romania**: 21 in-house variable measure (3 decimals); 25 meat/fish/cheese weight.
  - **Turkey**: 20–26 in-store; 28 `IIIIIWWWWW` weight.
  - **Belarus, Bulgaria**: "The way of structuring the data is up to each company".
  - **Georgia**: no national solution.
  — [GS1 Summary 20–29 R5.1.5](https://www.gs1.org/docs/barcodes/SummaryOfGS1MOPrefixes20-29.pdf)

#### How POS and ERP software actually configures it
- **Odoo 18 default nomenclature** [C]:
  - "Weight Barcodes 3 Decimals": `21.....{NNDDD}`, encoding `ean13`. The 5 digits after `21` are the product reference; then 2 integer and 3 decimal digits of weight; then the check digit.
  - "Price Barcodes 2 Decimals": `23.....{NNNDD}`.
  - "Discount Barcodes": `22{NN}`.
  - Cashier `041`, customer `042`.
  — [odoo 18.0 stock/default_barcode_patterns.xml](https://github.com/odoo/odoo/blob/18.0/addons/stock/data/default_barcode_patterns.xml); [odoo 18.0 point_of_sale/default_barcode_patterns.xml](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/data/default_barcode_patterns.xml)
- **1C front office with a CAS CL5000** (Rarus integration guide): the scale's barcode format is keyed in as `2,3,I,I,I,I,I,W,W,W,W,W,C` (letters are data fields, digits print literally). The POS's "Префикс штрих-кода весового товара" is set to `23`, and a weighed product's barcode is stored as `2330616` ("first two digits — the weighed-goods prefix, the next five — the item code"). [S] — [Rarus: Подключение и настройка весов CAS серии CL (PDF)](https://rarus.ru/downloads/2489/%D0%9F%D0%BE%D0%B4%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%B8%20%D0%BD%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0%20%D0%92%D0%B5%D1%81%D0%BE%D0%B2%20%20CAS%20%D1%81%D0%B5%D1%80%D0%B8%D0%B8%20CL.pdf)
- A Russian 1C-ecosystem article says the weighed-goods prefix is "usually 22 or 23", with a 5-digit code, a 5-digit weight and a check digit. It also mentions that a too-short PLU field made the POS read the wrong PLU. [S, search snippet only] — [Cleverence: учет весового товара в 1С](https://www.cleverence.ru/articles/rabota-v-1s/-kak-pravilno-vesti-uchet-vesovogo-tovara-v-1s/)
- Infostart forum: a POS recognises the weighed barcode by its prefix, zeroes the weight part (digits 8–12), recomputes the EAN-13 check digit and looks the product up. Atol/Frontol example: `23` + `00001` code + 5-digit weight + check digit. [S, search snippet] — [Infostart forum topic 219703](https://forum.infostart.ru/forum81/topic219703/)
- ITRetail (a US POS) tells users to confirm the format with the scale manufacturer for any scale other than the CAS 5500. Its "Keep check digits" setting changes whether variable-weight UPCs must start with `002`. [S, search snippet] — [ITRetail KB: variable weight labels](https://knowledge.itretail.com/article/variable-weight-labels)
- Python library *biip* (search snippet): it describes RCN-12 (prefix 2) and RCN-13 (02, 20–29) as having MO-defined regional semantics and cites GenSpecs §2.1.11–2.1.12. [S] — [biip RCN reference](https://biip.readthedocs.io/latest/reference/rcn/)

#### This repository's internal codes [R]
- `buildInternalBarcode` mints `29` + a 10-digit store counter + check digit, e.g. counter 42 → `2900000000421`. It is used when `VerticalDefinition.autoBarcode` is on (clothing). Its comment says scales "print `20`–`24` for price-embedded variable-weight items". — [src/pos/gtin/internal-code.ts](/home/user/tiktok-live/src/pos/gtin/internal-code.ts), [src/pos/products.service.ts](/home/user/tiktok-live/src/pos/products.service.ts)
- **A second, different scheme exists.** `internalBarcodeFor(variantId)` (used by the florist bench's showcase bouquets) mints a bare `2` + the variant id zero-padded to 11 digits + check digit. Variant 12345 → `2000000123455`, so every such code starts with **`20`** until variant ids reach 10¹⁰. Its `isInternalBarcode` accepts any `2…` code with a valid check digit. — [src/pos/core/internalBarcode.ts](/home/user/tiktok-live/src/pos/core/internalBarcode.ts), [src/pos/bench.service.ts](/home/user/tiktok-live/src/pos/bench.service.ts)
- No RCN or weight-barcode parsing exists yet. The café vertical already sells in `'шт', 'г', 'мл'`, with quantity stored as an integer in the base unit. — [src/pos/verticals/cafe.ts](/home/user/tiktok-live/src/pos/verticals/cafe.ts)

#### Worked examples (computed with the verified algorithms; EAN-13 check digits valid)
- `2200123012340`: prefix 22, PLU 00123, weight 01234 = 1.234 kg if the store defines 3 decimals (the layout is a store convention).
- `2300123045673`: prefix 23, PLU 00123, price 04567 = 45.67 UAH.
- GS1 Ukraine "20" layout: `20 00123 9 1234 9` → `2000123912349` (verifier 9 for Q=1234 via the 4-digit algorithm).
- GS1 Ukraine "21" layout: `21 0123 1 01234 8` → `2101231012348` (verifier 1 for Q=01234 via the 5-digit algorithm).
- GTIN variable-measure DataBar Expanded as transmitted, using GS1's example prefix 952: `]e0` `01 09521234543213` `3103 001234` `17 261031` `3922 4567`. That is GTIN, 1.234 kg, expiry 2026-10-31, 45.67 to pay. The variable-length 392n is placed last, so no FNC1/GS separator is needed. (Constructed per the AI definitions above.)

### Inferences
- **Ukrainian default to support:** "2x + 5-digit PLU + 5-digit weight, 3 implied decimals in kg + check digit" (e.g. prefixes 21/22/23), plus price-embedded "2x + 5 PLU + 5 price, 2 decimals". GS1 Ukraine formally reserves 20–23 for MO-assigned branded items and 24–28 as reserved, but integrator guides show shops simply configure 22/23 on their scales. A POS therefore needs a per-store table of `{prefix, itemDigits, verifier?: 4|5|none, valueDigits, kind: weight|price|count, decimals}` rather than a hard-coded rule. Supporting the four GS1 Ukraine layouts verbatim also covers branded factory-packed variable-measure goods. Their Q coefficient and unit come from catalog.gs1ua.org, which I could not read.
- **Parse order** (avoids every collision found):
  1. If the scanner sends an AIM symbology identifier and it is `]e0`/`]C1`/`]d2`/`]Q3`, parse GS1 AIs: (01) GTIN; (310n) weight → grams = value × 10^(3−n); (392n) price; (17) expiry; (10) batch. Sanitise the GS separators.
  2. A 13-digit code with a valid EAN-13 check: **exact match against stored barcodes first.** This covers supplier GTINs, the POS's `29…` codes and the bench's `20…` codes.
  3. Only then, if the first two digits match a configured RCN rule: split the fields, validate the verifier when the rule has one, look up the product by (rule, item reference), and convert the value to integer base units.
  4. Otherwise "unknown barcode".
- **Base units:** a 5-digit weight field with 3 decimals is already **integer grams** (max 99 999 g); a 4-digit field caps at 9.999 kg. A 5-digit price field with 2 decimals caps at **999.99 UAH**, which is a real overflow risk for meat or cheese pieces. With a price-embedded label the quantity has to be back-computed (price ÷ unit price) and is lossy. So **weight-embedded labels fit this backend better**: the line price is recomputed as `round(grams × kopecks_per_kg / 1000)`, and the rounding rule must match the scale's (see §4 on OIML 4.14.3).
- **Collision management:**
  - Keep all POS-minted fixed codes in `29` (GS1 Ukraine's retailer range). Never configure a scale with prefix 29. Pick scale prefixes from 20–28 per store and reject a scale rule whose prefix is 29.
  - Either move the bench's `2`+11-digit codes into the `29` counter, or make sure exact-match lookup always runs before RCN decoding. Otherwise a scale rule on prefix 20 reads `2000000123455` as "PLU 00000, 12.345 kg".
  - Also harmonise the two `isInternalBarcode` functions. One accepts `2…`, the other only `29…`.
- **Sunrise 2027 / Digital Link** matters for small shops only on the *reading* side: buy 2D-capable imagers, decode `]Q3`/`]d2`/`]Q1` GS1 data, and use AI (17) expiry to warn about expired goods. *Printing* 2D or DataBar on in-store scale labels requires GTINs (a GS1 company-prefix licence) and is not what small shops do.

### Gaps
- gs1ua.org returned HTTP 403, so GS1 Ukraine's own guide (meaning of V on 20/21, Q coefficients, whether in-store use of 20–28 is tolerated) was not read. catalog.gs1ua.org was not reached.
- I could not verify the factory default barcode formats of CAS/DIGI/Rongta/Aclas scales sold in Ukraine. The only concrete example is the Rarus/1C CAS guide's `23IIIIIWWWWWC`, and it is Russian-market material.
- The GS1 Sunrise 2027 global page and the "Fresh Foods Sold at POS Implementation Guideline" were not retrieved. The GS1 US Sunrise page gives no deadline wording beyond "it is not necessary to implement all the capabilities of 2D by that date" — [GS1 US Sunrise 2027](https://www.gs1us.org/industries-and-insights/by-topic/sunrise-2027).

## 2. Label-printing scales (CAS, DIGI, Mettler Toledo, Bizerba, Dibal, Aclas, Rongta): PLU upload methods, protocols/SDKs, how other POS vendors implement "upload goods to scales"

### Takeaway
I could verify only one vendor's integration surface. A **CAS CL5000** links over RS-232 (one scale per PC, slow) or TCP/IP on port **20304**, and its barcode layout is a template typed into the scale (`23IIIIIWWWWWC`). The POS-side "upload to scales" pattern is: a group of products bound to a scale, PLU number = row order, delta upload of changed items or a full reload, and the vendor tool (CL-Works) for checking. Protocols and SDKs for DIGI, Mettler, Bizerba, Dibal, Aclas and Rongta remain unverified in this session.

### Cited Findings
- **CAS CL5000 connectivity** (Rarus guide):
  - "RS-232" or "TCP/IP (Ethernet)". Over RS-232 "only one scale can exchange data with one computer" and the speed is "much lower". Several scales need a switch.
  - Network menu = MENU, 9. Scale status: 0 disabled, 1 master, 2 slave, 3 "network operation" (use 3). DHCP yes/no. IP, gateway, mask and TCP port: "in most cases the port should be «20304» and changing it is not recommended". A "remote device IP and port" can also be set.
  [S] — [Rarus CAS CL guide (PDF)](https://rarus.ru/downloads/2489/%D0%9F%D0%BE%D0%B4%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%B8%20%D0%BD%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0%20%D0%92%D0%B5%D1%81%D0%BE%D0%B2%20%20CAS%20%D1%81%D0%B5%D1%80%D0%B8%D0%B8%20CL.pdf)
- **CAS CL5000 barcode and label setup** (same guide):
  - MENU 2-6-1 defines a barcode: number (e.g. 1), name (e.g. "EAN13-1"), encoding type `1`, format variant `0`, and the field template `2,3,I,I,I,I,I,W,W,W,W,W,C`.
  - MENU 5-1 picks label formats for programmed items, unprogrammed items and the total label (e.g. label No. 6).
  - MENU 5-2 enables a "general barcode format" for all items and assigns barcode format No. 1 to programmed weighed items.
  [S] — [Rarus CAS CL guide (PDF)](https://rarus.ru/downloads/2489/%D0%9F%D0%BE%D0%B4%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%B8%20%D0%BD%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0%20%D0%92%D0%B5%D1%81%D0%BE%D0%B2%20%20CAS%20%D1%81%D0%B5%D1%80%D0%B8%D0%B8%20CL.pdf)
- **How one POS/ERP vendor uploads** (1C front office via Rarus):
  - Directory «Группы товаров оборудования» (equipment product groups), filled by hand or automatically.
  - Processing «Загрузка оборудования», which can upload to all scales using the group or to one.
  - «Загрузить измененные» uploads only items whose price or name changed, or that were added, since the last load. «Полная перезагрузка» reloads everything.
  - "The ordinal numbers of goods in the scale's memory will correspond to the numbers of goods in the group's list".
  - Use CAS **CL-Works** to confirm the goods arrived.
  - Factory hot-keys map to PLU 1 (top-left) … PLU 72 (bottom-right). The operator places the item, presses the key, then «ПЕЧ» to print.
  [S] — [Rarus CAS CL guide (PDF)](https://rarus.ru/downloads/2489/%D0%9F%D0%BE%D0%B4%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%B8%20%D0%BD%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0%20%D0%92%D0%B5%D1%81%D0%BE%D0%B2%20%20CAS%20%D1%81%D0%B5%D1%80%D0%B8%D0%B8%20CL.pdf)
- A CAS CL5500 spec sheet (search snippet) says the model supports multiple barcode formats and "uses the same menu code system as CL5000". [S] — [CL5500 spec sheet](https://argo.webstaurantstore.com/documents/specsheets/cl5500_spec_sheet.pdf)
- A CL5000 user manual (Rev 2006.03.13) exists, with PLU menu codes such as 1120 (edit PLU name) and 1150 per its table of contents. Only the TOC was indexed. [S, search snippet] — [CL-5000 users TOC](https://the-checkout-tech.com/manuals/TOC/scales/CAS/CL-5000%20users.TOC.pdf)
- Odoo, an open-source POS, does **not** implement label-scale uploads. Its IoT box only reads weight from checkout scales (Toledo 8217 and Adam drivers, see §3). [C] — [odoo 17.0 SerialScaleDriver.py](https://github.com/odoo/odoo/blob/17.0/addons/hw_drivers/iot_handlers/drivers/SerialScaleDriver.py)
- Tiliter's home page carries a Woolworths quote about "the implementation of new, digital scales", i.e. scale-side recognition at a large grocer. [V] — [tiliter.com](https://www.tiliter.com/)

### Inferences
- **A minimal "Ваги" module for the POS:**
  - Per scale: model, connection, IP:port, PLU-code length, barcode rule id.
  - Per product: `scale_plu` (1..99999 so it fits the 5-digit item field), name in the scale's length limit, price per kg in kopecks, shelf life (days), preset tare, label format number.
  - Change tracking for delta uploads, and an export (CSV/XLSX) for the vendor utility (CL-Works and equivalents) as the zero-protocol fallback.
  - Direct TCP upload in the Tauri/Rust process only after obtaining the vendor's protocol document. That document is not public in anything I found.
- Product lookup should use the stored `scale_plu`, not the label's row order. The Rarus note shows that order-based PLU numbering silently renumbers keys when the group list changes.
- The scale is the metrologically controlled device that prints price and weight (see §4). The POS only has to decode the label and trust it.

### Gaps
- Not verified: DIGI SM-120/SM-5300 (DIGI's PC tools or communication library), Mettler Toledo bPlus/Tiger, Bizerba, Dibal, Aclas LS2 (any "AclasLink"/SDK), Rongta RLS1000/1100 protocols, ports or SDKs. aclas.com returned 503. Search was unavailable.
- Ukrainian distributors and their software (e.g. the Ukrainian market's CAS/DIGI/Rongta importers) and current Ukrainian prices for label scales were not researched, again because search was unavailable.
- CAS's own CL5000 Ethernet protocol document (packet format on port 20304) was not found. CL-Works download is only referenced via cas.ru in the Rarus guide.

## 3. Checkout scales and scanner-scales: protocols (CAS, Mettler Toledo 8217/SICS, Datalogic, Zebra), USB HID POS scale (usage page 0x8D), stable/zero/tare/units, browser access (Web Serial, WebHID), Rust/Tauri access, prices

### Takeaway
There are three wire protocols worth implementing:
- **Mettler Toledo 8217**: 9600 7E1; `W` → `STX weight CR`; status byte bits.
- **ENQ/ACK/DC1**: 9600 8N1; `SOH STX 'S'|'U' sign 99.999 'kg' BCC ETX EOT`.
- **USB HID POS scale**: usage page 0x8D, report ID 3: status, unit, signed exponent, 16-bit weight.

In Chrome, Web Serial is available on desktop since 89 and on Android with USB since 148; WebHID on desktop only. The Tauri cashier should read scales in Rust (`serialport` 4.10.1, `hidapi` 2.6.7).

### Cited Findings
- **Mettler Toledo 8217 "weight-only" protocol** as implemented by Odoo (whose comment cites the scale's Service Manual and recommends the Ariva-S, which "supports this protocol on both the USB and RS232 ports … protocol option 3"):
  - Line settings: 9600 baud, **7 data bits, even parity, 1 stop**.
  - Commands: `W` weigh, `Z` zero, `T` tare, `C` clear tare, no terminator.
  - Weight reply matches `\x02\s*([0-9.]+)N?\r`. Status reply matches `\x02\s*(\?.)\r`, e.g. `b'\x02?D\r'`.
  - Probe: send `Ehello`, expect `\x02E\rhello`.
  - Status-byte bits, LSB first, parity bit ignored: 0 "Scale in motion", 1 "Over capacity", 2 "Under zero", 3 "Outside zero capture range", 4 "Center of zero", 5 "Net weight", 6 "Bad Command from host".
  - Odoo reports weight 0 when any listed bit is set.
  [C] — [odoo 17.0 SerialScaleDriver.py](https://github.com/odoo/odoo/blob/17.0/addons/hw_drivers/iot_handlers/drivers/SerialScaleDriver.py); [odoo saas-18.4 serial_scale_driver.py](https://github.com/odoo/odoo/blob/saas-18.4/addons/iot_drivers/iot_handlers/drivers/serial_scale_driver.py)
- **Adam Equipment** (Odoo): 4800 8N1, `P` request, CRLF terminator, reply regex `\s*([0-9.]+)kg`, `Z`/`T` commands. It answers nothing when the weight is unchanged, does not return 0 after unloading, and "beeps every time you ask for a weight that was previously returned". [C] — [odoo 17.0 SerialScaleDriver.py](https://github.com/odoo/odoo/blob/17.0/addons/hw_drivers/iot_handlers/drivers/SerialScaleDriver.py)
- **ENQ/ACK/DC1 "Transmission protocol standard"**, a 2-page document published by Novitus, a Polish ECR maker. I did not see the extracted text name the scale brand, so attributing it to CAS is unconfirmed.
  - Line settings: 9600, 8 data bits, 1 stop, no parity, ASCII.
  - Handshake: PC `ENQ`(05h) → scale `ACK`(06h), or `NAK`(15h) and the PC repeats.
  - PC `DC1`(11h) → `SOH`(01h) + weight frame + `EOT`(04h).
  - PC `DC2`(12h) → `SOH` + total-price frame + weight frame + unit-price frame + `EOT`.
  - Each frame is `STX`(02h) D1..Dn `BCC` `ETX`(03h), with BCC = XOR of D1..Dn.
  - Weight frame: D1 = `S` (stable for 500 ms) or `U` (unstable); D2 = space or `-`; D3..D8 = `C4 C3 . C2 C1 C0` ("99.999 kg"); D9–D10 = `kg`.
  - Price frames are 8 bytes (`C6..C2 . C1 C0`). Leading zeros are spaces. Overflow is all `F`.
  - Inter-byte gap is about 100 µs; the scale answers within about 10 ms.
  [P for the Novitus text] — [Novitus file 821 (PDF)](https://novitus.pl/file/get/821)
- **CAS PD-II**: a community TypeScript library (`@kortoaus/cas-scale`) is "Tested and confirmed to work with CAS PD-II in ECR-TYPE 2 (STX/ETX protocol mode) only".
  - Settings: 9600 / 7 data bits / even parity / 1 stop.
  - It sends `W` and "Parses 7-byte responses".
  - To set ECR type 2: power on holding ZERO+TARE, set `Ecr` = 2, long-press TARE to save.
  [S] — [npm @kortoaus/cas-scale](https://www.npmjs.com/package/@kortoaus/cas-scale)
- A SambaPOS forum post says CAS ER scales have 7 ECR modes (type 0–6) and that the ER "automatically streams weight data without the need of asking for it". [S, forum, search snippet] — [SambaPOS forum: Custom scale question](https://forum.sambapos.com/t/custom-scale-question/1848)
- A Ukrainian retail-software manual lists supported checkout scales as "в основному це Uniscale ВТА, CAS AP / AD" over USB/COM, with speed "для ваг це, як правило – 9600". [S, search snippet] — [arm20.com: підключення ваг через RS232/USB](https://arm20.com/manual_ua/arm/libra/pidkluchennia-vag-cherez-rs232com-usb/?pdf=502)
- **HID Usage Tables 1.5, Scales Page (0x8D)**:
  - `01` Scales.
  - `20` Scale Device.
  - `21` Scale Class (selectors `22`–`2A`: Class I/II/III/IIIL/IV Metric, III/IIIL/IV English, Generic).
  - Reports: `30` Attribute, `31` Control, `32` **Data**, `33` Status, `34` Weight Limit, `35` Statistics.
  - `40` Data Weight; `41` Data Scaling ("base ten exponent. Range is from 127 to -127").
  - `50` Weight Unit, with `51` mg, `52` g, `53` kg, `54` carats, `55` taels, `56` grains, `57` pennyweights, `58` metric ton, `59` avoir ton, `5A` troy ounce, `5B` ounce, `5C` pound.
  - `70` Scale Status, with `71` Fault, `72` Stable at Center of Zero, `73` In Motion, `74` Weight Stable, `75` Under Zero, `76` Over Weight Limit, `77` Requires Calibration, `78` Requires Rezeroing.
  - `80` Zero Scale; `81` Enforced Zero Return.
  [P] — [USB-IF HID Usage Tables 1.5 (PDF)](https://usb.org/sites/default/files/hut1_5.pdf)
- **HID POS Usage Tables 1.02 (2001), example scale descriptor and reports**:
  - **Report ID 3, Scale Data (input)**: byte 0 = 3; byte 1 = status; byte 2 = weight unit; byte 3 = data scaling; byte 4 = weight LSB; byte 5 = weight MSB.
  - In the descriptor, status is an array with logical min 1 over `Fault`…`Requires Re-zeroing`, so values are 1 = fault … 4 = weight stable … 8 = requires re-zeroing. Unit is an array from Milligram, so 1 = mg, 2 = g, 3 = kg … 12 = lb. Scaling is a signed 8-bit exponent; weight is 16 bits.
  - Report ID 2, Control (feature): bit EZR (enforced zero return) and bit ZS (zero scale request).
  - Report 1 = attributes (class, units); Report 4 = status; Report 5 = weight limit; Report 6 = statistics (calibration and re-zero counts).
  [P] — [USB-IF HID Point of Sale Usage Tables 1.02 (PDF)](https://www.usb.org/sites/default/files/pos1_02.pdf)
- **WebHID blocklist** blocks the FIDO page `0xF1D0` and the Generic Desktop collections Mouse (`0x01/0x02`), Keyboard (`0x01/0x06`), Keypad (`0x01/0x07`) and System Control (`0x01/0x80`), plus specific vendor rules. The Scales (0x8D) and Bar Code Scanner pages are **not** listed. [P] — [WICG webhid blocklist.txt](https://github.com/WICG/webhid/blob/main/blocklist.txt); [Chromium hid_blocklist.cc](https://github.com/chromium/chromium/blob/main/services/device/public/cpp/hid/hid_blocklist.cc)
- **Browser support** (MDN browser-compat-data, main branch, read 2026-10-22):
  - Web Serial (`navigator.serial`): Chrome desktop **89**. Chrome Android **148** (138–147 "partial: only … Bluetooth RFCOMM serial port emulation"). Firefox desktop **151**. Firefox Android no. Safari/iOS no. Android WebView no.
  - WebHID: Chrome desktop **89**. Chrome Android no. Firefox no. Safari no. Android WebView no. Dedicated-worker support since Chrome 131.
  [P] — [BCD api/Serial.json](https://github.com/mdn/browser-compat-data/blob/main/api/Serial.json); [BCD api/HID.json](https://github.com/mdn/browser-compat-data/blob/main/api/HID.json)
- Web Serial runs only in secure contexts (HTTPS), is available in dedicated workers, and is gated by the Permissions-Policy directive `serial`. `getPorts()` returns ports the site already has access to; `requestPort()` is called from a user activation (click). [P] — [MDN Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
- Chrome guide (dated 2020):
  - `requestPort()` opens a chooser and must be called "in response to a user gesture such as touch or mouse click". Filters are `usbVendorId`/`usbProductId`. `port.forget()` revokes access (Chrome 103+).
  - `open()` takes `baudRate` plus optional `dataBits` (7|8), `stopBits` (1|2), `parity` ("none"|"even"|"odd"), `bufferSize` (<16 MB) and `flowControl` ("none"|"hardware").
  - Reads come as `Uint8Array` chunks, so frame by STX/CR yourself. The doc shows a `LineBreakTransformer` example; BYOB readers are available from Chrome 106.
  - On Android the guide suggests a WebUSB polyfill, which works only for devices not claimed by a kernel driver.
  [P] — [Chrome: Read from and write to a serial port](https://developer.chrome.com/docs/capabilities/serial)
- Chrome WebHID guide: `requestDevice({filters:[{vendorId, productId, usagePage, usage}]})` with `exclusionFilters`; `getDevices()`; `device.open()` then the `inputreport` event (`data` is a DataView, plus `reportId`); `device.forget()`. Chrome blocks top-level collections with "protected usage (e.g. generic keyboard, mouse)" and FIDO devices. [P] — [Chrome: Connecting to uncommon HID devices](https://developer.chrome.com/docs/capabilities/hid)
- **Rust crates for the Tauri process:**
  - `serialport` **4.10.1** (released 2026-09-08, MPL-2.0, MSRV 1.59) gives "a blocking I/O interface and port enumeration on POSIX and Windows". Async I/O is available via `mio-serial`/`tokio-serial`. Linux enumeration uses `libudev` (optional feature). macOS lists both `/dev/cu.*` and `/dev/tty.*`. The project is "looking for maintainers! Especially for Windows". [P] — [crates.io serialport](https://crates.io/crates/serialport); [serialport-rs README](https://github.com/serialport/serialport-rs)
  - `hidapi` **2.6.7** (released 2026-08-27, MIT) wraps the C library libusb/hidapi, with `HidApi::new()`, `device_list()`, `open(vid,pid)` and `read`/`write`. [P] — [crates.io hidapi](https://crates.io/crates/hidapi); [hidapi-rs README](https://github.com/ruabmbua/hidapi-rs)

### Inferences
- **Tauri cashier design.** A Rust `scale` service with drivers `toledo8217`, `enq_dc1`, `cas_ecr2` and `hid_pos`, emitting one event type `{ grams: i64, stable: bool, zero: bool, status }` to the webview.
  - HID: `grams = raw_u16 × 10^scaling × unit_factor`, where g→1 and kg→1000. The kg-to-grams conversion is exact whenever scaling is at least −3 for kg.
  - Serial: parse the decimal string into integer grams with no float (`"1.234"` → 1234).
  - Enable "add to cart" only on stable, non-negative, non-fault status.
  - Keep zero and tare as commands to the scale (`Z`/`T` on 8217, the HID Zero Scale control) rather than subtracting in the POS. See §4: tare has legal restrictions.
- **Web/tablet clients.** Web Serial is viable in Chrome/Edge on Windows/Linux/macOS/ChromeOS. There is a one-time chooser per device, then `getPorts()` on load, and the page must be HTTPS (the POS web already is). Android tablets work only with Chrome ≥148 for USB serial, and Android WebView not at all. iPads have no route. WebHID HID-POS scales work on desktop Chrome only. A scanner-scale in **HID POS** mode is reachable through WebHID because usage page 0x8D is not blocklisted.
- On macOS and Linux, Tauri's webview is WebKit-based, which the BCD data shows lacks both APIs (Safari = no). So the desktop cashier should not rely on Web Serial at all; going through Rust is also uniform on Windows.
- Combined scanner-scales: the scale part usually exposes its own serial or HID interface, separate from the barcode stream, so the same drivers apply. I could not confirm per-model protocol names.

### Gaps
- Not retrieved (Zebra PRG URLs returned 404; search unavailable): Datalogic Magellan 9300i/9800i and Zebra MP7000 scale-interface specifics, i.e. which RS-232 scale protocols they emulate, USB-COM vs USB-OEM vs HID POS scale, and the scale-to-host cabling.
- Mettler Toledo **MT-SICS** (`S`, `SI`, `Z`, `T` commands for industrial/lab balances) was not retrieved from Mettler's reference manual.
- CAS's own ECR type tables (AP/ER/PD-II type 0–6, and the "7-byte" ECR-2 frame layout) were not seen in a CAS document.
- Whether Microsoft WebView2 (Tauri on Windows) exposes Web Serial/WebHID was not verified.
- Typical Ukrainian prices for checkout scales (CAS AP/ER/PD-II, Mettler Ariva, scanner-scales) were not found because search was unavailable.

## 4. Legal metrology for weighing at the point of sale (Ukraine and EU): verification, what a POS may show/print, OIML R76 / directive requirements for POS connected to scales, manual weight entry

### Takeaway
In Ukraine, trade between buyer and seller is in the legally regulated sphere (Law 1314-VII, art. 3 p. 7). **Non-automatic weighing instruments are on the KMU list of instruments subject to periodic verification for that activity** (KMU №374, item 50), and owners must submit them on time (art. 17). Under 2014/31/EU and OIML R76, the device that computes and shows the price to pay "is in any case considered part of the instrument". Customer-facing displays and printers in direct sales must meet the essential requirements, and an interface must not allow falsifying primary indications. In practice the POS must show the weight exactly as received, must not compute legally binding prices from a scale that is not approved for it, and should not accept typed-in weights for direct sales.

### Cited Findings
- **Law of Ukraine «Про метрологію та метрологічну діяльність» №1314-VII**, edition of 15.11.2024:
  - Art. 3: the legally regulated sphere includes "7) торговельно-комерційні операції та розрахунки між покупцем (споживачем) і продавцем (постачальником, виробником, виконавцем)…".
  - Art. 8(1): only instruments meeting the accuracy requirements are used in the sphere. Art. 8(3): instruments with adjustment elements or functions "повинні мати захист від вільного доступу … (включаючи програмне забезпечення)". Art. 8(4): use is allowed only when they comply with the Law and other acts.
  - Art. 17(1): instruments in service "підлягають періодичній повірці та повірці після ремонту". Art. 17(2): the KMU sets the list of categories, and the central executive authority sets the inter-verification intervals. Art. 17(3): businesses "зобов’язані своєчасно … подавати … на періодичну повірку".
  - Art. 31: liability "згідно із законом".
  [P] — [zakon.rada.gov.ua 1314-18](https://zakon.rada.gov.ua/laws/show/1314-18)
- **KMU resolution №374 of 04.06.2015** (list of categories subject to periodic verification), edition of 01.01.2022 (amended by №852/2018 and №1123/2021): item **50 "Неавтоматичні зважувальні прилади" — activities "1, 2, 3, 7, 8, 12 і 13"** of art. 3, which includes **7 (trade)**. The page header also shows a future edition dated **10.12.2026** on the basis of **708-2026-п**; its content was not read. [P] — [zakon.rada.gov.ua 374-2015-п](https://zakon.rada.gov.ua/laws/show/374-2015-%D0%BF)
- **KMU №94 of 13.01.2016** is the *Технічний регламент законодавчо регульованих засобів вимірювальної техніки* (the MID analogue, not the NAWI one). Annex 2 p. 40: instruments for direct sales must be designed so that "результат вимірювань одночасно було надано обом сторонам". Any receipt issued to the consumer by an add-on device that does not meet the technical regulation "повинен містити відповідну обмежувальну інформацію". [P] — [zakon.rada.gov.ua 94-2016-п](https://zakon.rada.gov.ua/laws/show/94-2016-%D0%BF)
- **Directive 2014/31/EU** (text as adopted, via the UK legislation archive):
  - Art. 1(2) regulated uses include "(a) determination of mass for commercial transactions" and "(f) determination of price on the basis of mass for the purposes of direct sales to the public and the making-up of prepackages".
  - Annex I preliminary observation: repeat indicating and printing devices are exempt only if results are printed or recorded correctly by a conforming part, "However, in the case of instruments used for direct sales to the public, display and printing devices for the vendor and the customer must fulfil the essential requirements."
  - Annex I 10: "Printed results shall be correct, suitably identified and unambiguous".
  - Annex I 14 (direct sales, Max ≤ 100 kg): "shall clearly show the customer the price calculation"; "The price to pay, if indicated, shall be accurate"; price-computing instruments "may perform functions other than per-article weighing and price computation only if all indications related to all transactions are printed clearly and unambiguously … on a ticket or label for the customer"; "Supplementary devices are permitted only if they cannot lead to fraudulent use"; non-conforming similar instruments must be marked "Not to be used for direct sale to the public".
  - Annex I 15: price-labelling instruments meet the price-indicating requirements, and "printing of a price label shall be impossible below a minimum capacity".
  [P] — [Dir. 2014/31/EU Annex I](https://www.legislation.gov.uk/eudr/2014/31/annex/I); [Dir. 2014/31/EU Art. 1](https://www.legislation.gov.uk/eudr/2014/31/article/1)
- **OIML R 76-1:2006, direct sales and price computing:**
  - 4.13.1: primary indications = weighing result plus zero, tare and preset-tare information.
  - 4.13.2: no non-automatic zero-setting without a tool.
  - 4.13.3: tare only if the public can see whether it is in use and whether it was altered, and only one tare at a time. Semi-automatic tare must not allow reducing the tare. **No automatic tare.**
  - 4.13.4: preset tare is shown as a primary indication on a separate display, and a PLU-linked preset tare is cancelled with the PLU.
  - **4.13.6**: all primary indications are shown "clearly and simultaneously to both the vendor and the customer"; customer digits are ≥ 9.5 mm.
  - **4.13.9**: on a significant fault, alarm and "data transmission to any peripheral equipment shall be prevented".
  - **4.14.3**: "The price to pay shall be calculated and rounded to the nearest interval of price to pay, by multiplication of weight value and unit price, both as indicated by the instrument. The device or devices which perform the calculation and indication of the price to pay are in any case considered part of the instrument." Unit price only per 100 g or per kg. Indications stay ≥ 1 s after stable, at most 3 s after unloading, and while weight is shown the unit price cannot be changed. If printed, weight, unit price and price must all be printed.
  - 4.14.4: extra functions only if all transactions are printed for the customer. 4.14.4.1: non-weighed articles allowed only with weight zero; a count is shown with "X". 4.14.4.4: cancellations are printed with a comment.
  - 4.16 (price labelling): weight display required; printing below Min impossible; fixed-value labels only with the weighing mode "obviously made inoperative".
  [P] — [OIML R 76-1:2006 (PDF)](https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf)
- **OIML R 76-1:2006, interfaces and PC/POS:**
  - 5.3.6.1: through an interface it must be impossible to "display data that are not clearly defined and which could be mistaken for a weighing result", "falsify displayed, processed or stored weighing results", adjust the instrument, or "falsify primary indications displayed in case of direct sales to the public".
  - 5.3.6.3: an interface to a peripheral subject to R76 "shall transmit data relating to primary indications in such a manner that the peripheral device can meet the requirements".
  - 5.5.2.1: "PCs acting as a purely digital module … (e.g. used as terminals or price-computing point-of-sale devices) shall be treated according to Table 11, categories 3 and 4".
  - 5.3.5: no indication or transmission during warm-up.
  [P] — [OIML R 76-1:2006 (PDF)](https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf)

### Inferences
- **POS + plain weight-only checkout scale** (the usual small-shop till): when the POS multiplies weight × unit price and shows the price to pay to a customer, OIML 4.14.3 and Annex I 14 make the POS display, computation and receipt printing **part of the measuring instrument**. In the EU this needs the scale and POS to be type-examined as a combination (a "POS module"/PC category 3–4 evaluation). Software must never alter, round or re-scale the received weight. It shows weight, unit price and price to pay to the customer at the same time (customer display) and prints all three on the receipt. It must stop accepting weight on fault or unstable status.
- **Lower-risk architecture for a small Ukrainian shop:** let a verified **price-labelling or price-computing scale** do the metrology (it prints weight, unit price and price on the label, per 4.16/Annex I 15). The POS then only scans the label (RCN EAN-13) and charges the printed amount. When the POS reads a checkout scale directly, choose a scale whose documentation says it is approved for connection to an ECR/POS and use its documented protocol. This is an inference: I found no Ukrainian rule spelling out POS-scale system approval.
- **Manual weight entry:** a keyed-in weight is not a result from a verified instrument in the legally regulated sphere (art. 8). It should be disabled for direct sales and, if kept, limited to non-legal uses (stock counts, internal transfers) and audited. This is an inference; I found no Ukrainian text that addresses POS manual entry explicitly.
- **Tare:** subtracting a container tare in POS software is a "tare device" behaviour with the OIML restrictions above, so it belongs on the scale (preset tare in the scale's PLU), not in the POS.
- **Periodic verification:** the POS could store each scale's serial number and verification-due date and warn the owner, since art. 17(3) puts the duty on the business.

### Gaps
- I could not identify or retrieve the Ukrainian **Технічний регламент неавтоматичних зважувальних приладів** (the 2014/31/EU transposition), neither its KMU resolution number nor its text. №93-2016, 95-2016 and 96-2016 were checked and are other acts. zakon.rada.gov.ua was intermittently refusing connections.
- The current inter-verification interval for НЗП used in trade (the Ministry's order on «міжповірочні інтервали») was not retrieved, nor was the content of the 10.12.2026 change (708-2026-п) to KMU №374.
- **WELMEC Guide 2.2** (testing of POS devices connected to NAWIs) and **WELMEC 7.2** (software) were not retrieved, and neither was the current EN 45501. OIML R76-1:2006 is the version used here; I did not check whether a newer edition exists.
- I found no Ukrainian guidance on customer displays or receipt content specifically for weighed goods beyond the general rules above.

## 5. PLU codes and store practice: IFPS 4/5-digit PLUs, picture quick-lookup grids, container tare, items sold per piece but priced by weight, fixed-weight prepacks

### Takeaway
IFPS PLUs are 4-digit codes (3000/4000 series, with 83000/84000 reserved for when those run out) plus a "9" prefix for organic. They are voluntary, carry no intelligence, and have no Ukrainian national equivalent: GS1 Ukraine says there is no national loose-produce solution. In a small Ukrainian shop the practical "PLU" is the scale's own PLU number (1..99999, mapped to scale keys 1..72 on a CAS CL5000) plus a picture grid on the POS. Tare belongs on the scale, and fixed-weight prepacks are ordinary fixed items.

### Cited Findings
- IFPS: PLU codes are "randomly assigned within a series of numbers within the 3000, 4000, 83000, and 84000 series"; the 83000/84000 series "will be assigned after the 3000 and 4000 series are exhausted". "The 4-digit codes are for conventionally grown produce." "The prefix of '9' would be placed in front of the 4-digit conventionally grown code for organic produce." "There is no intelligence built into the code." Retailer-assigned codes "must be those listed in the database and designated as Retailer Assigned" and "can not be randomly chosen". "over 1500 PLU codes" exist. "The PLU coding system is voluntary and not mandated by any governing body." [P] — [IFPS PLU Codes](https://www.ifpsglobal.com/plu-codes)
- GS1 Ukraine: "There is no specific national solution for Loose Produce Coding". GS1 points to its Fresh Produce initiative for GS1 DataBar on produce. [P] — [GS1 Summary 20–29 R5.1.5](https://www.gs1.org/docs/barcodes/SummaryOfGS1MOPrefixes20-29.pdf)
- GS1 lists three processes for loose goods: the customer bags and the label is generated in store; staff label pre-packs; or the item is weighed at POS "to generate the price". Variable count uses AI (30). [P] — [GS1 GenSpecs R26.0 §2.1.12.1, §3.6.1](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)
- CAS CL5000 factory layout: hot-keys map to PLU 1 (top-left) … 72 (bottom-right), and scale PLU numbers can follow the POS group's row order. [S] — [Rarus CAS CL guide (PDF)](https://rarus.ru/downloads/2489/%D0%9F%D0%BE%D0%B4%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%B8%20%D0%BD%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0%20%D0%92%D0%B5%D1%81%D0%BE%D0%B2%20%20CAS%20%D1%81%D0%B5%D1%80%D0%B8%D0%B8%20CL.pdf)
- OIML: a preset tare tied to a PLU should be cancelled with the PLU; preset tare is shown on a separate display; non-weighed articles on a price-computing scale only with weight zero, and the article count is shown with "X". [P] — [OIML R 76-1:2006](https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf)
- The POS already models quantity as an integer in the variant's unit, and the café vertical allows `г`. [R] — [src/pos/verticals/cafe.ts](/home/user/tiktok-live/src/pos/verticals/cafe.ts)

### Inferences
- **Data model for a grocery vertical:**
  - `unit ∈ {шт, г}` (the display may convert to «кг» with 3 decimals).
  - `sell_mode ∈ {fixed, weighed, counted}`.
  - `scale_plu` (store-unique, ≤ 5 digits so it fits `2x IIIII WWWWW C`).
  - `price_per_kg` stored as kopecks per 1000 g. A weighed line is `quantity = grams`, `line = round(grams × price_per_kg / 1000)`.
  - Optional `ifps_plu` (4–5 digits) only as a search alias for imported produce, since Ukraine has no national PLU scheme.
- **Quick-lookup grid:** the till shows a picture grid of the store's loose items (the same set as the scale hot-keys). Selecting one reads the live weight from the scale driver (§3) or prompts for a label scan. A per-picture "PLU" number gives keyboard entry.
- **Items sold per piece but priced by weight** (e.g. a melon or a fish priced per kg, sold as one piece) are a weighed line with quantity in grams. The label or till shows "1 шт" only as text. **Fixed-weight prepacks** (e.g. 500 g of cheese packed in-store at a fixed price) are ordinary fixed items with the POS's own `29…` code, not variable-measure codes.
- **Container tare:** keep it in the scale PLU (preset tare) or the scale's tare key. The POS should not subtract it (OIML 4.13.3/4.13.4).

### Gaps
- IFPS's retailer-assigned number list and the status of the former "8" (GM) prefix were not shown on the fetched page.
- I found no data on how many Ukrainian small shops use IFPS PLUs or picture grids. The "picture grid" practice is inferred, not sourced.

## 6. Camera-based produce recognition at checkout or on scales: vendors, accuracy claims, hardware, price, open models for a tablet or PC webcam, real-world results

### Takeaway
Commercial systems claim very high accuracy, such as Mashgin's "over 99.99%" with multiple 3D cameras, but these are vendor claims without independent data, and pricing is not published. Open tooling (MediaPipe Image Classifier with EfficientNet-Lite, roughly 10–44 ms per frame on a phone; public grocery datasets such as the 81-class GroceryStoreDataset) makes a **"suggest the top 3 PLUs" assistant on a tablet or webcam feasible**. It needs store-specific training images, and it must stay a picker, not an auto-seller: weight still comes from the verified scale.

### Cited Findings
- **Mashgin:** "patented computer vision instantly identifies items"; "No scanning or bar-codes required"; "multiple 3D cameras to create 3D models for each item in real time"; "over 99.99% accuracy"; "go in 5 seconds" (a case study cites "18 sec" average transaction and "3x" throughput). It identifies "unpackaged items, like hot foods, fountain drinks, and fresh produce", is in "over 5,000 locations", integrates with "50+ payment networks, POS systems, loyalty systems", and does not state pricing. The page is internally inconsistent: "over 1 million" vs "over 100k" trained items. [V] — [mashgin.com](https://www.mashgin.com/)
- **Tiliter:** "Product recognition — Identify products in images"; "Faster checkouts, fewer mistakes"; "1,000+" locations and "50M+" images processed per year. Woolworths' Head of Business Solutions says they are "excited to continue our partnership with Tiliter through the implementation of new, digital scales". Customer logos include Woolworths Group, Netto Marken-Discount, Krónan, Majid Al Futtaim and MishiPay. It offers a free tier ("10 free checks"). No accuracy figures, hardware requirements or prices are on the home page. [V] — [tiliter.com](https://www.tiliter.com/)
- **GroceryStoreDataset** (Klasson, Zhang, Kjellström, WACV 2019): 5,125 natural images "taken with a smartphone camera in different grocery stores", in 81 fine-grained classes (e.g. Royal Gala vs Granny Smith) grouped into 42 coarse classes. It covers fruit, vegetables and carton items, with train/val/test splits; a 292-image validation set was added in 2019. [P] — [GitHub marcusklasson/GroceryStoreDataset](https://github.com/marcusklasson/GroceryStoreDataset); [arXiv:1901.00711](https://arxiv.org/abs/1901.00711)
- **MediaPipe Image Classifier:**
  - Platforms: Android, iOS, Python and **Web/JavaScript**.
  - Models: EfficientNet-Lite0 (recommended) and Lite2, int8/float32, 224×224 input, trained on ImageNet's 1,000 classes.
  - Pixel 6 latency: Lite0 int8 10.08 ms CPU; Lite0 float32 23.52 ms CPU / 18.90 ms GPU; Lite2 int8 19.43 ms CPU; Lite2 float32 44.17 ms CPU / 22.20 ms GPU.
  - Custom classes via Model Maker (TFLite with metadata).
  - Modes: IMAGE, VIDEO, LIVE_STREAM.
  [P] — [MediaPipe Image Classifier](https://developers.google.com/edge/mediapipe/solutions/vision/image_classifier)

### Inferences
- **Feasible MVP for this POS:**
  - Fine-tune EfficientNet-Lite0 with MediaPipe Model Maker on about 30–100 of the store's own loose SKUs, using photos taken at the till: different bags, lighting, partial views.
  - Run it in the web/tablet client with MediaPipe Tasks Web on a camera stream. On the Tauri cashier, use the same TFLite/ONNX model in Rust or the webview.
  - Show the top-3 tiles above the picture grid. The cashier always confirms, and the weight comes from the scale driver.
  - ImageNet-only models are not good enough: they do not know store varieties, and organic vs conventional, or similar cultivars, are visually indistinguishable.
- **Accuracy expectations:** vendor figures (99.99%) come from controlled multi-camera kiosks and cannot be taken as the accuracy of a single webcam over a scale through a plastic bag. Plan for measured top-1/top-3 accuracy per store, and keep logging which suggestion the cashier finally chose so the model can be retrained.
- **Legal:** recognition only chooses the PLU. The metrological result (weight) and the price computation stay with the verified instrument (§4), so recognition does not by itself change the legal status of the till.

### Gaps
- Not retrieved (search budget exhausted; vendor pages unknown or unreachable, e.g. aclas.com returned 503): Toshiba, NCR (Voyix), Diebold Nixdorf, ITAB, Wintec, Hikvision, Dahua and Aclas "AI scales". This covers their hardware (camera on the scale or the pole), claimed accuracy, prices and Ukrainian availability.
- I found no independent, real-world accuracy study of produce recognition at checkout. The GroceryStoreDataset paper's benchmark numbers are in the PDF, which was not read; the abstract has no figures.
- I found no prices for any recognition system.
