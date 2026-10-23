# POS for small shops and grocers: Europe (CEE emphasis), Latin America, Australia/NZ. Products, weighed goods, fiscal UX (2024–2026)

_Provenance tags used throughout:_
- **[P-f]**: primary source (vendor, regulator, certificate), page fetched and read.
- **[P-s]**: primary source seen only as a search-engine snippet or summary; the page was not opened.
- **[S-f]**: second-hand source (press, blog, reseller, review aggregator), fetched.
- **[S-s]**: second-hand source, snippet only.
- **[R]**: user review quoted verbatim from a fetched review page. The gloss is mine.
- **[BG]**: background knowledge not re-verified in this session. Treat it as a lead, not a fact.

_Research limits:_ the WebSearch budget (shared by all agents this turn) ran out about 45 searches in. After that I could only fetch pages whose URLs I already had. Several products (SumUp POS, Lightspeed, Shopify POS, Subiekt/InsERT, Comarch, Mercado Pago Point, Bling, Kounta, Tyro) and several fiscal regimes (Polish CRK transmission, Romania, Moldova, the Baltics, Mexico CFDI, Colombia POS electrónico) are therefore listed under Gaps rather than researched. A follow-up turn could fill them. PDF text for a few documents was extracted locally with a raw-stream script, which lost Czech diacritics. Where I restored them by hand, I say so.

## 1. Central/Eastern Europe (closest to Ukraine): which POS do small food shops use, with customer counts where published?

### Takeaway
Small food retail in CEE runs on local, dealer-sold systems built around national fiscal devices and certified scales:
- **Poland:** Insoft **PC-Market/PC-POS** has "ponad 33 000" customers. Insoft sits in the Comp group.
- **Czechia:** **Dotykačka** has more than 25,000 active users. It is Android-only, works offline and sells everything by subscription. Scales are connected through certified partner procedures.

Data for the Baltics (Erply) and Bulgaria (Microinvest) is thinner but points the same way. A grocery POS in this region is expected to bundle the fiscal device, label or checkout scales, automatic reordering, price-change schedules and (in Poland) deposit-return handling.

### Cited Findings

#### Poland
- **PC-Market scale and installed base (Insoft):**
  - The grocery page says the software is used by **"ponad 33 000"** (over 33,000) customers, from single shops to chains.
  - It lists **"wagi etykietujące"** (label-printing scales) among compatible devices.
  - It claims "współpraca z większością urządzeń wiodących producentów urządzeń fiskalnych (kasy, drukarki)" (works with most fiscal devices of the leading makers, registers and printers).

  [P-f] [insoft.com.pl/spozywcze](https://www.insoft.com.pl/spozywcze)
- **PC-Market grocery features on the same page:**
  - An optional module for "automatycznego generowania zamówień" (automatic order generation from a target number of days of stock cover).
  - "Harmonogram Zmian Cen" (a price-change schedule used to prepare promo leaflets).
  - PC-Loyalty: points on cards, coupons and 3-for-2 deals.
  - "ponad 80 raportów" (80+ reports).
  - No mention of expiry dates or supplier EDI.

  [P-f] [insoft.com.pl/spozywcze](https://www.insoft.com.pl/spozywcze)
- **Insoft homepage:**
  - PC-Market and PC-POS are ready for KSeF (Poland's national e-invoicing system) "w trybie online, wsadowym oraz offline24".
  - "W programach PC-Market oraz PC-POS przygotowane zostały integracje z COMP DRS" plus the operator Zwrotka.pl, i.e. deposit-return-system integrations.
  - Separate pages exist for butchers (/miesny), self-checkout (/samoobsluga), a price checker (/sprawdzarka), a mobile stock-taking app (/inwentaryzator) and a "Serwer kasowy" that manages a network of fiscal cash registers.

  [P-f] [insoft.com.pl](https://www.insoft.com.pl/)
- **Ownership:** Comp S.A. holds 52% of Insoft, per Comp's subsidiaries table. [P-s] [comp.com.pl](https://comp.com.pl/?p=6705)
  - [BG] Comp also owns the fiscal-device makers Novitus and Elzab. If so, the PC-Market plus fiscal-printer ecosystem is one group. Verify.
- **Virtual (software-only) cash registers, "kasy wirtualne":**
  - They are allowed only for taxpayer groups listed in a Ministry of Finance regulation: taxi or car with driver, relocation, passenger transport, hotel/lodging/camping, catering.
  - **Ordinary retail shops are not on the list**, so a Polish grocer needs a hardware online register or fiscal printer.

  [S-s] [ifirma.pl](https://www.ifirma.pl/blog/wirtualne-kasy-fiskalne-kto-moze-z-nich-skorzystac/)
- **Ministry of Finance position in 2025:**
  - The software-register model "nie może być traktowany jako uniwersalne rozwiązanie" (cannot be treated as a universal solution).
  - A June 2025 letter to KIGEIT considered software registers for vending machines.
  - The letter references an obligation "od kwietnia 2027 r." to use registers in those branches regardless of turnover.

  [P-s] [MF letter to KIGEIT, 30 Jun 2025](https://kigeit.org.pl/FTP/bu/sdfur/2025_06_30%20mf_do_kigeit_vending.pdf); [P-s] [Sejm interpellation answer](https://api.sejm.gov.pl/sejm/term10/interpellations/attachment/ATTDLFB4G/i11748-o1.pdf)
- **Market context:** more than 3,000 shops closed in Poland in 2023, mostly small ones, while chains kept expanding (Rzeczpospolita, reported March 2024). [S-s] [rp.pl](https://www.rp.pl/handel/art39086911-sklepy-w-polsce-zaczely-sie-juz-wzajemnie-zjadac)

#### Czech Republic
- **Dotykačka (banky.cz review, dated 9 Feb 2024):**
  - **"přes 25 000 aktivních uživatelů"** (over 25,000 active users) in the Czech Republic.
  - Licences: SNADNO "od 425 Kč měsíčně", NAPLNO "od 859 Kč měsíčně", NEOMEZENĚ "od 1386 Kč měsíčně".
  - Listed advantages:
    - "plná funkčnost i při výpadku internetu" (full functionality during an internet outage)
    - "jednoduché a rychlé ovládání" (simple, fast operation)
    - "nonstop technická podpora v ceně" (24/7 support included)
    - "jeden dodavatel pokladny i terminálu" (one supplier for the till and the card terminal)
    - "více než 75 chytrých nástrojů v jednom" (more than 75 smart tools in one)
    - a built-in stock system
  - Listed disadvantages:
    - "software podporuje pouze zařízení s operačním systémem Android" (Android devices only)
    - "patří Dotykačka k těm s vyšší měsíční sazbou" (one of the higher monthly rates)
    - "společnost nenabízí časově neomezenou licenci" (no perpetual licence)
  - Accessories on offer include "obchodní váhy apod." (trade scales etc.).

  [S-f] [banky.cz](https://www.banky.cz/clanky/recenze-platebniho-systemu-dotykacka-a-shrnuti-jeho-hlavnich-vyhod-a-nevyhod/)
- **Earlier and other Dotykačka counts:**
  - About 10,000 active users in CZ and 42,000 app downloads worldwide (undated, probably older). [S-s] [penize.cz](https://www.penize.cz/fintech-startupy/dotykacka)
  - Dotykačka and its parent Solitea serve "more than 30,000 commercial users in Central Europe". The release announces a Polish card-payment network for Dotykačka users, so the product also sells in Poland. Undated. [P-s] [eService.pl press release](https://www.eservice.pl/en/aktualnosci/polands-largest-cashless-payment-network-available-for-dotykacka-users)
  - The merger with One Pub gave 12,000 combined clients (EET era). [S-s] [e15.cz](https://www.e15.cz/byznys/trh-s-eet-pokladnami-se-nasycuje-dotykacka-se-spoji-s-one-pub-1336907)
- **A connected scale is a certified "system", not a plug-in.** The scale vendor LESAK (Brno, profivahy.cz) publishes a 2023 procedure on Dotykačka's own manual site. Its title, with diacritics restored by me, is "Postup pro provedení EU posouzení shody u vah s neautomatickou činností TSCALE a pokladního systému Dotykačka" (procedure for the EU conformity assessment of TSCALE non-automatic scales together with the Dotykačka POS).
  - It applies to TSCALE scales of model series QTP/QSP/ZTP/ZSP.
  - **Turnkey variant ("na klíč"):**
    - A LESAK technician visits within about a week and inspects the scale and the POS.
    - The scale gets a new type plate. The POS gets an identification label "dle platného Certifikátu o hodnocení SW" (per the valid software-evaluation certificate).
    - Scales placed on the market before 2019 get a chip and firmware swap.
    - LESAK files the request with **ČMI** (the Czech Metrology Institute), which performs the EU verification of the scale and POS system on site within about 30 days.
    - Price: **12,500 Kč** excl. VAT for scales placed on the market from 2019, or **13,500 Kč** for older ones.
  - **Cooperation variant:**
    - The customer ships the scale. LESAK adjusts it, checks the RS232 interface and makes the type plate and a "VOID" anti-tamper label for the POS.
    - The customer installs a utility from the Dotykačka app market, connects the system, checks that the POS receives data from the scale, and sends three photos.
    - ČMI then assesses the system on site.
    - Price: **7,300 Kč** or **8,300 Kč** excl. VAT.

  [P-f; text extracted locally, diacritics lost] [manual.dotykacka.cz LESAK PDF](https://manual.dotykacka.cz/dokumentace/Postup-pro-propojení-LESAK-a-Dotykačka-2023.pdf)
- **Official metrology guidance:** the Czech metrology office (ÚNMZ) publishes a guide on selling food by weight. It notes that the same principles apply to any goods sold by weight. [P-s] [unmz.gov.cz guide](https://unmz.gov.cz/files/metrologie/v%C3%BDstupy%20z%20PRM/uvv-vii-20-18-obchod-web.pdf)
- **Mettler Toledo:** the Czech brochure for the UC-CT-M scale says third-party checkout applications can run on it and it can be integrated into existing IT. [P-s] [mt.com CZ brochure](https://www.mt.com/dam/MT-CZ/Brochures/RET/22022819_DS_UC-CT-M_cz_male.pdf)

#### Slovakia
- **eKasa offers two kinds of register:**
  - **ORP** (online registration register): hardware and software in one device.
  - **VRP** (virtuálna registračná pokladnica): **free of charge**, provided by the Financial Administration after registration. It runs on an internet-connected PC, laptop or tablet with a printer, and sales data goes straight into the Financial Administration's system.
  - Trade-off: some peripherals cannot be paired with a VRP.
  - These are older articles from 2015–2019; check the current rules.

  [S-s] [podnikajte.sk](https://www.podnikajte.sk/dane/ekasa-virtualna-online-registracna-pokladnica)
- eKasa offline behaviour is covered under question 3.

#### Baltics (Estonia, Latvia, Lithuania)
- **Erply homepage:**
  - Positioning: "Whether you run one store or five hundred"; "ERPLY supports single-location independents, multi-store retailers, franchises, and larger chains."
  - Offline: "Stay connected, even offline"; "Run in-store and online selling from one system, even when the internet drops."
  - Data hosting in the US, Canada, EU, Australia and Africa. Regional sites for Estonia, Finland, the UK, Denmark, Sweden, Canada, Australia and NZ.
  - **No grocery or scale claims** on the homepage.

  [P-f] [erply.com](https://erply.com/)
- **Erply history:**
  - Founded in 2009 in Tallinn, with development still in Tallinn. HQ is listed in some places as Bonita Springs, FL and in an older (2017) release as New York. [S-s] [erpresearch.com](https://erpresearch.com/erp-add-ons/pos/erply); [S-s] [pr.com, 2017](https://www.pr.com/press-release/717320)
  - "100K stores on its platform" dates from **2013**, so it is old. [S-s] [TechCrunch 2013](https://techcrunch.com/2013/04/11/erply-milestone-profitability)

#### Bulgaria
- **Microinvest:** founded in 1984 "as the first software developer in Eastern Europe", HQ in Sofia, "around 300 dealers in 18 countries". [S-f] [Wikipedia](https://en.wikipedia.org/wiki/Microinvest)
- **Grocery use:** a Bulgarian grocery-trade blog says Microinvest's "Warehouse Pro" (Склад Pro) is widely used by grocery shops, independent supermarkets and food retailers. The same blog mentions Datecs fiscal devices required under **Ordinance N-18**. [S-s] [grocerytradenews.com](https://grocerytradenews.com/10-retail-technology-companies-bulgaria/)

### Inferences
- In Poland and Czechia the vendors that win small grocers ship one dealer-installed bundle: till software, the nationally certified fiscal device, scale integration, reordering and loyalty. PC-Market's feature list is effectively the CEE grocery checklist:
  - label scales and fiscal devices
  - automatic reorder by days of cover and a price-change schedule
  - loyalty
  - DRS deposits (kaucja)
  - a price checker, mobile stock-taking and self-checkout
- Dotykačka's review pros and cons show what owners weigh: offline operation and included 24/7 support on one side; device lock-in (Android only) and subscription-only pricing on the other.
- A Ukrainian POS adding grocery should expect owners to ask "which scales work and who certifies the setup", not just "can I weigh". The Czech case shows that a POS which computes price from live weight puts the shop into a paid, on-site metrology verification of about 7,300–13,500 Kč (my conversion at about 25 CZK/EUR is €290–540).

### Gaps
- Subiekt (InsERT), Comarch and the Novitus/Elzab POS ecosystems: no data gathered (search budget).
- Polish online-register (kasa online) transmission to the CRK (central repository), including its offline buffer: not verified.
- Which POS Slovak, Romanian and Moldovan small food shops use; Romania's ANAF-connected AMEF registers; Moldova's rules; Lithuania's i.EKA and Latvia's register rules: not researched.
- Bulgarian SUPTO (the software-register requirement under Ordinance N-18) and whether Microinvest is certified under it: search failed.
- No 2025–2026 customer count for Dotykačka or Erply. Erply grocery references not found.

## 2. Western Europe: SumUp POS, Zettle, ready2order, Lightspeed, Epos Now, ICRTouch, Tillhub, Hiboutik, Shopify POS. Strengths for small food retail

### Takeaway
Of the products I could check, the UK grocery-oriented systems are the only ones with explicit scale stories:
- **ICRTouch** claims UK Weights & Measures approved scales, weight- or price-embedded barcodes and an "eco scales" mode for zero-waste shops.
- **Epos Now** sells an Avery Berkel FX120 that prices the item as soon as it is weighed.
- **TillTech** added Brecknell scales in July 2025.

The app-first products (Zettle, Hiboutik, and on its homepage ready2order) sell on simplicity, a free or cheap entry tier and fiscal compliance, not on weighing. Reviews of Zettle, Epos Now and ready2order complain about outages, app crashes mid-service, chat-only support and contract or cancellation friction.

### Cited Findings
- **ICRTouch (UK)** (all from search snippets of vendor marketing, not independently verified):
  - TouchPoint scales are "UK weights & measures approved" and "fully compatible with a wide range of scales". [P-s] [ICRTouch convenience & grocery](https://icrtouch.com/sectors/retail/convenience-grocery)
  - The farm-shop brochure says the till works with scales using weight-based or product-embedded barcodes. It "can add an item to the transaction total as soon as it has been weighed", with no separate barcode scan. [P-s] [Farm Shops brochure 2023](https://icrtouch.com/wp-content/uploads/Farm-Shops_Brochure_2023-WEB-6pp.pdf)
  - An optional **"eco scales"** setup "makes it easy to sell weighted products when customers bring their own containers". [P-s] [ICRTouch farm shops](https://icrtouch.com/sectors/retail/farm-shops)
  - The ICRTouch page itself returned 503 when fetched, and its brochure PDF had no extractable text.
- **Epos Now (UK):** sells the Avery Berkel FX120 scale. Once set up, "the POS automatically calculates the price when an item is weighed". No Trading Standards approval statement was found on the page. [P-s] [eposnow.com scale page](https://www.eposnow.com/us/store/hardware/accessories/avery-berkel-scalesfx1320/)
- **TillTech (UK):** announced a Brecknell scales integration in July 2025. [P-s] [till.tech](https://www.till.tech/insights/breknell-scales-integration)
- **Zettle by PayPal:** Trustpilot 3.4/5 from 5,752 reviews; the profile does not reply to negative reviews. [R] [trustpilot.com/review/zettle.com](https://www.trustpilot.com/review/zettle.com) Representative reviews (all GB):
  - "Real time reports are innaccurate, showing ghost sales from my inventory." (19 Sep 2026; the reviewer was moving to Square)
  - "To be told to uninstall and reinstall the app during a busy service is ridiculous!" (Bill B, 2 Oct 2026)
  - "when we need support it's slow as only chat." (Ravneet, 17 Sep 2026)
  - "there is no way to refund customers unless you have money in the Zettle Account." (14 Sep 2026)
  - "Honestly this company has gone downhill since paypal purchased them." (Tim, Oct 2026)
- **ready2order (Austria):** Trustpilot (AT) 4.4 from 603 reviews. [R] [at.trustpilot.com/review/ready2order.com](https://at.trustpilot.com/review/ready2order.com)
  - Positive:
    - „Ich habe immer gute Erfahrungen mit dem Support gemacht. Immer freundlich und zuverlässig." (Anke, 3 Oct 2026) (always good experiences with support, friendly and reliable)
    - „lediglich über die elektronischen Rechnungen um 10€/Monat lässt sich streiten" (B. Wopienka, 28 Sep 2026, 5★) (only the €10/month for e-invoices is debatable)
  - Negative:
    - „Bei einer Kündigung ist auf einmal alles anders!" (V. Krause, 13 Oct 2026, 1★) (once you cancel, everything is suddenly different). After cancelling, the reviewer had to submit the annual receipt check (the RKSV Jahresbeleg) themselves.
    - „Kartzahlung werden immer wieder abgebrochen." (M. Kronhardt, 11 Oct 2026, 1★) (card payments keep getting aborted)
  - No review mentioned scales (Waage) or offline.
- **Hiboutik (France), homepage:**
  - Fiscal and invoicing: "Hiboutik est conforme à la législation française sur les caisses sécurisées avec le certificat NF525" and "gère la facturation électronique et le e-reporting".
  - Pricing: "GRATUIT" plus "Options payantes facultatives" (free, optional paid add-ons).
  - Connectivity: runs on "PC, Mac, Ipad, tablette...ou tout autre matériel connecté à Internet". Offline is not mentioned.
  - Stock: "Suivez votre stock en temps réel et recevez des alertes avant la rupture".
  - Customers: "équipe plusieurs milliers de commerçants" (several thousand merchants).
  - A "Logiciel de caisse caviste et épicerie" page exists, but scales and selling by weight are not mentioned.

  [P-f] [hiboutik.com/fr](https://www.hiboutik.com/fr/)
- **Tillhub (Germany):**
  - A review site lists its hardware as iPad, scanner, card readers, receipt printer, cash drawer, customer display and stand. **No scale.** [S-s] [fuer-gruender.de](https://www.fuer-gruender.de/wissen/unternehmen-fuehren/buchhaltung/kasse/kassensystem/tillhub/)
  - A German delicatessen's software tender lists "Waagenanbindung" (scale connection) next to till and merchandise management as a requirement. [S-s] [softguide.de tender](https://www.softguide.de/ausschreibungen/feinkosthaus-sucht-warenwirtschaft-gross-und-einzelhandel)
  - Tillhub's own 2025 feature PDF could not be read (no extractable text).
- **Square (Europe):** Square's French help centre documents label-printing scales. The scale prints a barcode with the SKU plus the price or weight, and items need **a five-digit SKU matching the scale's**. [P-s] [Square FR help 7419](https://squareup.com/help/fr/fr/article/7419-scanning-bar-codes-from-label-printing-scales-on-point-of-sale)

### Inferences
- For a small food shop in Western Europe, the realistic split is:
  - (a) app POS (Zettle, Hiboutik, SumUp-class) plus a label-printing scale whose barcodes the POS decodes; or
  - (b) a UK-style grocery EPOS (ICRTouch, Epos Now, TillTech) that reads live weight from an approved scale.
- Product (b) is where "weigh and it's in the basket" UX lives: ICRTouch adds the item as soon as it is weighed. Its "eco scales" (bring-your-own-container, i.e. tare) mode is a modern bulk-food feature worth noting.
- Review complaints cluster on reliability at peak (crashes, outages, no status communication) and on support channels, not on missing features. A grocery vertical lives or dies on peak-hour reliability.

### Gaps
- **SumUp POS** (the former Goodtill/Tiller, [BG]), **Lightspeed Retail**, **Shopify POS**: scale support, offline and pricing not verified (search budget).
- **ready2order** and **Tillhub** scale support: no evidence either way.
- ICRTouch's approval claim is unverified (no certificate seen). Epos Now's Trading Standards status is unknown.

## 3. Fiscal compliance as UX: TSE/KassenSichV, RKSV, kasy online, Italy's RT, Czech EET (and EET 2.0), Slovak eKasa, Brazil's NFC-e. Lessons for Ukraine's ПРРО

### Takeaway
Every regime that works for small shops lets the cashier keep selling during an outage and marks the receipt visibly:
- Austria: "Signaturerstellungseinheit ausgefallen"
- Germany: "TSE unavailable" on cloud-TSE receipts
- Slovakia: a signing code instead of the receipt UID
- Brazil: "NFC-e EMITIDA EM CONTINGÊNCIA"

The software then catches up within a deadline (48 h in Austria and Slovakia, about 24 h in most Brazilian states) and alerts the owner, never the cashier, when a report is due. The backlash cases are about paper and burden, not about technology:
- Germany's 2020 receipt obligation (Bonpflicht) buried bakeries in receipts.
- Czechia's EET was abolished and is returning in 2027 without a mandatory receipt and with a free state app.
- Italy's 2026 rule links card terminals to fiscal registers. Fiscal and payment data are being reconciled automatically.

### Cited Findings

#### Germany (KassenSichV, § 146a AO)
- **Obligations:** individual recording, a **TSE** (certified technical security device), data backup, a **receipt obligation (Belegausgabepflicht)** and a notification duty to the tax office. They "gelten grundsätzlich für alle Kassensysteme", i.e. regardless of shop size. [S-s] [DFKA paper, status 1 Aug 2020](https://static.helpjuice.com/helpjuice_production/uploads/upload/image/9021/direct/1636031067959-DFKA-Neue-gesetzliche-Anforderungen-Stand-2020-08-01.pdf)
- **Fines** of up to €25,000 for non-compliant registers (KPMG, 2026). [S-s] [KPMG brochure](https://assets.kpmg.com/content/dam/kpmgsites/de/pdf/Themen/2026/01/kpmg-taxsolution-cash-register-health-check-de.pdf.coredownload.inline.pdf)
- **Outage behaviour:**
  - With a **cloud TSE**, the register may keep being used during a temporary internet outage. Receipts carry the note "TSE unavailable", and the issue must be fixed promptly. [P-s, vendor] [travelmanager docs](https://docs.travelmanager.de/en/docs/allgemein/sicherheit-mit-cloud-tse)
  - A **hardware TSE** works offline. [P-s, vendor] [quad.de FAQ](https://quad.de/FAQ)
- **efsta middleware docs:** "The further use of the POS system without a TSE after 01.01.2020 is forbidden"; their middleware "enables a failure free operation in case of a TSE absence (Offline Mode)"; "a QR code is not required by fiscal law"; "If no QR code is printed on the receipt, a DSFinV-K export and a TSE export must be provided". [P-f, vendor] [docs.efsta.eu](https://docs.efsta.eu/efr/DE/fiscal)
- **Bonpflicht backlash** (from 2020; old facts, but the lesson stands):
  - Baker Michael Tenk (Südlohn) left about 500 uncollected receipts in front of his counter in protest. [S-s] [utopia.de](https://utopia.de/baecker-protestiert-gegen-kassenbonpflicht-167438)
  - Trade press headline: "Sinnlose Zettelwirtschaft" (pointless paper-shuffling). [S-s] [hogapage.de](https://www.hogapage.de/nachrichten/politik/branchenpolitik/erster-frust-ueber-die-kassenbonpflicht/)
  - A baker in Eutingen replaced paper with a QR "Umweltbon" (eco-receipt). [S-s] [hogapage.de](https://www.hogapage.de/nachrichten/politik/branchenpolitik/wie-ein-baecker-clever-die-bonpflicht-umgeht/)
  - The paper industry replied that receipts can go into waste paper. [S-s] [apotheke-adhoc.de](https://www.apotheke-adhoc.de/nachrichten/detail/politik/papierindustrie-gibt-entwarnung-kein-extra-muelleimer-fuer-bons-registrierkassengesetz/)
  - Claims seen in the same set of snippets, without a firm attribution to one page among those listed:
    - The bakers' federation (Zentralverband des Bäckerhandwerks) criticised the bureaucracy, the costs and the waste, and estimated 5 billion extra receipts a year in the bakery trade.
    - A Dresden bakery said a paper roll that used to last 3–5 days now runs out at least once a day.

#### Austria (RKSV)
- **Outage note and 48-hour rule:** when the till cannot reach the signature unit, receipts print **"Signaturerstellungseinheit ausgefallen"** (signature creation unit failed). If the note appears continuously for **more than 48 hours**, the owner must report it to the tax office in FinanzOnline:
  - Eingaben → Registrierkassen → "Ausfall oder Außerbetriebnahme melden".
  - The start of the failure is the date and time of the first receipt that carried the note.
  - The report is mirrored in the fiskaltrust portal.
  - A recommissioning report follows once the unit works again.
  - Article updated 4 Aug 2026.

  [P-f, vendor help] [orderbird help](https://orderbirdpro.helpjuice.com/en_US/basis-paket-ausfallmeldung-see)
- **Managed option:** users of fiskaltrust's "Sorglos-Paket" only need to reconnect within 7 days, and fiskaltrust forwards the report for them. [P-s, vendor] (same orderbird help site)
- **Legal basis:** under § 17(1) RKSV, a failure that is not merely temporary must be reported without delay. [S-s] [RSM newsletter, older](https://www.rsm.global/austria/sites/default/files/media/events/sondernewsletter_registrierkassen.pdf); primary text in the [BMF Handbuch Registrierkassen](https://finanzonline.bmf.gv.at/eLearning/BMF_Handbuch_Registrierkassen.pdf) (not opened).
- **Exit friction:** a ready2order reviewer said that after cancelling they had to do the annual receipt check themselves. [R] [Trustpilot](https://at.trustpilot.com/review/ready2order.com)

#### Italy (registratore telematico (RT) + POS link from 2026)
- **Agenzia delle Entrate press release, Rome, 5 March 2026:**
  - The link between telematic registers (RT) and electronic payment instruments was "reso obbligatorio dalla Legge di Bilancio 2025 per le operazioni effettuate dal 1° gennaio 2026" (made mandatory by the 2025 Budget Law for transactions from 1 Jan 2026).
  - "Non si tratta di un collegamento fisico, ma di un abbinamento tramite un servizio online" (not a physical link but an online pairing). The merchant or an intermediary associates the RT serial number with the payment instruments that the financial operators have already reported.
  - It also works for merchants who use the Agenzia's web procedure instead of an RT.
  - Deadlines: for POS in use on 1 Jan 2026, 45 days, i.e. **by 20 April 2026**. A new POS is linked from the 6th day of the second month after it starts working (a POS starting in March is linked between 6 and 31 May).

  [P-f; extracted from PDF] [Agenzia press release](https://www.informazionefiscale.it/IMG/pdf/011_com._st._servizio_collegamento_registratori-pos_05.03_2026.pdf)
- **Scope and sanctions:**
  - Scope covers hardware and software payment instruments (apps, online platforms). E-invoices are excluded. [S-s] [agendadigitale.eu](https://agendadigitale.eu/documenti/collegare-pos-e-registratore-telematico-istruzioni-per-luso); [S-s] [quifinanza.it](https://quifinanza.it/fisco-tasse/pos-collegato-registratore-cassa/930511/)
  - One source reports fines of up to €4,000 for not linking (single source, unverified). [S-s] [lentepubblica.it](https://lentepubblica.it/cittadini-e-imprese/2026-multa-4000-euro-per-chi-non-collega-pos-registratore-telematico/)

#### Czech Republic (EET abolished; EET 2.0 from 1 Jan 2027)
- **Forvismazars summary (fetched):**
  - The new duty covers "tzv. kontaktní platby" (in-person payments) "bez ohledu na platební metodu" (regardless of payment method).
  - Taxpayers register as one or more "evidenční jednotky" and receive "EET certifikáty" to authenticate the data.
  - Effective from 1 Jan 2027.
  - Sanctions of up to 500,000 Kč.
  - The government approved the bill in May 2026, and it was then in the Chamber of Deputies.

  [S-f, professional firm] [forvismazars.com](https://www.forvismazars.com/cz/cs/prehledy/posledni-novinky/pripravte-se-na-navrat-eet-od-1.-ledna-2027)
- **From search snippets** (the exact page for each quote among these sources is not pinned):
  - The Chamber approved the bill in July 2026 and it went to the Senate.
  - "EET 2.0 začne platit pro všechny podnikatele najednou hned 1. ledna 2027" (it applies to all businesses at once from 1 Jan 2027).
  - Remote payments (bank transfers, e-shops) are excluded.
  - "účtenka nebude povinná (vytiskne se jen na vyžádání), evidence poběží na běžném mobilu, tabletu nebo pokladně a nejmenší podnikatelé dostanou software zdarma (aplikace Moje EET)" (no mandatory receipt, printed only on request; runs on an ordinary phone, tablet or till; the smallest businesses get free software, the Moje EET app).
  - Certificates are issued in DIS+ in November 2026; the free Moje EET web app arrives in December 2026; one source mentions test operation from 1 Dec 2026.
  - Flat-tax ("paušální daň") micro-businesses that meet the conditions need not send continuously.
  - The opposition calls it "zbytečnou byrokratickou zátěž pro drobné živnostníky" (a needless bureaucratic burden for small tradespeople).

  [S-s] sources: [dostupnyadvokat.cz](https://dostupnyadvokat.cz/blog/snemovna-schvalila-navrat-elektronicke-evidence-trzeb); [fakturoid.cz](https://www.fakturoid.cz/almanach/legislativa/eet); [finance.cz](https://www.finance.cz/aktuality/vlada-schvalila-novou-verzi-eet-ktera-ma-byt-spustena-od-1-ledna-2027/); [e15.cz](https://www.e15.cz/finexpert/danove-priznani/eet-2-0-leden-2027-zivnostnici-firmy-1436505); [banky.cz](https://www.banky.cz/clanky/navrat-eet-po-ctyrech-letech-dve-tretiny-cechu-jsou-pro-system-startuje-v-roce-2027/)
- **Original EET:** the banky.cz headline speaks of a return "po čtyřech letech" (after four years). [BG] The original EET ended on 1 Jan 2023.

#### Slovakia (eKasa)
- **What happens offline** (podnikajte.sk article dated 18 Apr 2019, so older):
  - The register waits **2 seconds** for the receipt's unique identifier (UID). If none comes, it "naďalej funguje v off-line režime" (keeps working offline).
  - The offline receipt shows a code of the entrepreneur (the article: "podpisový kód podnikateľa") instead of the UID.
  - "Pri dočasnom výpadku internetu musíte údaje odoslať do eKasa systému do 48 hodín" (after a temporary outage, data must be sent within 48 hours, counted from the first failed attempt).
  - Premises with no internet at all can apply for a postponement. Data then goes in "najneskôr do 30 dní" (within 30 days at most).

  [S-f] [podnikajte.sk](https://www.podnikajte.sk/dane/ekasa-nefunguje-internet)
- **Other details, quoted by guides from FAQ-style numbered items** (exact page not pinned):
  - Other guides call the offline code OKP.
  - The same 48 h rule applies to "VKLAD"/"VÝBER" (cash in/out) and "NEPLATNÝ DOKLAD" (void) documents.
  - Messages are about 3 kB, so a 2G/EDGE link suffices.

  [S-s] [Stormware POHODA eKasa PDF](https://stormware.sk/dnload/ekasa/eKasa_praca_v_programe_POHODA.pdf); [S-s] [ASOL eKasa letter](https://wiki.helios.eu/sk/test/images/1/14/ASOL_Letter_eKasa.pdf)

#### Poland (kasy online)
- Only the virtual-register limits were verified (question 1). CRK transmission details are under Gaps.

#### Brazil (NFC-e contingency): the closest analogue to ПРРО offline mode
- **How contingency works:**
  - When SEFAZ (the state tax authority) does not answer, the PDV (point of sale) issues the NFC-e locally with **tpEmis = 9**, sometimes on a contingency series.
  - The printed DANFE (the consumer receipt) must carry **"NFC-e EMITIDA EM CONTINGÊNCIA"** plus the date and time the contingency started.
  - The XML is transmitted later with the same access key, usually **within 24 h** or by the next business day depending on the state.
  - Frequent contingency use draws tax-office attention.
  - Not every state accepts it; a SEFAZ-run contingency environment also exists.

  [S-s] [Focus NFe](https://focusnfe.com.br/blog/nfc-e-em-contingencia-como-emitir-e-detalhes-para-aprovacao/); [S-s] [NotaGateway](https://notagateway.com.br/?p=2157); [S-s] [ACBr forum](https://www.projetoacbr.com.br/forum/topic/93366-conting%C3%AAncia-nfc-e-como-manter-as-vendas-no-ar-quando-a-sefaz-cai/). The official MOC (the NFC-e technical manual) was not checked.

#### France (anti-fraud POS certification)
- Hiboutik advertises NF525 certification as a headline feature, and handles e-invoicing and e-reporting. [P-f] [hiboutik.com/fr](https://www.hiboutik.com/fr/)

### Inferences
These are lessons for ПРРО (Ukraine's software fiscal register).
1. **Offline is normal and must be visible on paper but silent at the till.** Every mature regime marks offline receipts with a fixed phrase or code and gives a catch-up window (48 h in Austria and Slovakia, about 24 h in Brazil, up to 30 days on request in Slovakia). The best UX keeps the cashier selling. The deadline and the "report this outage" duty go to the owner as an alert, and the software files when it can (fiskaltrust forwards Austrian outage reports automatically). The current ПРРО design in this repo (server-held offline sessions, tax-office codes, replay) maps onto this pattern. The extra UX worth adopting is an owner-facing countdown: "N receipts not yet registered, deadline in X h".
2. **Receipt burden backfires.** Germany's Bonpflicht created waste and anger. Czechia's EET 2.0 makes the receipt **on request only**, adds a free state app for the smallest businesses and accepts any device. A Ukrainian POS should make the e-receipt (QR, SMS or Viber) a first-class, one-tap path and paper optional where the law allows.
3. **Cross-matching payments with fiscal data is coming.** Italy now pairs card terminals with fiscal registers online (2026). A POS that already runs card payment and fiscal registration in one flow (one sale, one document, one payment record) is protected against mismatches that a regulator can now see.
4. **Exit and annual duties are UX too.** Austria's annual receipt (Jahresbeleg) and outage reports, and Germany's DSFinV-K/TSE exports, are owner chores. Vendors that do them silently are praised; vendors that hand them back are punished in reviews (the ready2order cancellation review).
5. **Certification as marketing.** NF525 in France and "UK W&M approved" in the UK are sold as features. A "ПРРО-ready, works offline" badge plays the same role.

### Gaps
- Germany's notification duty via ELSTER (from 1 Jan 2025): [BG] a BMF letter of 28 Jun 2024 started it, with systems in use before 1 Jul 2025 due by 31 Jul 2025. Not verified (search budget).
- Poland: online-register transmission interval to the CRK, offline buffering and what the cashier sees. Not verified.
- Italy: RT receipt (documento commerciale) basics and the "lotteria degli scontrini" were not re-verified. Provvedimento of 31 Oct 2025, prot. 424470, was not opened.
- Czechia: the Senate outcome on EET 2.0 as of Oct 2026 is unknown.
- Hungary, Romania (AMEF/ANAF), Bulgaria (N-18/SUPTO), Lithuania (i.EKA), Mexico (CFDI "factura global"), Colombia (electronic POS document), Chile (boleta electrónica): not researched.

## 4. Weighed goods: scale integration, scale brands, PLU export, EU legal metrology (NAWI/OIML R76/WELMEC 2.2), unit-price rules (98/6/EC) and shelf labels

### Takeaway
There are two architectures:
- **(A) Label-printing scale plus embedded-weight or embedded-price EAN-13** (prefix 2x or 02, 5-digit PLU/SKU). The POS only decodes. Hike, Loyverse and Square label scales work this way, and it is the low-regulation path.
- **(B) Live weight streamed into the POS**, which computes the price. In the EU this makes the POS part of a legal-metrology "system" under EN 45501 and WELMEC 2.2:
  - In Czechia that means an on-site ČMI verification costing 7,300–13,500 Kč.
  - In Denmark the certificate obliges the POS to drive the scale's own unit-price and price-to-pay displays (with defined refresh behaviour) over a named protocol.
  - In Australia it means NMI-approved combinations, a visible NMI sticker, an on-site inspection and a printed receipt that marks any manual weight entry.

Unit price per kg or litre is mandatory in the EU (98/6/EC). Since 2022 any announced discount must also show the lowest price of the previous 30 days (Art. 6a), which hits markdown and shelf-label features directly.

### Cited Findings

#### Legal metrology (EU, plus certificate examples)
- **WELMEC Guide 2.2** is the guide for testing POS devices connected to non-automatic weighing instruments (NAWIs) for direct sales to the public.
  - It covers **price-computing POS** (the POS receives only weight and calculates the price) and non-price-computing variants that exchange unit price, total price or **PLU codes** with the scale.
  - EN 45501 requirements apply to every device performing those functions, "whether integrated in an instrument or manufactured as a separate unit".
  - It follows WELMEC 2.5's modular approach.
  - The current edition is **Issue 3, May 2007**, still valid.

  [P-s] [WELMEC 2.2 PDF](https://welmec-upgrade.bs.ptb.de/welmec/documents/guides/2.2/WELMEC_Guide_2.2_v2007_Issue_3.pdf) (the fetch failed with 503/401); Czech translation by ÚNMZ: [P-s] [unmz.gov.cz](https://unmz.gov.cz/files/metrologie/v%C3%BDstupy%20z%20PRM/WELMEC%202-2-web.pdf)
- **OIML Bulletin 2026 (vol. LXVII no. 3)** describes WELMEC 2.2 as practical and test-oriented. It covers free-programmable and non-free-programmable POS devices and is "based on the evaluation of a defined POS configuration and its interfaces". [P-s] [oiml.org bulletin](https://www.oiml.org/en/publications/oiml-bulletin/2026-03/20260306)
- **Danish OIML R76 certificate R76/2006-A-DK2-20.01 Rev. 1** (FORCE Certification A/S, signed 27 Jan 2026), for Tscale Electronics (Kunshan) models DL/DSP/DSW, accuracy class III:
  - "DSP is equipped with a pole rear display with three windows, showing unit price, total price, and weight". DSW has a one-window weight pole display.
  - Interfaces are RS232, USB and Bluetooth (optional). Approved legal software is v1.11 or v1.14.
  - "The DSP scale may be connected to a POS system, if the POS system fulfil the following requirements": conditions tied to the weight being non-zero, and that "the DSP is configured to the following protocol: DL CON2".

  [P-f; partly extracted, some words lost] [oiml.org certificate](https://www.oiml.org/en/files/pdf_c/r76-2006-dk2-2020-01-rev1.pdf)
  - The search-engine summary of the certificate states the conditions in full: the POS must use the scale's **unit-price and price-to-pay displays**, refresh the unit-price display whenever weight goes from zero to non-zero, update the price-to-pay display **at least every second** while weight is non-zero, and use a listed protocol ("DL CON2 or CAS"). [P-s] (same URL; the "or CAS" may come from the 2020 original revision)
  - This is the same TSCALE family that LESAK certifies with Dotykačka (question 1).
- **UK-issued OIML R76 certificates:**
  - A scanner scale has an additional LCD customer/operator display as part of the approved pattern.
  - Another says remote pole displays "may be replaced by alternative 'Primary Weight Indication' on an approved EPOS customer/operator display".
  - A self-serve-keyboard variant may have the customer display disabled.

  [P-s] Among the oiml.org GB1 certificate files, e.g. [r076-2006-gb1-2020-10](https://oiml.org/en/files/pdf_c/r076-2006-gb1-2020-10.pdf), [r076-2006-gb1-2017-06](https://oiml.org/en/files/pdf_c/r076-2006-gb1-2017-06.pdf). The exact file was not pinned.
- [BG] OIML R76-1 has specific requirements for instruments used for direct sales to the public: primary indications visible to the customer and simultaneous display of weight, unit price and price to pay for price-computing instruments. Not re-verified this session.

#### Australia (NMI)
- **NMI supplementary certificates for POS systems interfaced with scales** (issued against the NMI M7 pattern-approval specification):
  - The POS takes measurement data from the scale's output interface and prices via a **PLU** facility.
  - Where weight is typed in manually, **the printed transaction record must show it was entered manually**.
  - Preset tare up to scale maximum; totals of measured and non-measured items.
  - Examples: [S626 Scale Components](https://www.industry.gov.au/sites/default/files/nmi/certificates-approval/S626.pdf), [S648 Weightrax](https://www.industry.gov.au/sites/default/files/nmi/certificates-approval/S648.pdf); an interim approval for myPOS ([PS672](https://www.industry.gov.au/sites/default/files/nmi/certificates-approval/PS672_Int.pdf)) was valid only until 27 Feb 2015, so check current status.

  [P-s]
- **Square Australia** supports the CAS PD-2 USB scale, which "needs to be in ECR-5 mode to work properly":
  - "This sticker [NMI certification] must be placed in a clearly visible spot on the device running the Square Point of Sale or Retail POS app."
  - Sellers on Square Stand, Register or Android "need a physical receipt printer to stay compliant".
  - "An on-premise inspection by an NMI-approved technician is required before you trade", and licensee and other fees apply.
  - "USB scale connection is not compatible with iOS devices using Square Reader."
  - "Your point of sale app can only connect to one scale at a time."
  - Not supported in the Restaurants, Invoices or Appointments apps.

  [P-f] [Square AU help 6691](https://squareup.com/help/au/en/article/6691-connect-a-scale-to-your-point-of-sale). Units are g, kg and oz. [P-s] [Square AU help 6694](https://squareup.com/help/au/en/article/6694-sell-items-by-weight)

#### Embedded-barcode (label-scale) implementations
- **Hike POS:**
  - "Scales cannot be connected directly." Hike accepts only pre-weighed items or printed labels.
  - EAN-13 and UPC-A barcodes; prefixes "2, 20, or 02"; layout YYCCCCCPPPPPX with a 5-digit SKU, and weight read as the digits divided by 1,000.
  - "The Price Embedded or Weight Embedded mode is a global setting" (not per product).
  - Syncing prices to scales: "No. To sync price changes with scales, you'll need to build an integration using the Hike API."

  [P-f] [Hike help](https://help.hikeup.com/portal/en/kb/articles/use-weight-mbadded-bar-code-in-hike)
- **Loyverse:**
  - "Barcodes with embedded weight" is switched on in Back Office → Features.
  - EAN-13 with prefix "20" or "02", or UPC-A with prefix "2". Layout: 5-digit SKU + 5-digit weight in grams + checksum ("01750" = 1.750 kg).
  - The item must be "Sold by weight", or scanning errors out.

  [P-s] [Loyverse help: embedded weight](https://help.loyverse.com/help/barcodes-with-embedded-weight)
  - Without such a barcode, the cashier types the weight: "Enter the actual weight (e.g., 2.8 for 2.8 kg)"; "Price per unit × Entered weight = Line total". No scale connection is described. [P-f] [Loyverse help: sell by weight](https://help.loyverse.com/help/how-sell-items-weight)
- **GS1 numbering rules:**
  - Prefixes **20–29** are Restricted Circulation Numbers, whose national use is set by each GS1 Member Organisation; variable-measure items are one such use. [P-s] [GS1 GSCN 23-006 RCN](https://www.gs1.org/docs/barcodes/GSCN-23-006-RCN.pdf)
  - GS1 UK: 20xxx/28xxx are for manufacturer-licensed variable-measure items, and "In store variable measure barcodes begin with the prefix 02". [P-s] [GS1 UK](https://gs1uk.org/knowledge-hub/barcodes/how-to-barcode-variable-measure-items)
  - GS1's per-country summary of 20–29 usage exists but returned 403. [P-s] [GS1 summary PDF](https://www.gs1.org/docs/barcodes/SummaryOfGS1MOPrefixes20-29.pdf)

#### Scale brands seen with POS integrations
- CAS: PD-2 (Square AU) and PDN2 (Tower Systems AU, "Clear operator and customer displays"). [P-f] [Tower Systems](https://www.towersystems.com.au/scale-integration)
- Avery Berkel FX120 (Epos Now). [P-s] [Epos Now](https://www.eposnow.com/us/store/hardware/accessories/avery-berkel-scalesfx1320/)
- Brecknell (TillTech, 2025). [P-s] [TillTech](https://www.till.tech/insights/breknell-scales-integration)
- TSCALE (Dotykačka via LESAK; Danish certificate above).
- Mettler Toledo UC-CT-M (open to third-party checkout apps). [P-s] [MT CZ brochure](https://www.mt.com/dam/MT-CZ/Brochures/RET/22022819_DS_UC-CT-M_cz_male.pdf)
- "Wagi etykietujące" (label scales) generically in PC-Market. [P-f] [Insoft](https://www.insoft.com.pl/spozywcze)

#### Unit price and discount display (EU)
- **Price Indication Directive 98/6/EC (official text not verified):** it requires a selling price and a **unit price** (per kg, litre, metre etc.); products sold in bulk show the unit price. [BG] The EUR-Lex fetch returned no text. [EUR-Lex ELI](https://eur-lex.europa.eu/eli/dir/1998/6/oj/eng)
- **Article 6a, inserted by the Omnibus Directive and applied since 28 May 2022:**
  - Any announced price reduction must show the **lowest price applied during at least the 30 days before the reduction**.
  - Member States may set different rules for goods that spoil quickly, and a shorter period for goods on sale less than 30 days.
  - The Commission's guidance says ordinary price fluctuations without a promotional announcement are not covered.

  [S-s] [Sellforte](https://sellforte.com/blog/omnibus-directive-how-does-it-impact-your-business); [S-s] [RPC Legal on the Commission guidance](https://rpclegal.com/snapshots/consumer/spring-2022/european-commission-publishes-guidance-on-price-promotions-under-the-omnibus-directive)

### Inferences
- **Support both architectures, defaulting to A.** Label-printing scales (CAS, DIGI, Dibal, Mettler, Bizerba class) plus decoding of prefix 2x/02 EAN-13 are what every small-shop POS in this survey supports, and they keep the POS outside the metrology perimeter.
  - Make the decoding **configurable per prefix** (weight-embedded vs price-embedded, PLU length, decimals). Hike's single global switch is a cited limitation.
  - Support **PLU export to the scale** (Hike lacks it, so its users must build it on the API). Otherwise the owner retypes prices on the scale and the two drift.
- **Architecture B needs a certified-system mindset.** If the POS computes price from live weight, it must:
  - drive or mirror a customer-visible display of weight, unit price and price to pay, with defined refresh behaviour (the Danish certificate);
  - speak a scale protocol the scale's certificate names (DL CON2, CAS ECR modes);
  - expect an on-site verification. In the EU this is national (ČMI-style); for Ukraine, check the local equivalent.
- **Default to marking manual weight entry on the receipt**, as NMI certificates require ("Loyverse-style" keypad entry would otherwise be non-compliant in Australia).
- **Shelf labels for a grocery vertical** should print the unit price (per kg or litre). For any markdown they should show "lowest price in the last 30 days". That needs a per-variant price history, which the existing markdown feature could record. If Ukraine harmonises with Art. 6a (a plausible EU-integration step), this becomes mandatory. That is my inference, not a sourced fact about Ukraine.
- **Bring-your-own-container (tare) mode** (ICRTouch "eco scales") is a cheap differentiator for bulk and zero-waste shops.

### Gaps
- WELMEC 2.2's exact clauses (customer display, rounding, receipt content for weighed items) and OIML R76-1's direct-sale clauses: the PDFs could not be fetched.
- DIGI, Dibal and Bizerba integration specifics, and their PLU export formats: no data.
- Per-country GS1 20–29 usage (Poland, Czechia, Ukraine etc.): the summary PDF was blocked (403).
- How specific vendors print unit prices on shelf labels: not found for any vendor in scope.
- UK Price Marking Order and unit-pricing changes: not researched.

## 5. Latin America: what tiny shops use (Loyverse, Clip, Mercado Pago Point, Bling/Stone/TON, abarrotes and mercadinho apps), cash-heavy workflows, fiado

### Takeaway
Tiny LatAm shops start from two directions:
- **Free or cheap POS apps.** Loyverse has 350,000+ active merchants in 170+ countries, a free core POS, offline sales recording and embedded-weight barcodes. Desktop licences such as Mexico's **eleventa** are aimed explicitly at abarrotes.
- **Acquirers' apps, which are becoming light POS.** Clip in Mexico (2.99% + $1 per sale, catalogue and inventory in the app, sales-based loans) and TON/Stone in Brazil (4.68M entrepreneurs, fees from 0.57%, 0% Pix, catalogues in the terminal).

None of the acquirer pages mention cash handling, offline mode, weighing or fiado. Fiscal UX in Brazil (NFC-e contingency, question 3) is the most transferable lesson for Ukraine.

### Cited Findings
- **Loyverse:**
  - Scale: "350,000+" active merchants, "170+" countries, "$31B" annual sales.
  - Pricing: "Loyverse POS is free to use, including Point of Sale, Sales Analytics (last 31 days), Essential Inventory Management", with "Optional paid add-ons".
  - Offline: "Loyverse POS keeps recording sales even without an internet connection". Integrated card payments still need internet.
  - The Customer Display and Kitchen Display apps connect over the local network and keep working without internet.
  - Lists "Grocery & Convenience" as a business type.

  [P-f] [loyverse.com](https://loyverse.com/)
- **Loyverse grocery page:**
  - "Receive emailed messages about the low stock and send purchase orders to suppliers from your Back office"
  - "Instantly identify your customers by scanning barcodes from loyalty cards"
  - Works with cash drawers and receipt printers.
  - Selling by weight is not mentioned on this page; it is in the help centre (question 4).

  [P-f] [loyverse.com/grocery-pos](https://loyverse.com/grocery-pos)
- **Loyverse reviews:** Trustpilot 3.1/5 from 106 reviews. [R] [trustpilot.com/review/loyverse.com](https://www.trustpilot.com/review/loyverse.com) Representative reviews:
  - "now charge 5 $ a month to use the more basic thing (downloading reports)." (21 Apr 2025, TH): a feature moved behind a paywall.
  - "It requires to use their servers to fully use the app, which isn't good." (14 Jun 2025, MY): dependence on the cloud.
  - "I have had issues with my pos system can't open and close shifts so a nightmare when you running a business." (1 May 2026, GB)
  - "When a POS system is essential to a business, customers deserve timely and professional support." (6 Sep 2026, JO)
  - "3 Weeks since this happened and still no effort or resolution from Loyverse/Teya to fix the problem they caused." (9 Dec 2024, GB)
  - No Latin American reviews were captured (Capterra ES returned 403).
- **eleventa (Mexico):**
  - Developed in Mexico since 2001 by Ing. Luis Carrasco and sold since 2007 by BAMBU CODE S.A.P.I. de C.V. Aimed at abarrotes, papelerías, farmacias and retail. [S-s] [comparasoftware.com](https://www.comparasoftware.com/eleventa-punto-de-venta)
  - Promoted as compatible with barcode scanners, **scales** and cash drawers. Promotional, model unconfirmed. [S-s] [elcontribuyente.mx 2023](https://www.elcontribuyente.mx/2023/04/factura-en-segundos-con-un-software-punto-de-venta-para-tu-negocio/)
  - 100-day free trial. [S-s] [wwwhatsnew.com](https://wwwhatsnew.com/?p=473565)
  - One Capterra review describes a lifetime licence without updates or support. [S-s] [Capterra](https://www.capterra.com/p/197855/Eleventa/)
- **Clip (Mexico):**
  - Terminals: "Punto de venta para mostrador" (Clip Stand 2), "Punto de venta móvil todo en uno" (Clip Total 3), Clip Plus 2, Clip Ultra and a "Kit punto de venta"; plus Tap to Pay and payment links.
  - Fees: "Comisión 2.99% + $1 por venta".
  - App: "Gestiona tu catálogo, inventario y cuenta digital desde la app"; "Inventario con IA".
  - Loans: "Adelantos de ventas y financiamiento a la medida para impulsar tu negocio", repaid "con tus ventas".
  - Abarrotes appear only in an image caption ("Dueño de una tienda de abarrotes sonriendo con su celular en mano").
  - No mention of cash acceptance, offline mode, selling by weight or fiado.

  [P-f] [clip.mx](https://clip.mx/)
- **TON (Stone, Brazil):**
  - Fees: "Maquininhas com taxas a partir de 0,57%".
  - Pix: "Pix 0% de verdade". Pix at the terminal is free for 30 days; after that it stays free only with a registered Pix key, otherwise "a taxa passa a ser 0,49% por venda".
  - "Catálogo Online" and "Catálogo na Maquininha".
  - "JUNTE-SE AOS 4.680.875 EMPREENDEDORES" (join the 4,680,875 entrepreneurs).
  - No PDV, stock, fiado or mercadinho mentions.

  [P-f] [ton.com.br](https://www.ton.com.br/)
- **Brazil fiscal:** NFC-e contingency issuing (tpEmis = 9, "NFC-e EMITIDA EM CONTINGÊNCIA", transmit within about 24 h); see question 3. [S-s] [Focus NFe](https://focusnfe.com.br/blog/nfc-e-em-contingencia-como-emitir-e-detalhes-para-aprovacao/)

### Inferences
- In cash-heavy, low-margin tiendas and mercadinhos the entry point is free, or bundled with the card acquirer, and phone-first. Payment providers are turning into light POS: catalogue on the terminal (TON), inventory in the app (Clip), loans repaid from sales (Clip).
- A Ukrainian grocery POS competes with terminal-bundled apps on price. It wins on offline selling, weighing and fiscal compliance, none of which those acquirer pages mention.
- The Loyverse review pattern (a free product moving features behind a paywall, cloud dependence, slow support) is the risk of a freemium model. Grandfathering existing users avoids the backlash seen in "now charge 5 $ a month".

### Gaps
- **Mercado Pago Point**, **Bling** (PDV), **Stone** POS apps, **Kyte**, **SICAR**, **MyBusiness POS**: not researched (search budget).
- Scale brands common in Mexico and Brazil (Torrey, Rhino, Toledo do Brasil, Filizola, Urano) and INMETRO rules for checkout scales: not researched.
- Cash workflows (counting, cash-up, change) and fiado features in these apps: no data. Credit ledgers are covered by another researcher.
- Mexico CFDI 4.0 "factura global", Colombia's electronic POS document, Chile's boleta electrónica: not researched.

## 6. Australia/New Zealand: Square AU, Lightspeed (Vend legacy), Kounta legacy, Hike, Idealpos (independent grocery and IGA), Tyro. Scale integration and reviews

### Takeaway
In Australia, scale-at-POS is shaped by the **NMI**: approved POS–scale combinations, a visible NMI sticker, an on-site inspection by an NMI-approved technician before trading, and a printed receipt (Square says Android/Stand users "need a physical receipt printer"). Vendor positions:
- **Square AU** supports one certified CAS PD-2 USB scale (Square POS and Retail apps only).
- **Hike** connects no scales at all; only embedded barcodes, with a global price/weight mode and PLU sync only through its API.
- **Idealpos** claims 10,000+ customers in 7 countries and lists Fruit & Vegetable, Convenience and Bottle Shops among its industries. Scales are certified for "accuracy in weight-based pricing".
- **Tower Systems** recommends a CAS PDN2 with customer display.

IGA stores are independently owned under Metcash's brand, and grocery-specialist POS like GaP Solutions target them.

### Cited Findings
- **Square AU** (scales): see question 4. [P-f] [Square AU help 6691](https://squareup.com/help/au/en/article/6691-connect-a-scale-to-your-point-of-sale)
  - Older community posts said USB scales were unsupported in Australia on Square for Retail, Square for Restaurants and Android. Those posts appear superseded by the current help centre. [S-s] [Square community](https://community.squareup.com/t5/Payments-Troubleshooting/Can-I-use-a-scale-with-Square-Point-of-Sale/m-p/273931)
- **Hike** (no direct scales): see question 4. [P-f] [Hike help](https://help.hikeup.com/portal/en/kb/articles/use-weight-mbadded-bar-code-in-hike)
  - Hike's Trustpilot profile is unclaimed with 0 reviews. [R] [trustpilot.com/review/hikeup.com](https://www.trustpilot.com/review/hikeup.com)
- **Idealpos:**
  - "trusted by over 10,000 customers throughout 7 countries globally".
  - Industries include Bottle Shops, Convenience, Fruit & Vegetable, Retail and "Franchise & Head Office Control"; "complex multi-site installations".
  - Scales are listed in hardware, and the system is certified for "accuracy in weight-based pricing".
  - Supermarkets and IGA are not named. Offline is not mentioned.

  [P-f] [idealpos.com.au](https://www.idealpos.com.au/)
- **Tower Systems (AU independents):**
  - "We recommend pairing our software with the CAS PDN2 scale", with "Clear operator and customer displays".
  - "Built to align with government standards, our solution helps ensure compliance".
  - Examples given: pet shops (bulk food and litter), produce stores, supermarkets, whole-food and home-brew shops.

  [P-f] [towersystems.com.au](https://www.towersystems.com.au/scale-integration)
  - Its blog claims the integration was "tested and approved by the federal government". [P-s] [Tower blog](https://blog.towersystems.com.au/?p=19665)
- **Impos (AU):** items flagged sold by weight receive quantity in kg from the attached scale. [P-s] [Impos help](https://learn.impos.com.au/hc/en-us/articles/115006243107-Items-Sold-by-Weight)
- **IGA Australia:** the brand is owned by Metcash's Food & Grocery division, and stores are independently owned and operated. [S-s] [Wikipedia](https://en.wikipedia.org/wiki/IGA_Supermarkets)
- **GaP Solutions:** markets "the most savvy retail scale and POS systems", with supermarket software used by some independent chains. Vendor claim on a payments partner's page. [P-s] [Zeller partner hub](https://www.myzeller.com/partner-hub/gap-solutions)
- **NMI POS-scale approvals** (manual entry flagged on the receipt, PLU pricing, tare): see question 4. [P-s] [NMI S626](https://www.industry.gov.au/sites/default/files/nmi/certificates-approval/S626.pdf)

### Inferences
- Australia shows the cost of the "live scale" path for the merchant: certified hardware, a sticker on the device, a paid inspection and a mandatory printed receipt. Square limits it to one scale model and two apps. A Ukrainian POS should present scale support as a short, explicit list of verified models with the paperwork step spelled out in-app, not as "works with any scale".
- Hike's position (no scales; global price/weight mode; PLU sync only via API) is a gap that grocery owners notice. Per-prefix embedded-barcode rules plus PLU export are a cheap way to beat it.

### Gaps
- **Lightspeed X-Series** (Vend legacy) and **Kounta** legacy weighed-item support, and **Tyro** POS integrations: not researched. [BG] Lightspeed bought Kounta (2019) and Vend (2021); unverified.
- NZ-specific players (dairies, Four Square/Foodstuffs) and NZ trade-measurement rules: not researched.
- Productreview.com.au reviews for Square/Hike: blocked (429) or not attempted.

## 7. Across all regions: most-praised UX moments, recurring complaints, pricing, offline, multi-store, supplier ordering, expiry/markdown. What a Ukrainian POS adding grocery should adopt

### Takeaway
What gets praised:
- full selling during an internet outage (Dotykačka; Loyverse's offline recording and local-network customer display)
- "weigh it and it's in the basket" (ICRTouch, Epos Now)
- included or fast support (Dotykačka 24/7; ready2order "freundlich und zuverlässig")
- quick setup (Epos Now "Within 24 hours…")

What gets complained about:
- peak-hour failures (Zettle crashes, Epos Now outages without communication)
- chat-only or slow support
- price changes on formerly free features (Loyverse)
- contract and cancellation friction, including fiscal chores handed back (ready2order)
- device lock-in and no perpetual licence (Dotykačka)

Grocery-specific depth (scales and PLU, reorder by days of cover, price-change schedules, DRS deposits, unit-price and 30-day prior-price labels, expiry or reduced-to-clear) is where generic app POS products are thin.

### Cited Findings
- **Praise:**
  - Dotykačka: "plná funkčnost i při výpadku internetu" (works fully during outages), "jednoduché a rychlé ovládání" (simple, fast), "nonstop technická podpora v ceně" (24/7 support included). [S-f] [banky.cz](https://www.banky.cz/clanky/recenze-platebniho-systemu-dotykacka-a-shrnuti-jeho-hlavnich-vyhod-a-nevyhod/)
  - Epos Now: "Within 24 hours everything was set up and working." (Lateral Art, 25 Sep 2026); "Cam sorted my issues with calm and professional manner" (21 Oct 2026). [R] [Trustpilot UK](https://uk.trustpilot.com/review/eposnow.com); TrustScore 4.4 from 26,862 reviews, 83% 5★ and 11% 1★.
  - ready2order: „Immer freundlich und zuverlässig." (always friendly and reliable). [R] [Trustpilot AT](https://at.trustpilot.com/review/ready2order.com)
- **Complaints:**
  - Epos Now: "The till system went down yesterday, with no communication from EposNow." (Keith Morgan, 20 Oct 2026); "…compared to the two weeks we were waiting for the issue to be resolved." (21 Oct 2026); "as I have been misinformed on a couple of things." (19 Oct 2026). [R] [Trustpilot UK](https://uk.trustpilot.com/review/eposnow.com)
  - Zettle: app crashes mid-service, inventory reports showing "ghost sales", chat-only support. [R] [Trustpilot](https://www.trustpilot.com/review/zettle.com)
  - Loyverse: paywalled reports, cloud dependence, slow support. [R] [Trustpilot](https://www.trustpilot.com/review/loyverse.com)
  - ready2order: cancellation friction and card payments aborting. [R] [Trustpilot AT](https://at.trustpilot.com/review/ready2order.com)
  - Dotykačka: Android-only, higher monthly rate, no perpetual licence. [S-f] [banky.cz](https://www.banky.cz/clanky/recenze-platebniho-systemu-dotykacka-a-shrnuti-jeho-hlavnich-vyhod-a-nevyhod/)
- **Pricing data points:**

  | Product | Price | Source |
  |---|---|---|
  | Dotykačka | from 425 / 859 / 1,386 Kč per month (Feb 2024) | [banky.cz](https://www.banky.cz/clanky/recenze-platebniho-systemu-dotykacka-a-shrnuti-jeho-hlavnich-vyhod-a-nevyhod/) |
  | Loyverse | core free, paid add-ons | [loyverse.com](https://loyverse.com/) |
  | Hiboutik | free, optional paid options | [hiboutik.com](https://www.hiboutik.com/fr/) |
  | Clip | 2.99% + $1 per sale | [clip.mx](https://clip.mx/) |
  | TON | from 0.57%; Pix 0% | [ton.com.br](https://www.ton.com.br/) |
  | ready2order | €10/month for e-invoices (per a review) | [Trustpilot AT](https://at.trustpilot.com/review/ready2order.com) |
  | Czech scale+POS verification | 7,300–13,500 Kč excl. VAT, one-off | [LESAK PDF](https://manual.dotykacka.cz/dokumentace/Postup-pro-propojení-LESAK-a-Dotykačka-2023.pdf) |

- **Offline claims:**
  - Dotykačka (above).
  - Loyverse: "keeps recording sales even without an internet connection", with local-network displays. [P-f] [loyverse.com](https://loyverse.com/)
  - Erply: "even when the internet drops". [P-f] [erply.com](https://erply.com/)
  - Hiboutik: browser-based, no offline claim. [P-f] [hiboutik.com](https://www.hiboutik.com/fr/)
- **Supplier ordering and stock:**
  - PC-Market: automatic order generation by days of cover. [P-f] [Insoft](https://www.insoft.com.pl/spozywcze)
  - Loyverse: low-stock emails and purchase orders. [P-f] [Loyverse grocery](https://loyverse.com/grocery-pos)
  - Hiboutik: stock-out alerts. [P-f] [Hiboutik](https://www.hiboutik.com/fr/)
- **Multi-store:**
  - Erply "one store or five hundred". [P-f] [erply.com](https://erply.com/)
  - Idealpos "Franchise & Head Office Control". [P-f] [Idealpos](https://www.idealpos.com.au/)
  - Insoft's separate chain console (Konsola Kupca). [P-f] [Insoft](https://www.insoft.com.pl/)
- **Promotions and markdown:**
  - PC-Market "Harmonogram Zmian Cen" and PC-Loyalty 3-for-2. [P-f] [Insoft](https://www.insoft.com.pl/spozywcze)
  - The EU 30-day prior-price rule applies to any announced reduction. [S-s] [Sellforte](https://sellforte.com/blog/omnibus-directive-how-does-it-impact-your-business)
- **Deposit return:** PC-Market integrates with the COMP DRS and Zwrotka.pl deposit operators. [P-f] [Insoft](https://www.insoft.com.pl/)

### Inferences
UX moments worth adopting in a Ukrainian POS adding a grocery vertical, ranked by evidence strength:
1. **Never stop selling.** Full offline sale, receipt and fiscal stamping, with a visible offline mark on the receipt and an owner-side countdown to the deadline (Austria, Slovakia and Brazil patterns, Dotykačka's praise). The repo's ПРРО offline design already aims here. Surface the deadline to the owner, not the cashier.
2. **Weighing without ceremony.**
   - Scan a label-scale barcode with per-prefix weight or price rules. Push PLUs and prices to the scale so nobody retypes them.
   - With a connected scale, the item lands in the basket the moment the weight is stable (ICRTouch).
   - Mark manual weights on the receipt (NMI).
   - Keep a customer-facing display of weight, unit price and price to pay (Danish certificate, Tower and Loyverse customer displays).
   - Offer a tare or bring-your-own-container mode (ICRTouch eco scales).
3. **Grocery back-office depth that app POS products lack:**
   - reorder by days of cover (PC-Market)
   - a price-change schedule that prints the new shelf labels with **unit price** and, for discounts, the **30-day lowest price**
   - expiry and "reduced to clear" stickers (gap: no vendor evidence gathered, but the markdown engine in this repo is a natural base)
   - deposit-return lines if Ukraine introduces a DRS (speculative)
4. **Make the receipt optional where the law allows.** QR or e-receipt first, which avoids Bonpflicht-style anger. Czechia's EET 2.0 shows regulators moving to receipts on request only.
5. **Honest pricing and support.** Do not paywall a previously free basic feature (Loyverse backlash). Offer phone or human support at peak hours rather than chat only (Zettle). Do fiscal chores (annual receipts, exports, outage reports) for the owner, including at exit (ready2order).
6. **Hardware freedom.** Dotykačka's "Android only" is its top con. A web, Windows/Tauri and Android spread is a selling point.

### Gaps
- Verbatim reviews from CEE grocers (Polish or Czech forums, Google reviews), LatAm abarrotes users (Capterra ES/MX were blocked) and AU/NZ grocers (Productreview): not captured. Dotykačka's Trustpilot page returned 404.
- Expiry-date, wastage and reduced-to-clear features: no vendor evidence gathered for ICRTouch, PC-Market, Erply or Idealpos (ICRTouch pages returned 503; brochure PDFs had no extractable text).
- Shopify POS, SumUp POS, Lightspeed Retail, Mercado Pago Point, Bling and Tyro: no data. They need a follow-up search turn.
