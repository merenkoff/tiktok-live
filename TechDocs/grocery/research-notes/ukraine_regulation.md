# Ukrainian legal, fiscal and tax requirements for a grocery POS (ПРРО via Checkbox) — state as of 22–23 Oct 2026

Method note for the report writer. All statutory texts below were downloaded on 2026-10-22/23 directly from the official database zakon.rada.gov.ua (print versions). The edition date shown on each page is quoted next to the citation. tax.gov.ua and zir.tax.gov.ua answered 403 to every request (the repo's own notes in `TechDocs/prro/dps/README.md` record the same problem). The shared web-search budget ran out partway through, so **no ДПС ЗІР answers could be retrieved**. Where a ДПС position matters, it is listed under Gaps. Checkbox facts come from the official OpenAPI spec `https://api.checkbox.in.ua/api/openapi.json`, version 2.106.4, snapshot taken 2026-09-10 and stored in the repo at `TechDocs/prro/checkbox/api/openapi-2.106.4.json`. Professional media (Дебет-Кредит, Мінфін, ЛІГА) are marked **[interpretation]**.

Useful constants: НМДГ (неоподатковуваний мінімум доходів громадян) = **17 грн** whenever another law refers to it for sanctions ([ПКУ розд. XX підрозд. 1 п. 5, ред. 17.09.2026](https://zakon.rada.gov.ua/laws/show/2755-17)). So 300 НМДГ = 5 100 грн, 50 НМДГ = 850 грн and 30 НМДГ = 510 грн. Many newer fines are set in МЗП (the minimum wage on 1 January of the year). I did not verify the 2026 МЗП amount.

---

## 1. Fractional quantities (weighed goods) in fiscal receipts: DPS format, rounding, Checkbox representation

### Takeaway
The ДПС document format carries quantity with **3 decimals** (`AMOUNT`, «15.3 цифри») and money with 2 decimals (`PRICE`, `COST`). The unit travels as a classifier code (`UNITCD`, 5 digits) plus a free-text name (`UNITNM`, e.g. «кг»). The official sample shows `COST = PRICE × AMOUNT` rounded to the kopeck (5.701 кг × 52.30 = 298.16). Положення № 13 requires the quantity and the unit price on the receipt whenever the quantity differs from one unit of measure. Checkbox has **no unit field in the receipt payload**. Quantity is an integer in thousandths (2.25 кг = 2250) and the price is in kopecks per 1000 of quantity. A weight flag (`is_weight`) exists only in Checkbox's own goods catalogue.

### Cited Findings
**Paper/electronic receipt content (Положення № 13, наказ Мінфіну від 21.01.2016 № 13, ред. 11.01.2025, changes by наказ № 601 of 22.11.2024 and № 632 of 11.12.2024)**
- Row 6 of the fiscal receipt: «якщо кількість придбаного товару (обсяг отриманої послуги) не дорівнює одиниці виміру,- кількість, вартість одиниці виміру придбаного товару (отриманої послуги)» — [Положення № 13, розд. II п. 2](https://zakon.rada.gov.ua/laws/show/z0220-16)
- Row 11: «назва товару (послуги) / спрощена назва товару (послуги), вартість, літерне позначення ставки ПДВ». Row 7 is the УКТ ЗЕД subcategory code «у випадках, передбачених чинним законодавством». Row 8 is the product barcode («у разі непередбачення - за бажанням платника») — [Положення № 13, розд. II п. 2](https://zakon.rada.gov.ua/laws/show/z0220-16)
- «Якщо кількість придбаного товару (отриманої послуги) дорівнює одиниці виміру, відомості про товар (послугу) можна друкувати в одному рядку». If the register works with prices that include VAT, the receipt prints each item's value including VAT — [Положення № 13, розд. II п. 3](https://zakon.rada.gov.ua/laws/show/z0220-16)
- Local snapshot of the same text with line numbers: `TechDocs/prro/dps/polozhennya-13.md` (repo).

**ДПС XML document format (official ДПС sample documents, taken from the MIT-licensed OpenPRRO mirror because tax.gov.ua returns 403)**
- Field formats from the commented sample `check01(Опис всіх елементів).xml`: `AMOUNT` «Кількість/об’єм товару (15.3 цифри)», `PRICE` «Ціна за одиницю товару (15.2 цифри)», `UNITCD` «код одиниці виміру згідно класифікатора» (5 digits), `UNITNM` up to 64 characters, `UKTZED` «Код товару згідно з УКТЗЕД (15 цифр)» — [ДПС examples via OpenPRRO, commit fbf0543](https://github.com/p2p-sys/OpenPRRO/tree/fbf0543aa64c83e2707ba8245a58a9a323317285/utils/examples). Repo copies: `TechDocs/prro/dps/examples/`.
- Weighed line in the official sample: «Куряче Стегно», `UNITCD 25`, `UNITNM кг`, `AMOUNT 5.701`, `PRICE 52.30`, `COST 298.16`. 5.701 × 52.30 = 298.1623, stored as 298.16 — [ДПС sample `check01(Товар).xml`](https://github.com/p2p-sys/OpenPRRO/tree/fbf0543aa64c83e2707ba8245a58a9a323317285/utils/examples)
- Draught wine sold by volume: `UNITNM л`, `AMOUNT 10.000`, `PRICE 25.99`, `COST 259.90`, with no `UNITCD` — [ДПС sample `check01(Два податки).xml`](https://github.com/p2p-sys/OpenPRRO/tree/fbf0543aa64c83e2707ba8245a58a9a323317285/utils/examples)
- Discounts: `COST` is the value before discount and the discount is a separate `DISCOUNTSUM` on the line. In `CHECKTAX`, `TURNOVER` is the turnover before discount and `SOURCESUM` the base after it. A tax included in the price is computed as `SOURCESUM × PRC / (100 + PRC)`, rounded to the kopeck — repo analysis of the ДПС samples, `TechDocs/prro/dps/document-structures.md` **[interpretation of official samples]**
- Unit codes seen in the ДПС samples: `2009 шт` in the newer discount sample; `25 кг` and `87 бут` in older samples, which the repo analysis says are not ДК 011-96 (КСПОВО) codes. Cashalot's own example uses `138 л` — `TechDocs/prro/dps/document-structures.md` **[interpretation]**

**Checkbox API (OpenAPI 2.106.4)**
- `GoodItemPayload.quantity`: integer, exclusiveMinimum 0, title «Кількість (Наприклад: 1 шт = 1000, 2.25 кг = 2250)». Required fields are `good` and `quantity`. The optional `total_sum` is described as «Значення для розрахунку вартості товару від загальної суми» — [Checkbox OpenAPI](https://api.checkbox.in.ua/api/openapi.json)
- `GoodDetailsPayload.price`: integer, title «Вартість в копійках за quantity = 1000». The other fields are `code` (≤256), `name`, `barcode`, `excise_barcodes[]`, `e_excise_barcodes[]`, `header`, `footer`, `tax` (≤2 codes), `uktzed` (≤64) and `original_price`. **There is no unit-of-measure field** — [Checkbox OpenAPI](https://api.checkbox.in.ua/api/openapi.json)
- A weight flag exists only on Checkbox's goods-catalogue models: `CreateGoodPayload.is_weight` (required), `EditGoodsPayload.is_weight`, `GoodModel.is_weight`, and `OrderGoodDetailsModel.is_weight` («Чи є товар ваговим»). The response model `GoodItemModel` returns `sum` and `quantity` per line — [Checkbox OpenAPI](https://api.checkbox.in.ua/api/openapi.json)
- Checkbox's own printed receipt (sandbox) shows the quantity line as «1.000 x 150.00», then the name, the line amount and the tax symbol. No unit name is printed — repo fixture `src/__tests__/fixtures/checkbox/receipt_text.txt` (Checkbox sandbox, 2026-09-09)

**Units of measure in consumer information**
- Units must be SI units or non-SI units allowed by the metrology authority, written with Ukrainian letters — [Закон «Про інформацію для споживачів щодо харчових продуктів» № 2639-VIII, ст. 6 ч. 11, ред. 16.09.2026](https://zakon.rada.gov.ua/laws/show/2639-19)

### Inferences
- The grocery vertical needs a decimal quantity with at least 3 decimals (grams, millilitres) end to end: cart, sale line, offline queue, refunds and stock movements. The repo's own fiscal design already lists weighed goods as out of scope because `pos_sale_items.quantity` is INTEGER (`TechDocs/prro/POS_FISCAL_PRRO.md`, lines ~171 and ~696).
- When sending to Checkbox: `quantity = round(kg × 1000)` and `price` = kopecks per 1 kg (or per 1 l). Checkbox computes `sum` itself. Whatever the POS displays should be recomputed from the same formula so the screen matches the receipt.
- The ДПС sample is consistent with ordinary half-up rounding to the kopeck. No normative text found states the rounding method.
- Row 6 of Положення № 13 requires the quantity and the unit price, not the unit name. Checkbox's «0.350 x 189.90» layout therefore appears to satisfy it. Shops may still want «кг» in the product name or header for readability (**inference**).

### Gaps
- The official «Опис структур документів» (docx) and the authoritative `UNITCD` code list (ДК 011-96) could not be downloaded (tax.gov.ua 403). The correct КСПОВО code for kg is unverified.
- Checkbox's rounding rule for `sum` on fractional quantities is undocumented in the snapshot. So is whether Checkbox emits `UNITCD`/`UNITNM` to ДПС for ad-hoc goods that are not in its catalogue. The Checkbox wiki renders by script and could not be read.
- No real shop receipts with weighed goods were collected; only the ДПС sample and the Checkbox sandbox format.

---

## 2. Cash rounding (НБУ), its display on the receipt, card payments, Checkbox fields

### Takeaway
НБУ resolution № 25 of 15.03.2018, as amended by resolution № 115 of 08.09.2025, stopped the issue of 10-kopeck coins from **01.10.2025**. When no 10-kopeck coins are available, **cash** totals (receipt totals and refund acts) are rounded to 50 kopecks:
- 1–24 kopecks round down to .00;
- 25–49 kopecks round up to .50;
- 51–74 kopecks round down to .50;
- 75–99 kopecks round up to the next hryvnia.

Cashless payments are never rounded. The receipt must show the total both before and after rounding («Заокруглення», then «До сплати»). Checkbox exposes this as `rounding_mode: ROUND_10 | ROUND_50` («ROUND_50 — заокруглення до 50 копійок (за правилами з 01.10.2025)») and returns `round_sum`.

### Cited Findings
**In force**
- НБУ resolution № 25, п. 1: «Національний банк України з 01 липня 2018 року припиняє додатковий випуск у готівковий обіг монет номіналами 1, 2, 5 і 25 копійок, а з 01 жовтня 2025 року - монет номіналом 10 копійок». And: «Монети дрібних номіналів перебувають в обігу до прийняття окремого рішення Правління Національного банку України про їх вилучення» — [Постанова Правління НБУ від 15.03.2018 № 25 «Про оптимізацію обігу монет дрібних номіналів», ред. 01.10.2025 (постанова № 115 від 08.09.2025)](https://zakon.rada.gov.ua/laws/show/v0025500-18)
- п. 4-1 (from 01.10.2025, «якщо немає монет номіналом 10 копійок»): rounding applies to «загальних у чеку сум розрахунків готівкою за товари (роботи, послуги) та загальних сум розрахунків в акті про видачу коштів чи іншому документі, що оформляється під час повернення коштів у разі повернення товару». The brackets are 1–24 → 00, 25–49 → 50, 51–74 → 50, 75–99 → next 00. «Заокруглення не є знижкою або надбавкою, рекламою або стимулюванням продажу» — [НБУ № 25](https://zakon.rada.gov.ua/laws/show/v0025500-18)
- The old п. 4 (from 01.07.2018, applied when small coins were absent) rounded to 10 kopecks: 1–4 down to 0 and 5–9 up to 0 — [НБУ № 25](https://zakon.rada.gov.ua/laws/show/v0025500-18)
- п. 5: businesses using РРО must show on receipts and refund acts «загальні суми до заокруглення та після заокруглення». п. 6: «під час здійснення безготівкових розрахунків заокруглення не здійснюють» — [НБУ № 25](https://zakon.rada.gov.ua/laws/show/v0025500-18)
- Receipt layout: «результат заокруглення суми оплати у готівковій формі … друкується після рядка 21 з написом «Заокруглення». Наступним рядком друкується «До сплати» і сума після заокруглення». In the row list these are row 23 «заокруглення», row 24 «до сплати, валюта» and row 25 «решта». The same rule applies to the видатковий (refund) receipt — [Положення № 13, розд. II пп. 2, 9](https://zakon.rada.gov.ua/laws/show/z0220-16)
- Media summary: rounding applies to the receipt total, not to individual prices, and not to cashless payments — [Мінфін, 30.09.2025](https://minfin.com.ua/ua/2025/09/30/159570834/) **[interpretation]**

**Checkbox**
- `ReceiptSellPayload.rounding_mode`: enum `ROUND_10` («заокруглення до 10 копійок (як було з полем rounding)») and `ROUND_50` («заокруглення до 50 копійок (за правилами з 01.10.2025)»). The old boolean `rounding` is deprecated. The same field appears in the offline sell, prepayment and after-payment, ETTN, currency-exchange and invoice payloads — [Checkbox OpenAPI](https://api.checkbox.in.ua/api/openapi.json)
- Responses: `ReceiptModel.round_sum` and `rounding_mode`. Shift/Z reports carry `sales_round_up`, `sales_round_down`, `returns_round_up` and `returns_round_down` («Сума заокруглень у більшу/меньшу сторону у чеках продажу/повернення»). One payload has a `skip_total_cash_validation` flag — [Checkbox OpenAPI](https://api.checkbox.in.ua/api/openapi.json)

### Inferences
- POS rule: round only when the payment (or the cash part) is cash. Use the 50-kopeck brackets from 01.10.2025. Record `round_sum` separately from discounts, since НБУ says rounding is not a discount. Apply the same rule to cash refunds.
- The НБУ wording «якщо немає монет номіналом 10 копійок» makes rounding conditional. A shop that does hold 10-kopeck coins may still settle exactly, so the POS should make rounding a per-store setting rather than hard-code it.
- Rounding moves the cash collected away from the turnover. Analytics should report both.

### Gaps
- Not documented in the Checkbox snapshot: how mixed cash + card payments are rounded, and whether `payments[].value` for cash must be sent rounded or unrounded.
- The separate НБУ decision withdrawing 1/2/5/25-kopeck coins from circulation, which the task dates to 1 Oct 2019, was not retrieved. Resolution № 25 itself still says small coins «перебувають в обігу до прийняття окремого рішення».

---

## 3. Excise goods (alcohol, beer, tobacco, e-cigarettes and liquids)

### Takeaway
Every excise sale must go through a РРО/ПРРО in **programming mode**, with the УКТ ЗЕД subcategory code, name, price and quantity of each item. For alcohol the receipt must also carry the **paper excise stamp's barcode value (series + number)**: Law 265/95 ст. 3 п. 11, in the wording of Law 1914-IX, since 01.01.2022. The **01.11.2026** edition of the same item (Law 3173-IX, as amended by 4698-IX) adds the **e-stamp unique identifier or serial number** for alcohol, tobacco **and e-liquids**. Paper-stamped stock produced or imported before 01.11.2026 is sold with the paper-stamp barcode for 18 months and may circulate until **01.05.2028**.

Licensing moved from Law 481/95 (repealed 01.01.2025) to **Law 3817-IX**. Under it:
- retail licence fees are counted **per РРО/ПРРО** for alcohol and per place for tobacco;
- the fiscal numbers of all registers must be listed in the licensee register;
- 18+ is enforced with an ID check (Дія allowed);
- councils lost the general power to ban alcohol at night (only during mass events), while oblast military administrations may ban it under martial law.

The tobacco law bans product information at the point of sale (one 40×30 cm text poster only) and bans bonuses, cashback or discounts tied to tobacco.

### Cited Findings
**3a. Stamp and УКТ ЗЕД in the receipt — in force now**
- Law 265/95 ст. 3 п. 11 (current edition 26.06.2026): «проводити розрахункові операції через реєстратори … та/або через програмні реєстратори … для підакцизних товарів з використанням режиму програмування із зазначенням коду товарної підкатегорії згідно з УКТ ЗЕД, найменування товарів, цін товарів та обліку їх кількості, а також із зазначенням цифрового значення штрихового коду марки акцизного податку (серія та номер) при роздрібній торгівлі алкогольними напоями». Wording per Laws 128-IX, 1017-IX and **1914-IX of 30.11.2021** — [Закон № 265/95-ВР](https://zakon.rada.gov.ua/laws/show/265/95-%D0%B2%D1%80)
- The stamp-barcode duty applies from 01.01.2022 (Law 1914-IX). The ДПС individual tax consultation **№ 4720/ІПК/99-00-07-05-02-06 of 17.12.2021** treated it as receipt row 9. For cocktails and draught sales the stamp is entered or scanned at the first opening of a bottle — [Дебет-Кредит](https://news.dtkt.ua/state/cash-handling/74276-strixkod-akciznix-marok-pri-prodazu-alkogoliu-shho-novogo-u-2022-roci) **[interpretation]**
- Receipt row 9 (wording by наказ № 601 of 22.11.2024, with № 632 of 11.12.2024): «цифрове значення штрихового коду марки акцизного податку (серія та номер) на алкогольні напої або унікальний ідентифікатор електронної марки акцизного податку, або серійний номер електронної марки акцизного податку (зазначаються у випадках, передбачених законодавством)». Row 22 is the excise line for retailers registered as excise payers: letter, rate, total, with the tax's name at the start — [Положення № 13, розд. II п. 2](https://zakon.rada.gov.ua/laws/show/z0220-16)
- ДПС XML: `EXCISELABELS/ROW/EXCISELABEL` «Серія та номер марки акцизного податку», e.g. `AATE508932 0000412168`, with several rows allowed per line — [ДПС samples via OpenPRRO](https://github.com/p2p-sys/OpenPRRO/tree/fbf0543aa64c83e2707ba8245a58a9a323317285/utils/examples)
- Which goods carry paper stamps:
  - alcoholic drinks **above 8.5 % ABV** must be marked, and domestic drinks up to 8.5 % are not (so ordinary beer carries no stamp);
  - still wines and fermented drinks up to 15 % ABV of fully natural fermentation are exempt from marking (ПКУ 226.10, added by Law 1914-IX);
  - tobacco and e-liquids are marked (ПКУ 226.1).

  Source: [ПКУ ст. 226, ред. 17.09.2026](https://zakon.rada.gov.ua/laws/show/2755-17)
- Sanction for excise sales without programming mode, УКТ ЗЕД code, price and quantity accounting: **300 НМДГ** (= 5 100 грн) — [Закон № 265/95-ВР ст. 17 п. 7](https://zakon.rada.gov.ua/laws/show/265/95-%D0%B2%D1%80). A receipt without the stamp barcode has been treated as a violation under ст. 17 п. 1: 100 % of the value for a first violation, 150 % for repeats — [Дебет-Кредит](https://news.dtkt.ua/state/cash-handling/74276-strixkod-akciznix-marok-pri-prodazu-alkogoliu-shho-novogo-u-2022-roci) **[interpretation]**

**3b. Electronic excise stamps (е-акциз) — pending; moved from 01.11.2026 to 01.07.2027 by Law 5013-IX**
- **Update 2026-10-26.** Law **№ 5013-IX of 13.10.2026** (bill 15532, registered 21.08.2026; adopted 13.10.2026; signed, not yet officially published as of 26.10.2026 — no page on zakon.rada) moves every «1 листопада 2026» below to **1 липня 2027**: ПКУ 39-1.1 (paper stamps bought «до 30 червня 2027 року включно», e-identifiers «з 1 липня 2027 року»), Law 3173-IX розділ II п. 1 and the RRO law's п. 13-1 (goods produced or imported «до 1 липня 2027 року»), Law 3817-IX розділ XII п. 1 (розділ VIII except ст. 57, and sanctions пп. 9, 10, 38, 39 of ст. 73 ч. 2 «набирають чинності та вводяться в дію з 1 липня 2027 року»; ст. 57 from 01.01.2027). It also sets retailer registration deadlines (new п. 2-1: a licence live at 00:00 01.01.2027 → register «до 1 квітня 2027 року»; obtained 01.01–20.03.2027 → by 01.04.2027; later → before starting), keeps the system in test mode «до 30 червня 2027 року» (full operation from 01.07.2027, п. 34), extends the circulation of paper-stamped goods «до 31 грудня 2028 року включно» with withdrawal «з 1 січня 2029 року» (was 01.05.2028 / 02.05.2028; п. 17), and cuts the пп. 9, 10, 39 fines to 10 % for 01.07–31.12.2027 and 30 % for 01.01–30.06.2028 (п. 15). It enters into force the day after publication, the ст. 57 wording on 01.01.2027. Primary text (signed, from the Rada portal) and a before/after table: repo `TechDocs/grocery/research-notes/zakon-5013-IX.md`. The bullets below quote the 01.11.2026 wording as read on 22–23.10.2026 and stay for the mechanics, which the new law does not change.
- **Sandbox of the Electronic System («еАкциз») launched 01.08.2026** by Мінцифри — «повноцінна копія продуктового середовища із тестовими даними», meant for companies readying their IT systems, running continuously before and after the launch; cabinet `https://my-sb.xtrace.org.ua/`, API docs `https://api-sb.xtrace.org.ua/`, knowledge base `https://xtrace.gov.ua/knowledge-base/sandbox`, support@xtrace.gov.ua; accounts registered before 21.07.2026 were kept — [xtrace.gov.ua news](https://xtrace.gov.ua/news/sandboxlaunch). Integrating the till with it is the subject of the plan of plans recorded as a task in `TechDocs/grocery/PLAN.md` Г8 (2026-10-26).
- The **01.11.2026 edition** of Law 265/95 ст. 3 п. 11 (basis 3173-IX) requires, at retail of alcohol, tobacco products and e-liquids, «зазначенням унікального ідентифікатора електронної марки акцизного податку або серійного номера електронної марки акцизного податку». For cigars (УКТ ЗЕД 2402 10 00 10) and draught alcohol, the e-stamp may be recorded «тільки при першому продажі одиниці товару в межах вмісту одиничної пачки (упаковки) сигар/пляшки (упаковки) алкогольних напоїв» — [Закон № 265/95-ВР, ред. 01.11.2026](https://zakon.rada.gov.ua/laws/show/265/95-%D0%B2%D1%80/ed20261101)
- Transitional item 13-1 of the same edition (3173-IX as amended by **4698-IX of 03.12.2025**): «протягом 18 місяців з дня введення в дію» Law 3173-IX, paper-stamped alcohol, tobacco and e-liquids produced or imported before 01.11.2026 are sold «без зазначення унікального ідентифікатора електронної марки … та із зазначенням цифрового значення штрихового коду паперової марки акцизного податку (серії та номера) - при роздрібній торгівлі алкогольними напоями» — [Закон № 265/95-ВР, ред. 01.11.2026](https://zakon.rada.gov.ua/laws/show/265/95-%D0%B2%D1%80/ed20261101)
- Law 3817-IX Розділ XII п. 1 (in the wording of 4698-IX):
  - Розділ VIII «Електронна простежуваність» and sanctions items 9, 10, 38 and 39 of ст. 73 ч. 2 «набирають чинності та вводяться в дію з 1 листопада 2026 року»;
  - the e-stamp terms apply from 01.11.2026;
  - the Electronic System runs in test mode from 01.03.2025 to 12.10.2026, goes into commercial operation by 12.10.2026, and economic operators can register from 12.10.2026.

  Source: [Закон № 3817-IX, ред. 01.01.2026](https://zakon.rada.gov.ua/laws/show/3817-20)
- Law 3817-IX Розділ XIII п. 17: paper-stamped goods produced or imported before 01.11.2026 «перебувають в обігу до 1 травня 2028 року». From 02.05.2028 they must be withdrawn and re-marked with e-stamps — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)
- ПКУ 39-1.1 (4698-IX): paper stamps may be bought «до 31 жовтня 2026 року включно», and e-identifiers are formed «з 1 листопада 2026 року» — [ПКУ](https://zakon.rada.gov.ua/laws/show/2755-17)
- Obligations on retailers:
  - a retailer of goods marked with e-stamp graphics must register in the Electronic System as an «економічний оператор» (3817-IX ст. 57);
  - incoming goods are confirmed against the акцизний електронний документ (АЕД) by scanning the e-stamps or group identifiers and signing with a qualified e-signature (ст. 60);
  - no АЕД is needed for a sale to the final consumer (ст. 60).

  Sanctions from 01.11.2026: trading without registration as an economic operator costs 100 % of the goods' value (ст. 73 ч. 2 п. 9); receiving or storing without an АЕД costs 10 % (п. 39) — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)
- The Cabinet resolution of **26.12.2025 № 1756** moved mandatory use of the e-system and e-stamps from 01.01.2026 to 01.11.2026 and extended testing to 11.10.2026. Paper stamps can be ordered and used until full launch, and the deadline for returning unused paper stamps moved to **01.05.2027** — [ЛІГА:ЗАКОН](https://biz.ligazakon.net/news/241255_povnotsnniy-zapusk-e-aktsizu-pereneseno-na-1-listopada-2026-roku-postanova-kabmnu) **[interpretation/news]**. A related ЛІГА headline («Старт еАкцизу перенесли на липень 2027 року») was seen but **not verified**, and the zakon.rada texts as of 22–23.10.2026 still say 01.11.2026. **Verified 2026-10-26:** the headline was about bill 15532, now Law 5013-IX of 13.10.2026 — see the update at the top of §3b.
- Base law: № 3173-IX of 29.06.2023 («… у зв'язку із запровадженням електронної простежуваності обігу алкогольних напоїв, тютюнових виробів та рідин, що використовуються в електронних сигаретах»), listed among ПКУ amendments — [ПКУ](https://zakon.rada.gov.ua/laws/show/2755-17)

**3c. Checkbox fields for excise goods**
- `GoodDetailsPayload.excise_barcodes[]` («Цифрове значення штрихкоду акцизної марки»), `e_excise_barcodes[]` («Перелік штрихкодів електронних акцизних марок (ЕМ)»), `excise_barcode` (deprecated), `uktzed` («Код УКТ ЗЕД», ≤64) and `tax[]` (up to 2 codes per good, e.g. VAT + excise). The receipt response's `GoodModel` echoes `excise_barcodes`, `e_excise_barcodes` and `uktzed` — [Checkbox OpenAPI](https://api.checkbox.in.ua/api/openapi.json)
- Tax rates are per organisation and come from `GET /api/v1/cashier/tax`. The sandbox non-VAT organisation returned only code 8 «Без ПДВ», symbol «Є» — repo fixture `src/__tests__/fixtures/checkbox/cashier_tax.json`

**3d. Licences (Law 3817-IX replaced Law 481/95-ВР from 01.01.2025)**
- Law 481/95-ВР: «Закон втратив чинність на підставі Закону № 3817-IX від 18.06.2024», «Втрата чинності від 01.01.2025» — [Закон № 481/95-ВР](https://zakon.rada.gov.ua/laws/show/481/95-%D0%B2%D1%80). Law 3817-IX's licensing section (розд. VII) applies from 01.01.2025 (розд. XII п. 1) — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)
- Alcohol: «Роздрібна торгівля алкогольними напоями (крім столових вин) … у тому числі через мережу Інтернет, може здійснюватися … за наявності … ліцензії на право роздрібної торгівлі алкогольними напоями». An alcohol licensee may also sell cider and perry without a separate licence (ст. 16 чч. 7–8). «Алкогольний напій» covers УКТ ЗЕД 2203–2206 and 2208 above 0.5 % ABV, so **beer needs a licence** (ст. 1 п. 2, п. 69) — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)
- Tobacco and e-liquids need a retail licence for tobacco products or for e-liquids (ст. 23 ч. 1). Retail of raw tobacco, raw materials for e-liquids or nicotine is banned (ст. 23 ч. 2, extended by 4536-IX of 16.07.2025) — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)
- Annual fees (ст. 52), paid quarterly; licences are indefinite and issued per place of retail:
  - alcohol (except cider/perry): **1.5 МЗП for each РРО/ПРРО registered at the trading address**, or 0.08 МЗП in villages and settlements (with exceptions);
  - cider and perry: 0.15 МЗП per place;
  - tobacco and/or e-liquids: 0.35 МЗП per place, or 0.05 МЗП in villages.

  Source: [Закон № 3817-IX ст. 52](https://zakon.rada.gov.ua/laws/show/3817-20)
- The licensee register records the «перелік фіскальних номерів реєстраторів розрахункових операцій, програмних реєстраторів … наявних у місці роздрібної торгівлі» (ст. 34). The licence application lists them (ст. 43), and changes go through an application. Selling alcohol, tobacco or e-liquids through a РРО/ПРРО that is not in that register costs **200 % of the goods sold through it, at least 8.5 МЗП** (ст. 73 ч. 2 п. 23). Selling without a licence costs 200 % of the value, at least 3 МЗП (п. 13) — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)
- «Місце роздрібної торгівлі» is defined as a place where settlements go through registered РРО/ПРРО (ст. 1 п. 51) — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)

**3e. Price controls**
- Alcohol: «Мінімальні оптово-відпускні та роздрібні ціни на алкогольні напої встановлюються Кабінетом Міністрів України» and are reviewed annually by 25 December and whenever excise rates change (ст. 68). Selling below the minimum retail price costs 100 % of the value at minimum prices, at least 2 МЗП (ст. 73 ч. 2 п. 25) — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)
- Tobacco and e-liquids: the manufacturer or importer prints a maximum retail price (MRP) and production date on the pack (ст. 67). The selling price may not exceed «максимальні роздрібні ціни, збільшені на суму акцизного податку з роздрібної торгівлі» (ПКУ 14.1.106; 3817-IX ст. 67 ч. 5). The retail price excluding retail excise «не може бути меншою за … мінімальне акцизне податкове зобов’язання … помножене на коефіцієнт 1,45» (ПКУ 14.1.106) — [ПКУ](https://zakon.rada.gov.ua/laws/show/2755-17). Selling above MRP + retail excise costs 100 % of the value, at least 2 МЗП (п. 26). Selling below the 14.1.106 level costs the same (п. 47) — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)

**3f. 18+, places, forms of sale**
- Selling beer (except non-alcoholic), alcoholic and low-alcohol drinks, tobacco, e-cigarettes, e-liquids and heated-tobacco devices is banned **to and by persons under 18** (ст. 71 ч. 1). If in doubt, the seller or courier must ask for a passport, ID-card passport, driving licence, other age document «або їх електронні копії, зокрема з використанням мобільного додатка Порталу Дія». If the buyer refuses, the sale is prohibited (ч. 5–6). Violating ст. 71 costs **3 МЗП** (ст. 73 ч. 2 п. 24) — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)
- ст. 71 ч. 2 bans these sales:
  - in schools and health facilities, and in children's or sports goods shops and departments;
  - in indoor sports venues (except beer in plastic);
  - from vending machines;
  - **from self-service shelves (except tobacco in blocks, and alcohol, low-alcohol drinks, table wine and beer)**;
  - single cigarettes (except cigars);
  - from hands or stalls;
  - in packs with fewer or more than 20 cigarettes (12 months after the law's entry into force);
  - in places not designated for such trade;
  - by e-commerce, except under ч. 9 (from 01.11.2026).

  Source: [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)
- The same 18+ and packs-of-20 rules appear in the tobacco control law (ст. 13 ч. 1, amended by 3817-IX) — [Закон № 2899-IV, ред. 01.10.2025](https://zakon.rada.gov.ua/laws/show/2899-15)

**3g. Time-of-sale bans**
- Old rule (repealed): councils «можуть встановлювати заборону продажу пива …, алкогольних, слабоалкогольних напоїв, вин столових … (крім закладів ресторанного господарства) у визначений рішенням таких органів час доби» — [Закон № 481/95-ВР ст. 15-3 (втратив чинність 01.01.2025)](https://zakon.rada.gov.ua/laws/show/481/95-%D0%B2%D1%80)
- New rule: councils may ban or restrict sales only «на час проведення масових заходів» (3817-IX ст. 71 ч. 4). No general night-time power was found in Law 3817-IX — [Закон № 3817-IX](https://zakon.rada.gov.ua/laws/show/3817-20)
- Under martial law, oblast military administrations (by agreement and in the order set by the Cabinet) «можуть запроваджувати … захід правового режиму воєнного стану у виді заборони торгівлі алкогольними напоями та речовинами, виробленими на спиртовій основі, у визначений такими органами період доби». This was added by Law 3817-IX — [Закон «Про правовий режим воєнного стану» № 389-VIII, ст. 15 ч. 4, ред. 04.03.2026](https://zakon.rada.gov.ua/laws/show/389-19)

**3h. Tobacco display, promotion and loyalty**
- Law 2899-IV ст. 16 (wording by Law 1978-IX of 16.12.2021) bans tobacco advertising and sales promotion, including:
  - «пропонування або надання будь-якого прямого чи непрямого відшкодування з придбання»;
  - «бонусів, премій, повернення готівкових коштів … якщо умовою … є придбання або вживання тютюнових виробів»;
  - «продаж тютюнових виробів у наборі з будь-якими іншими товарами або послугами»;
  - placing information about tobacco products at the point of sale (graphics, colours, light, video) «крім одного плаката розміром не більше 40х30 см на одне місце торгівлі, в якому надається текстова інформація, надрукована шрифтом чорного кольору на білому фоні про наявні у продажу тютюнові вироби та ціни на них».

  Source: [Закон № 2899-IV](https://zakon.rada.gov.ua/laws/show/2899-15)
- E-cigarettes and liquids: refill containers of at most 10 ml, disposables and cartridges of at most 2 ml, at most 20 mg/ml nicotine, and products «не мають характерного запаху та/або смаку» (ст. 10-1). Cigarettes and roll-your-own tobacco with a characterising flavour, or with flavour additives in any component, are banned (ст. 10) — [Закон № 2899-IV](https://zakon.rada.gov.ua/laws/show/2899-15)

### Inferences
- POS design for excise lines:
  - **mandatory УКТ ЗЕД** per excise product;
  - **one stamp code per physical unit**, since both the DPS `EXCISELABELS` and Checkbox's arrays are lists, so a line of 3 bottles needs 3 codes;
  - scanning of paper-stamp barcodes now, plus **DataMatrix e-stamp scanning from 01.07.2027** (Law 5013-IX; was 01.11.2026);
  - both kinds side by side until 31.12.2028 (Law 5013-IX moved it from 01.05.2028);
  - «first-sale-only» logic for draught alcohol and cigars.
- Register-level licence control: keep, per store, the list of ПРРО fiscal numbers covered by the alcohol or tobacco licence, and block excise items on any other register. The alcohol fee is per register, so the owner will want to limit which tills sell alcohol.
- Checkout guards:
  - a compulsory 18+ confirmation step for every beer, alcohol, tobacco or e-cig line;
  - no single cigarettes, and pack size exactly 20;
  - a tobacco price cap at MRP × 1.05 and a floor at the ПКУ 14.1.106 level;
  - alcohol floors at the CMU minimum retail prices;
  - exclude tobacco from loyalty points, cashback, bundles and discounts (2899-IV ст. 16);
  - a configurable alcohol-sale time window per store, reflecting local military administration orders under martial law.
- Fiscal tax lines: beer and alcohol lines carry two tax codes (VAT + 5 % retail excise; see §9). Tobacco lines likely carry **no retailer excise**, because since Law 1914-IX the 5 % on tobacco and e-liquids is paid by manufacturers and importers (ПКУ 213.1.14) and retailers are payers only for other excise goods (ПКУ 212.1.11) (**inference**).

### Gaps
- The current Cabinet resolution setting minimum retail prices for alcohol (number, date, amounts) was not retrieved.
- Current КУпАП ст. 156 amounts (personal fines for cashiers selling to minors): the zakon print endpoint returned only the pre-2017 edition (30–100 НМДГ), so current figures are unverified.
- Exact entry-into-force dates of Law 1978-IX (the point-of-sale information ban, widely reported as 11.07.2023) and of the e-liquid flavour ban were not confirmed (the zakon request failed).
- ~~Whether the e-excise launch was moved again after 26.12.2025 (the «липень 2027» headline) is unverified.~~ Closed 2026-10-26: Law 5013-IX of 13.10.2026 moved it to 01.07.2027 (§3b). Still open: the law's official publication date (not on zakon.rada as of 26.10.2026) and the Cabinet resolutions it orders within a month of entry into force.
- ДПС ЗІР positions on stamp scanning for multi-packs and on returns of excise goods were not available.

---

## 4. ФОП restrictions: who may sell excise goods; who must use РРО/ПРРО when selling food (2021–2026)

### Takeaway
Single-tax payers of groups 1–3 may **not** produce, import or sell excise goods. The only exceptions are retail sale of fuel in containers up to 20 l, and **activity of individuals (ФОП) related to retail sale of beer, cider, perry (without added alcohol) and table wine** (ПКУ 291.5.1 пп. 3). So a single-tax ФОП shop may sell beer, cider and table wine (beer and cider still need the licence and the 5 % retail excise registration), but not spirits, tobacco or e-liquids. A single-tax ТОВ cannot sell excise goods at all. Since **01.01.2022** every single-tax ФОП of groups 2–4 must use РРО/ПРРО whatever the goods or income; only group 1 is exempt, and group 1 may trade only at markets. No 2025–2026 change to this was found.

### Cited Findings
**In force**
- «291.5. Не можуть бути платниками єдиного податку першої - третьої груп: 291.5.1. суб'єкти господарювання (юридичні особи та фізичні особи - підприємці), які здійснюють: … 3) виробництво, експорт, імпорт, продаж підакцизних товарів (крім роздрібного продажу паливно-мастильних матеріалів в ємностях до 20 літрів та діяльності фізичних осіб, пов’язаної з роздрібним продажем пива, сидру, пері (без додання спирту) та столових вин)». Wording by Law 2628-VIII of 23.11.2018 — [ПКУ, ред. 17.09.2026](https://zakon.rada.gov.ua/laws/show/2755-17)
- Group 1: ФОП without employees, «здійснюють виключно роздрібний продаж товарів з торговельних місць на ринках», income at most 167 МЗП. Group 2: production and/or sale of goods, at most 10 employees, income at most 834 МЗП. Group 3: ФОП and legal entities, income at most 1167 МЗП — [ПКУ 291.4](https://zakon.rada.gov.ua/laws/show/2755-17)
- «296.10. Реєстратори розрахункових операцій та/або програмні реєстратори розрахункових операцій не застосовуються платниками єдиного податку першої групи» (wording by Law 129-IX of 20.09.2019) — [ПКУ](https://zakon.rada.gov.ua/laws/show/2755-17)
- The transitional exemption for groups 2–4 has expired:
  - until 01.01.2021: none needed for income up to 1 000 000 грн (except technically complex goods and medicines);
  - from 01.01.2021 to 01.01.2022: income up to 220 МЗП (except technically complex goods, medicines and medical devices, and jewellery);
  - after that date: no exemption.

  Source: [ПКУ розд. XX підрозд. 10 п. 61](https://zakon.rada.gov.ua/laws/show/2755-17)
- Law 265/95 ст. 9 lists other exemptions. п. 6 covers single-tax ФОП «які не застосовують [РРО] відповідно до Податкового кодексу», which now means group 1 only. п. 11 covers «продажу води, молока, квасу, олії та живої риби з автоцистерн, цистерн, бочок та бідонів». п. 9 covers individuals selling at markets — [Закон № 265/95-ВР](https://zakon.rada.gov.ua/laws/show/265/95-%D0%B2%D1%80)
- Simplified names: non-VAT single-tax ФОП «при продажу товарів (крім підакцизних товарів, технічно складних побутових товарів …, лікарських засобів, виробів медичного призначення, ювелірних …) … мають право в розрахунковому документі зазначати назву товару (послуги) у вигляді, що відображає споживчі ознаки товару (послуги) та ідентифікує належність такого товару (послуги) до товарної групи» (Law 3219-IX of 30.06.2023) — [Закон № 265/95-ВР ст. 3 п. 2](https://zakon.rada.gov.ua/laws/show/265/95-%D0%B2%D1%80)
- Penalties for ФОП:
  - the reduced 25 % / 50 % fines for non-VAT ФОП (non-excise goods) applied only «у період з 1 серпня 2023 року по 31 липня 2025 року» (розд. II п. 15, Law 3219-IX);
  - the general ст. 17 п. 1 is now 100 % of the value for a first violation and 150 % for each later one (wording by Law 4143-IX of 17.12.2024);
  - since 01.10.2023 businesses are exempt from liability for violations committed in occupied territories and in territories of active or possible hostilities, **except for violations in excise-goods settlements** (розд. II п. 14).

  Source: [Закон № 265/95-ВР](https://zakon.rada.gov.ua/laws/show/265/95-%D0%B2%D1%80)
- Excise registration: «Особи - суб’єкти господарювання роздрібної торгівлі, які здійснюють реалізацію підакцизних товарів, підлягають обов’язковій реєстрації як платники податку … за місцезнаходженням пункту продажу» (ПКУ 212.3.1-1). Retail payers are those selling excise goods other than tobacco and e-liquids (212.1.11) — [ПКУ](https://zakon.rada.gov.ua/laws/show/2755-17)

**2025–2026 changes found**
- Law 4698-IX of 03.12.2025 added «охоронну діяльність» to the single-tax prohibitions (291.5.1 пп. 11). It does not affect groceries. Nothing changed in 291.5.1 пп. 3 or in 296.10 as of the 17.09.2026 edition — [ПКУ](https://zakon.rada.gov.ua/laws/show/2755-17)

### Inferences
- A POS store profile should record the **legal form and tax regime**. When the store is a single-tax ФОП, product categories for spirits, wine above table wine, tobacco and e-liquids should be blocked or warned about. A single-tax ТОВ should block all excise goods.
- Generic names on receipts (Law 3219-IX) are allowed for ordinary groceries sold by a non-VAT ФОП, but never for excise lines, which need exact names plus УКТ ЗЕД.

### Gaps
- The Cabinet list of «окремих форм та умов» where розрахункові книжки may replace РРО (Law 265 ст. 10; постанова КМУ № 1336 of 23.08.2000) could not be downloaded (connection reset). Rural small shops may rely on it.
- No ДПС ЗІР confirmation was obtained for group 2/3 food shops. The reading above comes straight from the statute.

---

## 5. Price tags and unit prices

### Takeaway
Today a food shop must show prices in UAH on signed and dated price tags, following **Інструкція № 2 (1997)**, referenced from Правила № 185 п. 16:
- weighed goods: name, grade, price **per 1 kg or per 100 g**;
- prepacked («розфасовані») goods: price per kg or 100 g **plus** package weight **plus** package price;
- signature and date are optional when the shop sells by barcode with prices stored in the register, provided a signed, dated price list is kept in each department.

The new Law «Про захист прав споживачів» № 3153-IX (art. 11) requires, for every seller, the selling price **and** the unit price (per 1 kg / 1 l / 1 m …; only the unit price for goods sold by weight; the selling price not in a smaller font). It also adds EU-style rules for «знижка»/«розпродаж» (the lowest price in the last 30 days). But the law is **not in force**: it starts one year after publication (07.07.2023) and **not before martial law ends**, and art. 11 parts 7–11 start a year after that.

### Cited Findings
**In force**
- Правила роздрібної торгівлі продовольчими товарами (наказ Мінекономіки 11.07.2003 № 185, ред. 02.10.2020), розд. I:
  - п. 16: inform consumers of retail prices in UAH «за допомогою ярликів цін (цінників) на зразках товарів, які оформляються відповідно до Інструкції … затвердженої наказом … від 04.01.97 N 2»;
  - п. 17: «Споживач має право перевірити точність ваги … Контрольно-вимірювальні прилади повинні розміщуватися на видному і доступному для споживачів місці»;
  - п. 7: measuring instruments must be in working order and periodically verified (повірка).

  Source: [Наказ № 185](https://zakon.rada.gov.ua/laws/show/z0628-03)
- Інструкція про порядок позначення роздрібних цін (наказ МЗЕЗторгу 04.01.1997 № 2, ред. 06.07.2018 by наказ № 632 of 10.05.2018), п. 7, requisites for food:
  - «для вагових товарів - назва товару, сорт, ціна за один кілограм або за сто грамів»;
  - draught goods: «ціна за одиницю місткості або одиницю ваги»;
  - piece goods and bottles: «назва …, вага або місткість, сорт, ціна за штуку»;
  - «для товарів, що розфасовані, - назва товару, сорт, ціна за один кілограм або за сто грамів, вага одиниці розфасовки, ціна за одиницю розфасовки».

  Source: [Інструкція № 2](https://zakon.rada.gov.ua/laws/show/z0004-97)
- Інструкція № 2, further points:
  - п. 9: tags are signed by the responsible employee and dated, but shops «що … застосовують сучасну технологію автоматизованої ідентифікації товарів за їх штриховими кодами, а значення цін … зберігається в пам’яті електронного контрольно-касового апарата або комп’ютера» may skip the signature and date, provided a signed, dated price list is available in each department;
  - п. 11: on repricing, strike the old price and mark the new one, or stick the new price over a label-gun price; for goods marked down because of partial loss of quality put the letter «П»; post an announcement of new prices;
  - п. 13: no pencil; label-gun or tape prices need no signature or date.

  Source: [Інструкція № 2](https://zakon.rada.gov.ua/laws/show/z0004-97)
- Cabinet trade rules: «Ціни на товари і продукцію зазначаються на ярликах (цінниках) або у покажчиках цін». Staff must let the consumer check «міри, ваги та ціни товарів» with control instruments — [Постанова КМУ від 15.06.2006 № 833, ред. 13.03.2019](https://zakon.rada.gov.ua/laws/show/833-2006-%D0%BF)
- КУпАП ст. 156-1 (as of the edition retrieved): restricting consumers' right to check the weight and price of goods is fined 1–10 НМДГ — [КУпАП (ed. retrieved: 07.05.2017)](https://zakon.rada.gov.ua/laws/show/80731-10) (edition may be outdated; see Gaps)

**Pending / not in force: Law № 3153-IX of 10.06.2023**
- Definitions. «ціна за одиницю продукції - кінцева ціна, включаючи податок на додану вартість та інші податки, за 1 кілограм, 1 літр, 1 метр, 1 квадратний метр, 1 кубічний метр або іншу одиницю вимірювання» (ст. 1 п. 44). «ціна продажу продукції - кінцева ціна за одиницю продукції чи задану кількість товару» (п. 45) — [Закон № 3153-IX](https://zakon.rada.gov.ua/laws/show/3153-20)
- ст. 11 «Вимоги до зазначення ціни продукції»:
  - ч. 1: «Суб’єкт господарювання, який реалізує продукцію споживачу, зазначає ціну продажу продукції та ціну за одиницю продукції. Ціна за одиницю продукції не зазначається, якщо вона ідентична ціні продажу продукції. Якщо товар або харчовий продукт продаються на вагу, суб’єкт господарювання зазначає лише ціну за одиницю маси»;
  - ч. 3: adverts with a price must also give the unit price;
  - ч. 4: «Ціна продажу продукції не може бути виконана шрифтом меншого розміру, ніж ціна за одиницю продукції»;
  - ч. 5: sets.

  The text has no exemption for small shops — [Закон № 3153-IX](https://zakon.rada.gov.ua/laws/show/3153-20)
- ст. 11 чч. 7–11: «знижка»/«акція» only for a limited period and below the usual price. «Розпродаж» only for all goods in a place or a defined group, for a limited time. During a promotion the seller must tell consumers the usual price and the new price. «Звичайна ціна продажу продукції - це найменша ціна, за якою суб’єкт господарювання пропонував придбати продукцію протягом останніх 30 днів» — [Закон № 3153-IX](https://zakon.rada.gov.ua/laws/show/3153-20)
- Entry into force (розд. IX п. 1): «через один рік з дня його опублікування, але не раніше дня припинення чи скасування воєнного стану … крім: частин сьомої - одинадцятої статті 11 …, які набирають чинності через рік з дня набрання чинності цим Законом». It repeals the 1991 law on that day — [Закон № 3153-IX](https://zakon.rada.gov.ua/laws/show/3153-20)
- Status on the zakon.rada card: «Стан: Набирає чинності». Published in Голос України 07.07.2023 № 15. A later edition (basis 4840-IX) «вводиться в дію з дня припинення чи скасування воєнного стану» — [zakon.rada card 3153-IX](https://zakon.rada.gov.ua/laws/card/3153-20)
- A separate bill **№ 12358** (Dec 2024, MP Д. Гурін) proposed unit pricing under Directive 98/6/EC through the current law. Its status is unknown — [ЛІГА:ЗАКОН](https://jurliga.ligazakon.net/news/232918_v-ukran-mozhut-vstanoviti-vimogi-shchodo-obovyazkovogo-zaznachennya-tsni-za-odinitsyu-vimru-tovaru), [Дебет-Кредит](https://news.dtkt.ua/society/community/95048-pliaski-po-850-ml-moloka-pidut-u-minule-zarejestrovano-zakonoprojekt) **[news; seen in search results only]**

### Inferences
- The price-tag module for groceries should already print:
  - weighed goods: price per kg or per 100 g;
  - prepacked or in-store-packed goods: price per kg or 100 g, net weight and package price;
  - draught goods: price per litre;
  - piece goods: weight or volume plus price per piece.
- It should also generate the **signed and dated price list** per department (which lets tags go unsigned when the shop scans barcodes) and support strike-through repricing with the «П» mark.
- Build unit price (per kg / per l) into every tag now, with the selling price in a font no smaller than the unit price. It costs little and makes the shop ready for 3153-IX on the day martial law ends. Also keep a 30-day price history per item for the future «звичайна ціна» rule.
- Whether factory-prepacked fixed-weight goods (e.g. 900 g buckwheat) count as «розфасовані» under Інструкція № 2 is not settled in the text. Commentary would be needed (**inference**).

### Gaps
- No ДПС or Держпродспоживслужба guidance on Інструкція № 2 for factory-prepacked goods was found.
- Current status of bill 12358 is unknown.
- The current КУпАП edition was not retrieved.

---

## 6. Food information and safety: shelf life, expired goods, near-expiry discounts, in-store packing

### Takeaway
- Selling food past its «вжити до» date or minimum-durability date is prohibited (Law 771/97 ст. 37 ч. 2 п. 6), and Правила № 185 п. 14 allows sale only within the shelf life.
- Fines under Law 2042-VIII ст. 65:
  - perishables past their storage period: **12 МЗП** (legal entities) / **8 МЗП** (ФОП);
  - non-perishables past minimum durability: **5 / 3 МЗП**;
  - unfit food: 25 / 17 МЗП; harmful food: 40 / 25 МЗП;
  - information breaches: 15 / 10 МЗП; missing allergen information: 30 / 20 МЗП.
- Food that is sold loose, packed at the customer's request, or packed in-store for sale in the same store needs at least the **name and allergens**, in a way the operator chooses. Other mandatory particulars are given on request, and nominal quantity is optional when the goods are weighed in front of the buyer.
- Near-expiry markdowns are lawful while the product is within its date. The repricing procedure in Інструкція № 2 applies.

### Cited Findings
**In force**
- «Забороняється також обіг об’єктів санітарних заходів, якщо ці об’єкти: … 6) мають дату "вжити до" або мінімальний термін придатності харчового продукту, що минули» (added by 3221-IX of 30.06.2023). Such foods «підлягають вилученню та/або відкликанню». Withdrawn foods that cannot return to circulation may be used for other purposes, «у тому числі передаються безоплатно до зоопарків чи притулків для тварин», or destroyed (ч. 4, Law 3947-IX) — [Закон № 771/97-ВР ст. 37, ред. 22.07.2026](https://zakon.rada.gov.ua/laws/show/771/97-%D0%B2%D1%80)
- Правила № 185, розд. I:
  - п. 14: «Реалізація харчових продуктів на підприємствах роздрібної торгівлі дозволяється тільки протягом термінів їх придатності до споживання»;
  - п. 12: expired foods are counted as dangerous;
  - п. 6: perishables must be stored with refrigeration.

  Source: [Наказ № 185](https://zakon.rada.gov.ua/laws/show/z0628-03)
- Fines, Law 2042-VIII ст. 65 ч. 1 (ред. 16.09.2026):

  | Item | Violation | Legal entity | ФОП |
  |---|---|---|---|
  | п. 11 | «пропонування до реалізації або реалізація швидкопсувних харчових продуктів … строки зберігання яких закінчилися, якщо внаслідок цього харчові продукти … не стали шкідливими» | 12 МЗП | 8 МЗП |
  | п. 12 | the same for non-perishables «мінімальні строки зберігання яких закінчилися» | 5 МЗП | 3 МЗП |
  | п. 9 | unfit food | 25 МЗП | 17 МЗП |
  | п. 10 | harmful food | 40 МЗП | 25 МЗП |
  | п. 20 | breach of consumer-information rules | 15 МЗП | 10 МЗП |
  | п. 21 | altering accompanying information | 15 МЗП | 10 МЗП |
  | п. 22 | non-compliant labelling without a threat to health | 5 МЗП | 3 МЗП |
  | п. 23 | «ненадання інформації споживачеві щодо речовин … які спричиняють алергічні реакції» | 30 МЗП | 20 МЗП |

  Source: [Закон № 2042-VIII](https://zakon.rada.gov.ua/laws/show/2042-19)
- Law 2639-VIII, ст. 6 ч. 9: when foods «пропонуються до реалізації … нефасованими, якщо пакування … здійснюється безпосередньо в місці продажу на прохання споживача або якщо харчові продукти упаковуються чи фасуються в місці продажу для подальшої реалізації кінцевим споживачам у цьому місці продажу, обов’язковою для надання у спосіб, визначений оператором ринку харчових продуктів, є така інформація: 1) назва харчового продукту; 2) [алергени за додатком № 1]» — [Закон № 2639-VIII, ред. 16.09.2026](https://zakon.rada.gov.ua/laws/show/2639-19)
- Law 2639-VIII, ст. 6 ч. 10: for non-prepacked foods, ingredients, quantities, the date, storage conditions, operator, origin, instructions and nutrition «надається на вимогу споживача … у супровідній документації чи в інший спосіб» — [Закон № 2639-VIII](https://zakon.rada.gov.ua/laws/show/2639-19)
- Law 2639-VIII, ст. 17 ч. 2 п. 1: nominal quantity is not mandatory for foods «маса чи об’єм яких визначається у присутності покупця». ст. 18 date formats: «Краще спожити до…» / «Краще спожити до кінця…» for minimum durability; «вжити до…» for microbiologically perishable foods, marked on each prepacked unit; day-month for ≤3 months, month-year for 3–18 months, year for >18 months. Exemptions include fresh fruit and vegetables, drinks of 10 % ABV and above, and bread eaten within 24 h — [Закон № 2639-VIII](https://zakon.rada.gov.ua/laws/show/2639-19)
- Law 2639-VIII, ст. 5: an operator not responsible for the information «не мають права здійснювати обіг харчових продуктів, щодо яких вони мають інформацію, що ці харчові продукти не відповідають законодавству» and must not change accompanying information in a misleading way. Liability is via Law 2042-VIII (ст. 30, amended by 4718-IX of 16.12.2025) — [Закон № 2639-VIII](https://zakon.rada.gov.ua/laws/show/2639-19)
- Transitional: foods compliant with the pre-2019 rules may still be produced and placed on the market during martial law and for 6 months after it (розд. VI п. 2, Law 2572-IX) — [Закон № 2639-VIII](https://zakon.rada.gov.ua/laws/show/2639-19)
- Price-tag repricing for markdowns, including the «П» mark for partial loss of quality — [Інструкція № 2 п. 11](https://zakon.rada.gov.ua/laws/show/z0004-97)

### Inferences
- The grocery vertical needs:
  - batch or lot-level expiry tracking (date type «вжити до» or «краще спожити до») on receiving;
  - a hard **block at checkout** for an expired batch where the scanned identifier allows it (scale or in-store labels with a date, or GS1 DataBar/2D codes);
  - a «near-expiry» markdown workflow that reprices before the date;
  - a write-off reason «прострочено».

  The repo's café vertical already has vertical-specific write-off reasons (`VerticalDefinition.writeoffReasons`).
- In-store scale labels and packed goods: print at least the name and allergens. Weight, price per kg and total are practical requirements of the price-tag rules. Packing date and «вжити до» are advisable because expired-goods fines attach to the date.
- Future 3153-IX discount rules (§5) will also govern how near-expiry «знижка» is shown.

### Gaps
- No ДПС or Держпродспоживслужба guidance was found on scale-label content for in-store packed goods beyond ст. 6 ч. 9.
- The 2026 МЗП amount was not verified, so the fines were not converted to UAH.

---

## 7. Selling on credit to regular customers («в борг», «під запис»)

### Takeaway
Selling goods on credit, with deferred or instalment payment, is expressly lawful under the Civil Code (ст. 694–695), for both ФОП and ТОВ. Law 265/95 links the fiscal receipt to the **settlement operation**, which it defines as accepting cash, cards or other payment instruments. It also requires a receipt «при отриманні товарів … на повну суму проведеної операції». The most defensible reading is to fiscalise when payment is received, with the goods' handover documented separately; this was **not confirmed by ДПС**. An interest-free shop tab is not «споживчий кредит» under Law 1734-VIII, which covers money lent by banks and financial institutions. With interest it becomes ПКУ «товарний кредит» or «торгівля у розстрочку». The ДПС format has payment form code 3 «Кредит» and partial-payment types (передплата / остаточний розрахунок / чергова сплата). Checkbox exposes only CASH/CASHLESS payment types plus prepayment chains.

### Cited Findings
- «Договором купівлі-продажу може бути передбачений продаж товару в кредит з відстроченням або з розстроченням платежу. … Товар продається в кредит за цінами, що діють на день продажу». If payment is late, the seller may demand the unpaid goods back, and interest accrues under ст. 536. The seller holds a pledge on the goods until paid (ст. 694). For instalments the essential terms are price, order, terms and amounts of payments (ст. 695) — [Цивільний кодекс України ст. 694–695, ред. 05.08.2026](https://zakon.rada.gov.ua/laws/show/435-15)
- «розрахункова операція - приймання від покупця готівкових коштів, платіжних карток, платіжних чеків, жетонів тощо за місцем реалізації товарів (послуг), видача готівкових коштів за повернутий покупцем товар …» (ст. 2). ст. 3 п. 1: settle «на повну суму покупки» through РРО/ПРРО. ст. 3 п. 2: give the person who receives goods, «включаючи ті, замовлення або оплата яких здійснюється з використанням мережі Інтернет, при отриманні товарів (послуг) в обов’язковому порядку розрахунковий документ … на повну суму проведеної операції» — [Закон № 265/95-ВР](https://zakon.rada.gov.ua/laws/show/265/95-%D0%B2%D1%80)
- ст. 3 п. 12: keep stock records and sell only goods recorded there. The ФОП exemption covers non-VAT single-taxers except sellers of technically complex goods, medicines and jewellery — [Закон № 265/95-ВР](https://zakon.rada.gov.ua/laws/show/265/95-%D0%B2%D1%80)
- Consumer credit law: «кредитодавець - банк або інша фінансова установа, яка відповідно до закону має право надавати споживчі кредити»; «споживчий кредит (кредит) - грошові кошти, що надаються споживачу … на придбання товарів». It does not cover «договори позики, що не передбачають сплати процентів чи будь-яких інших платежів» (ст. 3 ч. 2 п. 2) — [Закон «Про споживче кредитування» № 1734-VIII, ред. 30.07.2026](https://zakon.rada.gov.ua/laws/show/1734-19)
- Tax definitions:
  - ПКУ 14.1.245 «товарний кредит»: goods transferred into ownership «на умовах договору, що передбачає відстрочення остаточних розрахунків на визначений строк та під процент»;
  - ПКУ 14.1.249 «торгівля у розстрочку»: «на умовах розстрочення кінцевого розрахунку, на визначений строк та під процент», with goods transferred at the first instalment and title passing at final payment; «Правила торгівлі у розстрочку фізичним особам установлюються Кабінетом Міністрів».

  Source: [ПКУ](https://zakon.rada.gov.ua/laws/show/2755-17)
- ДПС XML format:
  - `PAYFORMCD` «0–Готівка, 1–Банківська картка, 2-Попередня оплата, 3-Кредит, …»;
  - `PARTPAYTYPE` «1-Передплата, 2-Остаточний розрахунок, 3-Чергова сплата»;
  - `PARTPAYORDPREPAYNUM` is «Фіскальний номер чека часткової сплати типу "Передплата" (для типів часткової сплати 2 та 3)».

  Source: [ДПС sample `check01(Опис всіх елементів).xml`](https://github.com/p2p-sys/OpenPRRO/tree/fbf0543aa64c83e2707ba8245a58a9a323317285/utils/examples)
- Receipt row 18: payment form «ГОТІВКА», «БЕЗГОТІВКОВА» or «ІНШЕ», with the amount and currency — [Положення № 13](https://zakon.rada.gov.ua/laws/show/z0220-16)
- Checkbox:
  - `PaymentType` enum `CASH`, `CARD` (obsolete) and `CASHLESS`;
  - the cashless `label` list (gift certificate, coupon, card, integrator payment, ННПП transfer, internet acquiring, current account, e-money, crypto …) has **no "Кредит" label**;
  - prepayment chains: `POST /api/v1/prepayment-receipts` «Створення чека передплати», `POST /api/v1/prepayment-receipts/{relation_id}` «Створення додаткових чеків передплати та чека післяплати» and `…/return`.

  Source: [Checkbox OpenAPI](https://api.checkbox.in.ua/api/openapi.json)

### Inferences
- Practical design for «під запис»:
  - keep a customer account (accounts receivable) in the POS;
  - at handover, record the goods in a non-fiscal «відпуск в борг» document signed or acknowledged by the customer, which serves the stock-accounting duty (ст. 3 п. 12) and ЦК ст. 694;
  - when the customer pays (cash or card), issue the fiscal receipt for the paid goods, full amount and real names.

  This matches the statutory definition of a settlement operation (**inference; needs ДПС confirmation**).
- The alternative, fiscalising at handover with payment form «Кредит», exists in the ДПС format but not in Checkbox's payload. It would require a provider that can send `PAYFORMCD 3`, followed by a cash receipt when the debt is repaid. Treat as unsupported via Checkbox.
- Do not charge interest or fees on tabs. That would bring in ПКУ «товарний кредит» and possibly financial-services regulation.
- Excise goods on credit look risky. Law 265/95 ties excise sales to programming mode and stamp entry at the settlement operation, and the 18+ check happens at handover. Consider blocking excise items on tabs (**inference**).

### Gaps
- **ДПС ЗІР explanations on «продаж в борг / з відстроченням платежу» could not be retrieved** (zir.tax.gov.ua unavailable, search budget exhausted). Both the timing of the receipt and the risk that inspectors treat an undocumented handover as «непроведення розрахункової операції» remain unconfirmed.
- The Cabinet «Правила торгівлі у розстрочку» (ПКУ 14.1.249) were not retrieved.

---

## 8. Programmes touching the till: Національний кешбек, єПідтримка

### Takeaway
Only one statutory trace was confirmed: ПКУ excludes «кешбек» received under the Cabinet's experimental project «щодо надання державної грошової допомоги покупцям товарів та послуг українського виробництва у рамках Всеукраїнської економічної платформи "Зроблено в Україні"» from personal taxable income for **2024 and 2025** (added by Law 4015-IX of 10.10.2024). The Cabinet resolution, the retailer requirements (fiscal receipt data, barcodes or УКТЗЕД, any «made in Ukraine» marking in receipts) and єПідтримка rules could not be retrieved.

### Cited Findings
- «До складу загального місячного (річного) оподатковуваного доходу платника податку за 2024 та 2025 податкові (звітні) роки не включається дохід у вигляді державної грошової допомоги (кешбеку), отриманий у рамках реалізації експериментального проекту щодо надання державної грошової допомоги покупцям товарів та послуг українського виробництва у рамках Всеукраїнської економічної платформи "Зроблено в Україні", затвердженого Кабінетом Міністрів України» (added by Law 4015-IX of 10.10.2024) — [ПКУ розд. XX підрозд. 1 п. 35](https://zakon.rada.gov.ua/laws/show/2755-17)
- The Checkbox OpenAPI 2.106.4 snapshot has no cashback-specific or «Ukrainian-made» fields (searched for кешбек / cashback / made_in_ukraine) — [Checkbox OpenAPI](https://api.checkbox.in.ua/api/openapi.json)

### Inferences
- If the programme matches purchases from fiscal-receipt data, which the ПКУ wording does not say, the POS's existing practice of sending the product **barcode** (`barcode`, receipt row 8) and exact product names to the ПРРО is the likely prerequisite (**speculative; verify**).

### Gaps
- Not found or verified: the Cabinet resolution establishing «Національний кешбек» (number, date, current wording); whether shops must register; whether receipts must carry the GTIN, УКТЗЕД or a «зроблено в Україні» sign; whether the programme continues in 2026 (the ПКУ exemption covers 2024–2025 only). madeinukraine.gov.ua returned 503 and the Diia URLs tried were 404 or not found.
- No information was found on єПідтримка at the till.

---

## 9. VAT and tax letters on food receipts; the 5 % retail excise

### Takeaway
VAT rates are 20 % (default), 0 % (exports etc.), **7 %** (medicines and medical devices in the state register, plus listed cultural, hotel and sports services) and **14 %** only for supply or import of УКТ ЗЕД 1001, 1003, 1005, 1201, 1205, 1206 00 (wheat, barley, maize, soya, rapeseed, sunflower seed). **Baby food and infant goods on a Cabinet list are VAT-exempt.** The receipt shows a letter per rate («ПДВ» line per tax group). Letters are not fixed by law; Checkbox gives each organisation its own codes and symbols.

The **5 % retail excise is still in force** (ПКУ 215.3.10). Retailers pay it on beer and alcohol (base: price incl. VAT, excluding the excise itself). For tobacco and e-liquids it is paid by manufacturers and importers (ПКУ 213.1.14, since Law 1914-IX). It is credited to local community budgets. It appears as a second tax on the line and as its own receipt row.

### Cited Findings
- ПКУ 193.1: rates of 20 %, 0 %, 7 % and 14 %.
  - 7 %: «постачання … лікарських засобів, дозволених для виробництва і застосування в Україні та внесених до Державного реєстру лікарських засобів, а також медичних виробів …», plus listed cultural services, hotel accommodation (55.10) and tickets to sport events.
  - 14 %: «сільськогосподарської продукції, що класифікується за такими кодами згідно з УКТ ЗЕД: 1001, 1003, 1005, 1201, 1205, 1206 00».

  Source: [ПКУ, ред. 17.09.2026](https://zakon.rada.gov.ua/laws/show/2755-17)
- ПКУ 197.1.1: VAT-exempt «постачання продуктів дитячого харчування та товарів дитячого асортименту для немовлят за переліком, затвердженим Кабінетом Міністрів України» — [ПКУ](https://zakon.rada.gov.ua/laws/show/2755-17)
- Receipt rows:
  - row 21 (VAT payers): «окремим рядком літерне позначення ставки ПДВ, розмір ставки ПДВ у відсотках, загальну суму ПДВ … на початку рядка друкуються великі літери «ПДВ»»;
  - row 22: the excise line for retail excise payers;
  - the rows repeat per tax group and may be omitted when the amount is zero (п. 8);
  - row 11: the VAT letter on each goods line;
  - non-VAT payers print «ІД» + tax number (row 5), VAT payers «ПН» (row 4).

  Source: [Положення № 13](https://zakon.rada.gov.ua/laws/show/z0220-16)
- Retail excise:
  - ПКУ 215.3.10: «Для пива, алкогольних напоїв, тютюнових виробів, тютюну … рідин, що використовуються в електронних сигаретах, реалізованих відповідно до підпунктів 213.1.9 і 213.1.14 … ставка податку становить 5 відсотків» (wording of Law 1914-IX of 30.11.2021);
  - payers (212.1.11) are retailers selling excise goods «крім тютюнових виробів, тютюну … рідин»;
  - for tobacco and e-liquids the object is sale by manufacturers or importers (213.1.14, added by 1914-IX) at maximum retail prices (214.1.5);
  - base for retailers (214.1.4): «вартість (з податком на додану вартість та без урахування акцизного податку з реалізації суб’єктами господарювання роздрібної торгівлі підакцизних товарів)».

  Source: [ПКУ](https://zakon.rada.gov.ua/laws/show/2755-17)
- Budget: «акцизний податок з реалізації суб’єктами господарювання роздрібної торгівлі підакцизних товарів» is revenue of the general fund of village, settlement and city community budgets (ст. 64 ч. 1 п. 16). Transitional п. 17-4 routes the last tobacco retail-excise period (March 2022) under the pre-01.04.2022 rules — [Бюджетний кодекс, ред. 01.01.2026](https://zakon.rada.gov.ua/laws/show/2456-17)
- ДПС worked example (two taxes on one line): wine 10 l × 25.99 = 259.90, `LETTERS АГ`. Excise «Г» 5 %: `SOURCESUM 259.90`, `SUM 12.38` (= 259.90 × 5/105). VAT «А» 20 %: `SOURCESUM 247.52` (= 259.90/1.05), `SUM 41.25` (= 247.52 × 20/120). So the VAT base excludes excise — [ДПС sample `check01(Два податки).xml`](https://github.com/p2p-sys/OpenPRRO/tree/fbf0543aa64c83e2707ba8245a58a9a323317285/utils/examples); repo analysis `TechDocs/prro/dps/document-structures.md`
- Checkbox: `GoodDetailsPayload.tax` accepts up to 2 tax codes per good, and tax codes are per organisation via `/cashier/tax` (a VAT-registered organisation exposes more codes than the sandbox's single «Без ПДВ» / «Є») — [Checkbox OpenAPI](https://api.checkbox.in.ua/api/openapi.json); repo fixture `src/__tests__/fixtures/checkbox/cashier_tax.json`

### Inferences
- Per-product tax configuration is needed:
  - VAT code (20 % / 7 % / exempt; 14 % is almost never relevant to retail);
  - an excise flag that adds the store's 5 % excise code as the second tax on beer and alcohol lines;
  - no retailer excise on tobacco and e-liquid lines.

  The repo's current fiscal design applies one store-wide `default_tax_code` per receipt (CLAUDE.md: «Still per-store, not per-line»). The grocery vertical must make tax codes **per line**.
- A shop that sells baby food or pharmacy-type goods (7 %) needs at least two VAT letters on one receipt.

### Gaps
- Whether a VAT-registered grocery's Checkbox organisation has a ready-made excise 5 % code (and which letter) was not verified.
- The Cabinet list for the VAT-exempt baby food was not retrieved.

---

## 10. Packaging, packaging waste and a deposit-return system

### Takeaway
No packaging law in force was found. The framework Law «Про управління відходами» (2320-IX) says extended producer responsibility for packaging waste is to be «встановлюється законом» (i.e. a separate law), and lists «впровадження депозитних схем» among economic instruments. Nothing in the current text obliges a shop to take back bottles or cans, or a till to handle deposits. The status of the packaging and deposit bills could not be checked.

### Cited Findings
- «Розширена відповідальність виробника встановлюється законом щодо виробників продукції, у результаті споживання/використання якої утворюються відходи упаковки, електричного та електронного обладнання, батарей і акумуляторів …» (ст. 10 ч. 1). The EPR element of ст. 10 ч. 3 п. 1 «набирає чинності через сім років після встановлення законом розширеної відповідальності виробника» (Прикінцеві п. 1) — [Закон «Про управління відходами» № 2320-IX, ред. 02.03.2026](https://zakon.rada.gov.ua/laws/show/2320-20)
- Economic instruments include «4) впровадження депозитних схем та інших заходів для заохочення ефективного збирання використаних продукції та матеріалів» (ст. 56 ч. 1) — [Закон № 2320-IX](https://zakon.rada.gov.ua/laws/show/2320-20)
- The current text (edition 02.03.2026) contains no reference to a law «Про упаковку та відходи упаковки» — [Закон № 2320-IX](https://zakon.rada.gov.ua/laws/show/2320-20)

### Inferences
- No POS impact today. If a deposit system is introduced, the till will likely need a separate non-taxable «застава» line and a refund flow. The fiscal treatment would follow the new law and Положення № 13 updates, so keep the line model extensible (**speculative**).

### Gaps
- The number and status of the packaging law or bill and of any deposit-return bill (2025–2027) could not be determined. The search budget was exhausted, and the waste law's current text has no cross-reference.
