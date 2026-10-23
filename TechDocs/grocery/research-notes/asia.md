# Small-shop, mini-market and neighbourhood-grocery POS / shopkeeper apps in Asia (Japan, South Korea, China, India, Southeast Asia), state 2024–2026

Source tags used on every line: **[P]** primary (company site, press release, filing, official survey, the vendor's own app-store listing); **[V]** vendor marketing (primary but promotional — performance claims unverified); **[S]** second-hand (press, trade press, aggregator, blog); **[U]** user review (verbatim where quoted); **[X]** the fact comes from a search-engine extract of that URL, because the page itself could not be opened (403/encrypted PDF) or was not opened — lower confidence. "Old" = fact dated before 2024.

Method caveat for the writer: the shared web-search quota ran out mid-research, so Square Japan, Ubiregi, Keruyun, Meituan 收银, Aclas/Dahua/Hikvision AI scales, Qasir, GrabMerchant, JioMart Partner, Khatabook and Dukaan are **not** covered (listed under Gaps). Everything below was found and read (or flagged [X]).

## 1. Japan — Airレジ, スマレジ, Square, ユビレジ; semi-self checkout (セミセルフレジ); weighed goods and price-embedded barcodes

### Takeaway
Airレジ (Recruit) is the reference "free iPad POS" — 735,000 accounts by March 2023, the basic register free with no monthly fee, money made on Airペイ payments and the rest of the "Air" suite; users praise its simplicity and complain that it needs the network. Smaregi is the freemium cloud POS for retail (~19.9k stores on its two main paid plans and ~44.8k active stores in mid-2024). In small supermarkets the defining checkout UX is **semi-self**: staff scan, the customer pays at a separate payment machine. In 2025, 77.1% of supermarket companies had it against 41.7% with full self-checkout, and among 1–3-store operators it is about 62% against 12%. Weighed goods reach the till already priced on an in-store barcode (02/20 "NON-PLU"), so the checkout only scans.

### Cited Findings
**Airレジ (AirREGI, Recruit)**
- Free core: "基本レジ機能は0円、月額費用もかかりません" (basic register functions free, no monthly fee) with the caveat "※一部、有料機能がございます。" (some features are paid); you start on "お手持ちのiPad" (the iPad you already own); the page says an internet connection is required and describes no offline mode — [airregi.jp](https://airregi.jp/) [P, read Oct 2026]
- For retail the site highlights barcode reading, inventory, stock-taking, cost settings with sales analysis, and **"部門打ち"** (department-key entry: ringing an amount under a department instead of an item). Weighed goods are not mentioned — [airregi.jp](https://airregi.jp/) [P]
- Its current "No.1" claim rests on a Recruit-commissioned Macromill survey (14–20 Jan 2026, n=1,037): "いま一番選ばれているPOSレジアプリ" (the POS app most chosen right now). This is a survey share, not a user count — [airregi.jp](https://airregi.jp/) [P]
- Account count: "「Airレジ」、「Airペイ」はそれぞれ2023年3月時点でアカウント数73.5万と39.4万まで伸びているという。" (Airレジ 735k accounts, Airペイ 394k, as of March 2023). One AirID manages Airレジ, Airペイ and Airペイ QR; the article calls it "無料で使えるPOSレジアプリ" with "月額0円" — [paymentnavi, 2023-08-08](https://paymentnavi.com/paymentnews/133292.html) [S quoting Recruit; old]
- Earlier trajectory: 100k accounts about one year after launch (Nov 2014), around half of them restaurants — [ITmedia 2014](https://www.itmedia.co.jp/news/article/1411/27/1141127153/) [S, old]. 48.8万 accounts, "利用店舗数No.1", in an undated COVID-era Recruit factbook — [Recruit factbook PDF](https://airregi.jp/brand/solution/pdf/factbook_corona_08.pdf) [P, X, ~2020–21]
- Monetisation around the free register: Airペイ payments (promo: "iPad or iPhone only, card reader at no cost"), the Airレジ オーダー add-on, and Airウェイト / Airリザーブ / Airシフト — [airregi.jp](https://airregi.jp/) [P]
- User reviews, ITreview 4.3/5 (27 reviews) — [ITreview](https://www.itreview.jp/products/airregi/reviews) [U]:
  - 「商品登録や設定もシンプルで分かりやすい。」 — "Product registration and settings are simple and easy to understand." (restaurant, 2025-06-04)
  - 「電波のせいなのか、たまに反映されてないことがある。」 — "Sometimes changes don't show up, maybe because of the signal." (same reviewer)
  - 「すぐに扱えるシンプルなレジなので他のレジから乗り換えをした時に割とスムーズに移行できました。」 — "A simple register you can use right away, so switching from another one went fairly smoothly." (izakaya, 2025-03-27)
  - 「ログイン時やページを変更するときの時間がかかることが多いので…」 — "Login and page changes often take a long time…" (same reviewer)
  - 「電波状況が悪かったせいかレジが起動せずドロアが開かなくなりお釣りをお渡しするのに時間を要してお客様をお待たせしてしまった…」 — "Because of a poor signal the register would not start and the drawer would not open, so giving change took time and customers had to wait." (service business, 2024-02-10)
  - 「月額費用0円でレジが導入できる」 — "You can introduce a register at zero monthly cost." / 「詳しいデータ分析をするのはむずかしい。」 — "Detailed data analysis is difficult." (salon chain, 2024-01-26)
- Aggregator summaries: ITトレンド satisfaction 4.3 (15 reviews); support "split into too many departments"; reports of app glitches and connectivity trouble; iPad and printer cost extra — [ITトレンド](https://it-trend.jp/pos_system/13974/review/207023), [imitsu](https://saas.imitsu.jp/cate-pos-register/service/2687) [U/S, X]

**スマレジ (Smaregi, TSE 4431)**
- April 2024: paid-plan stores Premium 7,081 and Premium Plus 12,387; active stores, free plan included, 43,923 (~30.3% of all registrations) — [JPX disclosure, May 2024](https://www2.jpx.co.jp/disc/44310/140120240502581358.pdf) [P, X — the PDF returned 403 to my fetcher]
- June 2024: Premium 7,143 and Premium Plus 12,717 (≈19.9k on these two paid plans; the extract presents them as "of the paid plans", so any other paid tiers are not counted); active stores 44,843 — [JPX disclosure, Jul 2024](https://www2.jpx.co.jp/disc/44310/140120240703543496.pdf) [P, X]
- Monthly store-count disclosure ended with the October 2024 figures: "2024年11⽉6⽇発表予定の2024年10⽉度の情報をもって、店舗数の⽉次開⽰を終了することといたしました" — [JPX disclosure, Sep 2024](https://www2.jpx.co.jp/disc/44310/140120240910583202.pdf) [P, X]
- Revenue: Q1 FY4/2025 ¥2,531m (+38.8% YoY), H1 ¥5,152m (+30.5%) — [JPX disclosures](https://www2.jpx.co.jp/disc/44310/140120241213538331.pdf) [P, X]
- Smaregi is an iPad/iPhone cloud POS with an API for external systems; no source found on scale integration or weighed goods — [imitsu](https://saas.imitsu.jp/cate-pos-register/service/2684) [S, X]

**Semi-self checkout (セミセルフレジ / セルフ精算レジ)**
- How it works: staff do only the scanning, and "顧客自身が会計機で代金決済する" (customers pay at the payment machine themselves). Reporter's gloss: "顧客は自動販売機のように会計機にお金を入れて決済するだけです。" (the customer just puts money into the machine, like a vending machine). Maruetsu: "１・４倍程度スピードが上昇する" (about 1.4× faster than one person scanning and taking payment). Motive: "スーパー業界では人手不足が顕著になっている。" (labour shortages have become marked). The trial ran in about 10 stores — [NewsSwitch / Nikkan Kogyo, 2015-11-27](https://newswitch.jp/p/2772) [S, old]
- 2025 industry survey by the three supermarket associations (June–July 2025; 881 companies targeted, 286 responded = 32.5%; published Oct 2025) — [2025年スーパーマーケット年次統計調査 報告書（詳細版）](https://www.super.or.jp/wp/wp-content/uploads/2025/10/2025nenji-tokei-detail.pdf) [P, full text read]:
  - Semi-self: "セルフ精算レジ（セミセルフレジ）設置企業の割合…は77.1%。半数以上の店舗に設置する企業の割合は年々増加傾向にある。" (77.1% of companies; the share installing it in at least half their stores rises every year).
  - Full self-checkout: "セルフレジ設置企業の割合…は41.7%で、設置企業の割合は年々増加傾向にある。" (41.7%, rising).
  - Respondent tables (raw, before the industry estimate): semi-self installed by 79.2% (62.8% in at least half their stores + 16.4% in fewer) against full-self 47.0% (21.9% + 25.1%).
  - By size: companies with **1–3 stores** have semi-self at 58.1% + 4.1% = **62.2%** and full-self at 10.6% + 1.5% = **12.1%**. Small-store-centred companies (小規模店舗中心型) are 67.4% semi against 23.8% full. Companies with 51+ stores reach 88.6% for full-self.
  - Intentions: full-self "新たに設置したい" 22.4% and "台数を増やしたい" 21.9%; semi-self "増やしたい" 14.5% and "新たに" 10.7%, falling as interest shifts to full-self.
  - Anti-theft at self-checkout: cameras 84.8%; a cashier stationed nearby for visual and receipt checks 51.9%.
  - QR-code payment accepted by 71.0% of supermarket companies, still rising.
- 2022 survey via press: semi-self 75.1%, full-self 25.2% — [Business Journal](https://biz-journal.jp/company/post_383035.html) [S, X, old]. The 2025 figures were corroborated by [issoh](https://www.issoh.co.jp/column/details/18169/) [S, X].
- JCB's merchant guide (2024-11-28) defines semi-self as "店員が商品のスキャンを行い、支払いのみをお客様が行うシステムです。" It suits small and medium stores with no space for full self-checkout, and stores with many elderly or device-unfamiliar customers. Full-self suits large stores with 10+ units and needs customer skill. Costs as stated: full-self ¥1–3m per unit plus ¥20–150k a month; semi-self ¥1–4m (the unit is not stated) — [JCB](https://www.jcb.co.jp/merchant/acq/mep/special/self_checkout.html) [S (card acquirer guide)]

**Weighed goods and price-embedded in-store barcodes**
- Sharp's register manual: "02 や 20 で始まる 13 桁コード※（インストアマーキング NON-PLU タイプ）は、カスタマサポートツールでコードを作成することができません。" (13-digit codes starting 02 or 20, the in-store-marking NON-PLU type, cannot be created in the support tool and are registered at the register with a scanner). Register settings choose the leading flag, the length of the price, and whether a check digit precedes the price. For 02 codes the register reads the price and check digit from inside the code — [Sharp ECR_JANCodeEntry.pdf](https://jp.sharp/support/ecr/doc/ECR_JANCodeEntry.pdf) [P, X — the PDF is AES-encrypted and could not be opened]
- Mettler Toledo Japan sells bench scales with barcode printing for this labelling — [mt.com JP](https://www.mt.com/jp/ja/home/products/Industrial_Weighing_Solutions/bench-scales/bench-scale-with-barcode.html) [V, X]

### Inferences
- The Japanese pattern for weighed goods is "weigh and price at the back-room or label scale, only scan at the till". Because NON-PLU in-store codes carry the **price** (not the weight), the checkout needs no scale. That is also what lets semi-self work for meat, fish and deli. The register-side evidence is the Sharp manual; the back-room labelling step is my inference.
- Small Japanese operators choose semi-self over full-self by about 5:1 (62% vs 12% at 1–3-store companies). Their answer to the labour shortage is splitting "scan" from "pay" — the cashier never touches cash and starts the next basket — not unattended checkout. Full-self needs camera and staff supervision (84.8% / 51.9%).
- Airレジ's reviews show what an online-only till costs: when the signal drops, the drawer doesn't open and customers wait. An offline-capable till is a differentiator even in Japan.
- "部門打ち" (department keys) is how a free POS handles unbarcoded loose goods without an item master: tap "野菜", type ¥198.

### Gaps
- No 2024–2026 Airレジ account count; the latest primary figure is 73.5万 (March 2023).
- Smaregi stopped monthly store counts after October 2024, and the JPX PDFs were blocked (403), so the figures are from search extracts.
- **Square Japan and ユビレジ (Ubiregi): no data gathered** (search quota exhausted).
- Whether Airレジ or Smaregi parse 02/20 price-embedded codes or connect to scales: not found.
- The exact Japanese NON-PLU digit layout (item code length, price check digit) was not confirmed from GS1 Japan; only the Sharp manual excerpt.

## 2. South Korea — Toss Place, OKPOS, Baemin and other POS; unmanned stores (무인점포)

### Takeaway
Toss Place (Viva Republica's subsidiary) is the breakout. It launched in March 2023 with Toss Front, Toss Terminal and the free Toss POS app, and grew from 30k merchants after a year to 85k (Dec 2024), 100k (Feb 2025) and 200k+ (Oct 2025). Owners say they choose it for usability first, then design, then price. Its base skews young (44% of owners in their 20s–30s) and is mostly restaurants, cafés and beauty shops, not groceries. The signature UX is one device switching modes (kiosk mode, ID-check mode), a customizable customer-facing terminal and ~1-second face pay. Complaints concern small text and a landscape-only phone app (App Store 3.1/5). Unmanned stores number 10k+ officially (possibly 100k+ in practice) and use self-scan kiosks with card-only payment.

### Cited Findings
**Toss Place (토스플레이스)**
- Launched March 2023: Toss Front (customer-facing) + Toss Terminal + "Toss POS". It passed 30,000 merchants in about one year. New merchants averaged >2,500 a month, 3,675 a month over the last six months, which the company puts at 10.2% of the ~36,000 businesses opening each month. Cumulative 42 M transactions and ₩1.05 tn. **Kiosk mode** (May 2023) turns the terminal into a kiosk with a mode switch, "no separate kiosk hardware needed". **ID-check mode (신분증 검사 모드)** is for stores that restrict minors. Brand videos covered kiosk mode, Toss Order, screen customization, revisit coupons and all-payment support — [Toss Feed, 2024-04-01](https://toss.im/tossfeed/article/anniversary) [P]
- December 2024: 85,000+ merchants, 4.5× YoY. Restaurants 48%, cafés 20%, beauty 19%. Reasons for choosing, in order: 사용성 (usability) > 디자인 (design) > 가격 (price) > 업데이트 > 맞춤형 설정 (custom settings). Most valued features: all payment methods, kiosk mode, easy customer management, front-screen customization. Average owner age 43; 44% in their 20s–30s against 16% for the industry: "토스 단말기를 사용하는 가맹점주의 44%가 20~30대로 나타나면서, 청년 가맹점주들이 토스 단말기를 선호하는 것으로 확인됐다." About 1 in 5 newly opened stores chose a Toss terminal — [Smart Today, 2024-12-26](https://www.smarttoday.co.kr/ko-kr/articles/68291) [S from company infographic]; [Hellot, 2024-12-26](https://www.hellot.net/mobile/article.html?no=96684) [S] (its "450%" headline does not match its own 4.5×)
- February 2025: 100,000+ merchants two years after launch, >8,000 new a month; growth credited to kiosk mode, Toss Table Order and the mobile POS. Quote: "출시 2년 만에 10만 개 가맹점이 토스 단말기를 선택했다는 건 자영업자들이 결제 단말기 시장의 변화를 체감하고 있다는 뜻" (100k merchants in two years means owners feel the terminal market changing) — [Smart Today, 2025-02-24](https://www.smarttoday.co.kr/ko-kr/articles/73385) [S]
- October 2025: "토스의 결제 단말기를 설치한 가맹점 수가 20만개를 돌파한 것으로 나타났다." (200k+ merchants). About 30% of shops in Hongdae (Seogyo-dong) use it; Sejong and Daejeon grew ~220% and 240% year-to-date. Face pay completes about 1 second after the customer looks at the terminal, with a target of 1 M face-pay merchants next year. The analysis covers independent shops only, no franchises — [Herald Economy, 2025-10-12](https://www.heraldk.com/article/2025101216101225400) [S]
- Toss Front units deployed 130k+ by May 2025 ("토스프론트 보급 13만 돌파···얼굴결제 시대 본격화") — [Daum/스케일업 리포트, 2025-05-14](https://v.daum.net/v/20250514171925766?f=p) [S, headline only]
- Retail page: the POS app is free on Windows POS terminals/PCs, Android tablets, iPad, MacBook and phones: "포스 앱은 포스기뿐 아니라 태블릿, 노트북, 휴대폰에서 무료로." Other claims: "상품 종류가 많아도 바코드로 삑-." ("many products? just beep the barcode"); stock in and out on one screen; bulk product registration; **initial-consonant (초성) product search**; "한번 입력으로 끝!" Toss Front's price is "상담문의" (on enquiry). Front features listed: Apple/Samsung Pay, NFC, a custom home screen, real-time orders, a mini kiosk and points. No weighed goods and no offline mode are mentioned — [tossplace.com/sector/retail](https://tossplace.com/sector/retail) [V]
- 2024 most-used features: mobile POS, prepaid and session-count passes (선불권/횟수권), **free** KakaoTalk messages to customers, QR table order (staff call, refill request, English menu, Naver-review prompt) and reservations. A setting changes the customer-facing background image. Merchant quote: "토스 테이블오더로 고객 서비스 품질, 매장 운영 효율을 둘 다 잡았어요." ("With Toss Table Order we got both service quality and operating efficiency.") — [tossplace.com/story/yearend2024](https://tossplace.com/story/yearend2024) [V]
- App Store "토스 사장님(포스)": subtitle "쉽게 사용할 수 있는, 본 적 없는 포스" (an easy POS like none you've seen); **3.1/5 from 63 ratings** (an earlier extract showed 3.5 from 39) — [App Store KR](https://apps.apple.com/kr/app/%ED%86%A0%EC%8A%A4-%EC%82%AC%EC%9E%A5%EB%8B%98-%ED%8F%AC%EC%8A%A4/id6447936572) [P/U]:
  - Title "다른 포스랑 다르게 빠르고 쉬워요" (2024-10-14): "단말기 광고 보고 쓰게 됐는데 다른 포스들보다 빠르고 사용하기가 쉽습니다." — "Started after seeing the terminal ad; faster and easier than other POS." The reviewer also praised phone support.
  - Title "메뉴 글씨 크기 아이패패드및 안드로이드 탭 본체 글씨크기 연동 해줬으면 좋겠어요" (2025-06-12, typo in original) — "Please make menu text follow the iPad/Android tablet's system font size." The reviewer switched from PayHere, struggles with presbyopia and white-on-dark menus, and is considering switching back. Developer reply: "반영 여부에 대한 확답은 드리기는 어려우나, 해당 내용은 팀에서 인지하고 있으며 2025년 하반기에 검토될 예정입니다." ("can't promise; the team is aware and will review it in H2 2025").
  - Title "모바일 사용시 세로버전" — a solo beauty-shop owner wants a portrait layout on the phone, because entering bookings in landscape is awkward.
  - The listing itself says "따로 배우지 않아도 누구나 쓸 수 있어요" (anyone can use it without training), and warns that on phones "글자나 버튼이 작을 수 있어요" (text and buttons may be small) — [App Store KR](https://apps.apple.com/kr/app/%ED%86%A0%EC%8A%A4-%EC%82%AC%EC%9E%A5%EB%8B%98-%ED%8F%AC%EC%8A%A4/id6447936572) [P, X]

**Other Korean POS**
- OKPOS is called "업계 1위" (industry #1) with no basis or date given — [JobPlanet](https://www.jobplanet.co.kr/contents/news-5260) [S, X]. TheVC lists its peers as Posbank, Unos, Bluebird and PayHere (페이히어) — [TheVC](https://thevc.kr/okpos) [S, X]
- Barogo, a delivery platform, launched "올스타 포스" (Oct 2023) with delivery-order relay, kiosk and membership — [Aju News](https://www.ajunews.com/view/20231018134308883) [S, X, old]
- Baemin POS: nothing found.

**Unmanned stores (무인점포)**
- Fire-agency data put unmanned stores at >10,000 in 2025 (≈2,200 in 2020, 7,900 in 2022). The industry thinks 100k+ actually operate, because only business registration is needed — [tilnote blog](https://tilnote.io/pages/6a2058276fcb632b0c1eb055) [S/blog, X, low reliability]. A small-business survey gave ~15k (2021) and ~25k (2022) — [wikidocs blog](https://wikidocs.net/blog/@knarchive/14161/) [S/blog, X]. Unmanned ice-cream discount stores: 1,030 (2023), 1,238 (2024), 2,046 (2025) — [wikidocs blog](https://wikidocs.net/blog/@knarchive/14853/) [S/blog, X, unverified]
- Checkout UX in unmanned stores (2018–2019 reporting): the customer holds each barcode to the reader at a self-checkout; emart24 opened its door by inserting a credit card for identity; payment by card, SSG Pay or coupons, **no cash**; 7-Eleven Signature had palm-vein "핸드페이" for payment and entry, but few customers used it. Other stores authenticate by card, ID or QR, which raises security but costs convenience — [Seoul Shinmun 2018](https://m.seoul.co.kr/news/2018/04/07/20180407015001), [Sidae 2019](https://www.sidae.com/article/2019062514308079102), [Bizhankook](https://bizhankook.com/articles/14810.html) [S, X, old]

### Inferences
- Toss wins on design plus bundling: free software, paid terminals and payments, and modes switched on one device instead of new hardware. The grocery analogues: an ID or age prompt for alcohol and tobacco, and a self-order/self-pay mode on the same customer-facing terminal.
- 초성 search (type the first consonants to find "삼다수") is a speed feature. The Ukrainian equivalent is prefix, abbreviation or translit search plus numeric PLU for produce.
- The complaints are accessibility homework: honour the OS text size, keep high contrast, offer a portrait phone layout.
- Toss's evidence is from restaurants, cafés and beauty. **No Korean source showed how 동네마트 (neighbourhood marts) handle weighed goods.**

### Gaps
- Toss terminal prices, fee model and offline behaviour: not published ("상담문의").
- OKPOS market share, Baemin POS, PayHere merchant numbers: not found.
- Korean mini-mart weighed-goods and scale-label practice: not found.
- Official unmanned-store statistics: the kukinews article returned 403; only blog-level numbers.

## 3. China — 收钱吧 (Shouqianba), 有赞 (Youzan), 客如云 (Keruyun), 美团收银 (Meituan); Sunmi devices; AI recognition scales; QR payments and voice-broadcast speakers (收款音箱)

### Takeaway
The Chinese tiny-shop stack is **one aggregated QR code + a loudspeaker that announces every payment**, with an optional cloud register. Shouqianba claims 10 M merchants with "笔笔播报金额" (every payment's amount announced), and one speaker maker, Cloud Code, has shipped 17 M+ broadcast speakers since 2018. AI produce-recognition scales sit in government-upgraded "smart wet markets" (Shanghai) and fresh chains. Vendors claim ~99% accuracy with a confirm-and-learn loop and a fallback search, but I found no independent accuracy or price data. Sunmi is the Android hardware layer: the largest Android BIoT provider by 2024 revenue, listed in Hong Kong in April 2026.

### Cited Findings
**收钱吧 Shouqianba**
- App description: "1000万商家的信赖：覆盖全国680+城市" (trusted by 10 M merchants in 680+ cities); "1秒极速收款：支持微信、支付宝、银联云闪付、信用卡、花呗等多种支付方式。" (1-second collection across WeChat, Alipay, UnionPay, credit cards, Huabei); "智能语音播报：笔笔播报金额清晰，到账通知安全省心！" (every payment's amount announced clearly); devices "扫码王、收钱音箱、收银机" (scanner box, payment speaker, cash register); membership tools; takeaway and ordering mini-programs; inventory and supply-chain management. Rated **4.9★ from 3.3万 ratings** — [App Store CN](https://apps.apple.com/cn/app/%E6%94%B6%E9%92%B1%E5%90%A7-%E4%B8%AD%E5%B0%8F%E5%9E%8B%E5%95%86%E6%88%B7%E4%B8%93%E4%B8%9A%E7%A7%BB%E5%8A%A8%E6%94%AF%E4%BB%98%E6%94%B6%E6%AC%BE%E5%B7%A5%E5%85%B7/id980231513) [P]. An older listing said "900万商家" — [App Store](https://apps.apple.com/cz/app/%E6%94%B6%E9%92%B1%E5%90%A7-%E5%95%86%E5%AE%B6%E6%94%B6%E6%AC%BE%E7%A5%9E%E5%99%A8/id980231513?l=cs) [P, X]
- Reviews (old, 2017–2019) — same listing [U]:
  - 「对账方便了，也不会有漏单、逃单了。有语音播报还提升了客户体验。」 — "Reconciliation got easy, no more missed or skipped payments; the voice broadcast even improved the customer experience." (2017-10-12)
  - 「微信还是零费率，真的是良心企业」 — "WeChat is still zero-fee, a really conscientious company." (2017-10-12)
  - 「一个电话随叫随到」 — "One phone call and they come." (2019-03-11)
- Shouqianba is preparing an A-share IPO (CICC tutoring report, April 2025); its devices include 收钱吧扫码王 and 收钱音箱 — [瑞财经](https://m.rccaijing.com/news-7318193114421327780.html) [S, X]

**Voice-broadcast speakers (收款音箱 / 云喇叭)**
- Cloud Code alone has shipped **>17 M** payment broadcast speakers since 2018 (models CS50/CS51/CS60), to small and mid-size merchants that take QR payments, mostly in China: "All use a secure network protocol to broadcast the result of a payment"; they double as Bluetooth music speakers — [Nilson Report No. 1277, Jan 2025](https://nilsonreport.com/articles/cloud-codes-payment-broadcast-speakers/) [S trade press, paywalled excerpt]
- The phone-only alternative is Alipay's "收钱到账语音提醒" setting. It goes silent when the OS kills the app or drops the network on lock — [Huawei support](https://consumer.huawei.com/cn/support/content/zh-cn00410681/) [P, X]. Standalone speakers keep announcing through their own 4G/Wi-Fi when the owner's phone is off or away — [merchant video, Douyin](https://www.douyin.com/shipin/7291984792885774375) [U/V, X]

**AI recognition scales (AI识别秤)**
- Shanghai Pudong, Qihe Road market (2022-01-31): a camera identifies the produce on the tray, the vendor enters no code or unit price, and the scale computes weight and price and prints a receipt. Data flows to the district's smart agri-product platform, and an entrance screen shows specials and top sellers.
  - Vendor: 「顾客买了多少东西，该付多少钱，上面写得清清楚楚，完全不用费大脑。」 — "What the customer bought and owes is written clearly; no mental arithmetic."
  - Customer Mr Guo: 「很便利、很快，比以前买菜要快好几分钟。」 — "Convenient and fast, several minutes quicker than before."
  - Market director: 「现在由我们输入以后，商户无法随意改动，每天的销量和价格，在我们后台都可以看见。」 — "Now we enter the data, vendors can't change it at will, and we see daily volumes and prices in the back end."
  - No brand, price or accuracy given — [The Paper / 浦东发布](https://m.thepaper.cn/baijiahao_16546170) [S (district official media), old]
- Yicai: one upgraded market brought in 60 AI scales that recognise variety, tare and unit price and keep a running total. Shanghai plans 80 standardised markets, 60 already upgraded — [Yicai video](https://www.yicai.com/video/102206098.html) [S, X, undated]
- 湃扬 C600 "AI收银秤" (2022 advertorial): "不需要输入编码，AI摄像头毫秒级识别出蔬菜、水果名称" (no code entry; the camera names the fruit or vegetable in milliseconds); then "打秤员点击选择商品" (the operator taps to select) and "系统实时语音播报" (live voice announcement). Also claimed: "支持自动训练" (self-training), 0.1 s response, 15 kg max, aggregated WeChat/Alipay/UnionPay QR payment, and an optional 15.6" second screen that shows ads and carries a 58 mm printer. Aimed at "社区超市、农贸市场、生鲜连锁" — [NetEase / 聚食汇, 2022-08-01](https://www.163.com/dy/article/HDN1F9V30518CPI9.html) [V, old]
- HPRT: recognition ~0.1 s; a full weigh-and-label cycle 3–5 s (C-L9AI). Accuracy "around 99%" at first, ">99.5%" in the FAQ, with no method given. If unsure, the cashier falls back to search by **name, image, unit price or fresh code**. The model improves each time staff confirm; a new item is added by placing it and confirming, with no cloud training. Semi-transparent bags are handled; glare and background clutter cause failures. The C-P8AI targets small grocery and convenience stores with fresh sections — [HPRT guide](https://www.hprt.com/Product/Commercial-Scale/ai-recognition-scale-retail-guide.html) [V]
- Mettler Toledo FreshBase Plus / FreshAI (China): works under varied lighting and bags. A European case puts the correct item **in the top four within 0.5 s at ±99%** — [mt.com CN FreshAI](https://www.mt.com/cn/zh/home/products/retail-weighing-scales/AI-Scales/freshAI.html), [FreshAI solutions](https://www.mt.com/cn/zh/home/perm-lp/product-organizations/retail/freshai-solutions.html) [V, X]

**Sunmi (商米) device ecosystem**
- HK IPO: subscription 21–24 April 2026 at HK$24.86, 42.6 M H-shares, listing expected 29 April 2026, net proceeds ≈HK$909 M (≈40% R&D, 30% supply chain, 20% global expansion). Per CIC: "全球最大的安卓端BIoT解决方案提供商" (largest Android-side BIoT solutions provider) by 2024 revenue, >10% share. Revenue was reported as ~RMB 3.07 bn / 3.46 bn / 3.81 bn for 2023–25; the units came back garbled in my fetch, so cross-check — [Tiger Brokers news](https://www.itiger.com/news/1107754503) [S citing prospectus]
- Monthly active devices: ~4.9 M in 200+ countries (2025 reports), later "約660萬台月活躍設備…220多個國家和地區" (~6.6 M) — [Macau Business](https://macaubusiness.com/%e5%95%86%e7%b1%b3%e4%b9%8b%e5%ae%b6%e9%9f%93%e5%9c%8b%e9%a6%96%e5%ba%97%e6%ad%a3%e5%bc%8f%e9%96%8b%e6%a5%ad%ef%bc%8c%e4%bb%a5%e5%95%86%e7%94%a8%e7%89%a9%e7%90%86ai%e5%8a%a0%e9%80%9f%e4%ba%9e%e5%a4%aa/) [S, X]

**Youzan**
- Revenue up 3% in 2025 — [KrASIA pulse](https://kr-asia.com/pulses/160543) [S, headline only]

### Inferences
- Every recognition-scale flow puts recognition first, a tap to confirm second (or a fallback search by name/price/code), and learns from every confirmation. The same flow fits a Ukrainian produce screen without cameras: rank produce by what this till sold recently and most often, accept a numeric PLU, confirm with one tap.
- Voice broadcast exists because QR payment is customer-initiated and the owner is busy. The confirmation must reach the counter without anyone looking at a phone, and it must come from the payment network, not the customer's screen. Phone notifications get killed by the OS, which is why a dedicated always-on device took over.
- In the Shanghai markets, price authority sits with the market or owner, not the stall worker. Permissioned price edits are a feature, not friction.

### Gaps
- **Keruyun, Meituan 收银, and Youzan's small-shop specifics: not covered** (search quota exhausted).
- **Aclas (顶尖), Dahua (大华衡器), Hikvision AI scales**: models, prices and adoption not found. No independent accuracy test and **no price points** for any AI scale.
- Shouqianba's 10 M is an app-store marketing claim; audited figures would be in its A-share filings (not read).
- Who originated 收款音箱, and when, could not be established from reliable sources.

## 4. India — kirana POS and billing apps; Paytm Soundbox / PhonePe SmartSpeaker; loose goods

### Takeaway
India's breakout small-shop UX device is not a POS but a **speaker that announces every UPI payment in 11 languages**: Paytm Soundbox (2020) and PhonePe SmartSpeaker (2022). Paytm had 1.24 Cr device subscribers (March 2025) and 1.5 Cr subscription merchants (Q4 FY26); PhonePe had 9.19 M deployed payment devices (Sept 2025). The money comes from rental (about ₹49–125 a month) plus merchant lending; the hit came from busy, noisy, multi-attendant shops and distrust of customers' screenshots. Kirana billing apps (Vyapar, BUSY, QueueBuster, LOGIC ERP, Gofrugal) sell offline-first GST billing, khata (credit ledger) and WhatsApp bills, and list weighing-scale integration for loose dal, rice and sugar as standard.

### Cited Findings
**Soundboxes**
- Paytm launched soundboxes in 2020 and led the category. By January 2023 it claimed **>5.8 M devices**, ~1 M added in each of the previous two quarters, and 5 bn transactions in FY2022. CLSA: soundboxes were 38% of Paytm's net payment revenue. PhonePe launched in 2022 (1 M by Nov 2022), as did BharatPe. Google piloted "Soundpod by Google Pay" (built by ToneTag), free to selected merchants: the QR is linked to the merchant's number so any UPI app works, voice comes in several languages, and a small LCD shows amount, battery and network. Fees: Paytm ~₹125 a month on average, PhonePe ~₹49 a month, and PhonePe began charging cancellation fees. Why merchants want them: **busy, loud shops with several attendants where nobody watches a phone**, cashiers without a smartphone, multi-day battery and a daily summary. Merchant quote (a chemist who dropped Paytm): "the device is charging me over a hundred rupees a month just for speaking out payment updates" — [TechCrunch, 2023-01-17](https://techcrunch.com/2023/01/17/google-pay-soundbox-india/) [S, old]
- The Quint (2023-05-03): "a new device being purchased every six seconds". **>85% of the loan value disbursed last quarter went to merchants using a Paytm payment device.** Device rental was to be 14% of revenue (up from 8%). Announcements come in 11 languages: English, Hindi, Tamil, Telugu, Kannada, Marathi, Malayalam, Bengali, Gujarati, Punjabi and Odia — [The Quint](https://www.thequint.com/amp/story/tech-and-auto/soundbox-the-little-device-that-revolutionized-mobile-payments-in-india) [S, old]
- Q4 FY25: the device merchant base "expanded by 8 Lakh during the quarter, reaching a total of 1.24 Cr" (March 2025). New models: a 4G "Mahakumbh" Soundbox with a built-in screen for visual alerts, and "India's first solar-powered soundbox" — [CXOToday reprint of Paytm's results release, 2025-05-09](https://cxotoday.com/media-coverage/paytm-q4-fy-2025-revenue-of-%e2%82%b91911-cr-ebitda-before-esop-and-pat-improved-to-%e2%82%b981-cr-and-%e2%82%b923-cr-respectively/) [P reprint]
- Solar Soundbox (Feb 2025): a fully discharged unit recharges in 2–3 h of sun; it takes UPI and RuPay credit-card payments through the QR; 3 W speaker; 11 languages — [Inc42, 2025-02-20](https://inc42.com/buzz/paytm-rolls-out-solar-powered-soundbox-for-merchants/) [S]
- Q4 FY26: Paytm's subscription merchant base grew to **1.5 Cr**, "aided by device-led expansion, including soundbox deployment". AI was added to its soundboxes for insights and merchant support. PhonePe had **9.19 Mn** net deployed payment devices, soundbox plus EDC, as of 30 Sep 2025 per its UDRHP. NPCI is reportedly building **interoperable soundbox infrastructure**, one device for every app's QR, because today a merchant needs separate Paytm/PhonePe/Google Pay devices; this would hit fintech rental income. Adoption is rising among kiranas, street vendors and food stalls — [Inc42, 2026-05-18](https://inc42.com/buzz/npci-to-roll-out-unified-soundbox-infrastructure-for-merchants-report/) [S citing ET sources]
- Fraud angle: Soundbox 2.0 (March 2021) added a screen "to reduce fraud" — [FashionNetwork 2021](https://in.fashionnetwork.com/news/Paytm-expands-payment-acceptance-methods-for-stores-to-increase-online-payments,1286165.html) [S, X, old]. After a viral spoof-app video, Paytm told merchants to trust their own confirmations rather than customers' screenshots, and pitched the Soundbox as removing the need for SMS confirmations on feature phones — [Crowdfund Insider](https://www.crowdfundinsider.com/?p=185176) [S, X — page 403]. WARC frames the campaign as "the sound of reassurance" for cash-preferring merchants — [WARC](https://www.warc.com/en/campaigns/paytm%3A-paytm-soundbox-%E2%80%93-the-sound-of-reassurance-501f9b31c803461998317ac12253fb7f) [S, X]
- Soundbox as an ad channel: Paytm partnered with Meesho to monetise soundbox ads (Oct 2024) — [MediaNama](https://www.medianama.com/2024/10/223-paytm-to-monetize-soundbox-ads-in-partnership-with-meesho-a-shift-away-from-core-payments-business/) [S, headline only]. A card-accepting soundbox also exists — [BusinessWorld](https://businessworld.in/article/paytm-introduces-soundbox-with-card-payment-capability-489987) [S, headline only]
- PhonePe SmartSpeaker: 10 lakh within 3 months (Nov 2022) — [PhonePe press](https://www.phonepe.com/press/phonepe-deploys-over-10-lakh-smartspeakers-within-3-months-of-launch/) [P, X]. 20 lakh within 6 months (2023-02-02), validating 75 crore transactions a month, across ~16,000 pin codes (>75% of the country), >5 lakh in Tier III. Features: **11 languages, up to 4-day battery, LED and voice low-battery alerts, dedicated data connectivity, a replay button for the last transaction**, audible in noisy settings, compact for crowded counters. Merchants on feature phones "relied heavily on SMS for payment validation" before — [PhonePe press, 2023-02-02](https://www.phonepe.com/press/phonepe-sets-a-new-milestone-deploys-20-lakh-smartspeakers-within-6-months-of-launch/) [P, old]
- PhonePe 4 M+ SmartSpeakers (2023-09-11), 19,000 postal codes, 100 crore validations a month, Amitabh Bachchan's voice as an option, 3.6 crore merchants on the platform — [DT Next](https://www.dtnext.in/lifestyle/technology/phonepe-smartspeakers-hit-record-high-deployment-of-over-4-mn-devices-735618) [S, old]. 50 M lifetime registered merchants at the time of the IPO filing — [Deccan Chronicle](https://www.deccanchronicle.com/business/companies/phonepe-hits-50-million-registered-merchants-across-india-1953285) [S, X]

**Kirana billing apps and loose goods**
- Vyapar: marketed to kirana stores and pharmacies; "offline-first" billing with cloud sync; "Lifetime Free Plan Available" plus premium tiers; bills shared over WhatsApp. The "1.5 Cr+ businesses" claim comes from a third-party profile, unverified — [Lapaas profile](https://voice.lapaas.com/startup/vyapar/business-model/) [S, X]; [GetApp](https://www.getapp.com/finance-accounting-software/a/vyapar/) [S, X]. Capterra is mixed: a Nov 2025 retail reviewer praised WhatsApp invoice sharing; a Feb 2025 reviewer said the WhatsApp invoice arrives as a blank file (paraphrase); 4.3/5 from 181 — [Capterra IN](https://www.capterra.in/software/180579/vyapar) [U, X]
- Weighed and loose goods are a standard checkbox:
  - BUSY: "loose kirana items like dal, rice, or sugar are sold by weight or quantity", with khata credit and UPI — [BUSY](https://busy.in/accounting-software/retail-shop/kirana-store/)
  - LOGIC ERP: "auto-captures weights via an integrated electronic weighing scale" — [LOGIC ERP](https://www.logicerp.com/Retail/FMCG/Kirana-Stores-Retail-Software)
  - QueueBuster: scale integration and an online/offline POS — [QueueBuster](https://queuebuster.co/grocery/kirana-stores-pos-billing-software)
  - Retail Master: "weighing scale integration for fruits, vegetables, grocery" and WhatsApp bills — [Retail Master](https://m.indiamart.com/retail-master/retail-billing-software.html)
  - VasyERP: weigh-scale billing and UPI — [VasyERP](https://vasyerp.com/retail/kirana-store-software)
  - All [V, X]
- Gofrugal markets kirana billing as "Bill faster and service customers quicker" — [Gofrugal](https://gofrugal.com/retail/supermarket-pos/kirana-store-software.html) [V, headline only]

### Inferences
- The soundbox's success has five parts:
  - The payment truth comes from the network, not the customer's phone (spoofed screenshots).
  - The shopkeeper doesn't have to look up.
  - It works for staff with no smartphone.
  - It speaks the local language.
  - It runs for days on a battery and has a replay button.
- For a Ukrainian grocery taking QR or instant payments, the transferable idea is a **spoken and on-screen "payment received ₴X" from the till or customer display, confirmed by the bank, with replay**.
- The rental-fee resentment ("over a hundred rupees a month just for speaking") says merchants price this feature by its narrow utility. Voice confirmation should be built into the POS for free, not sold as a separate device.
- Device-as-lending-channel: >85% of Paytm's merchant loan value went to device users. A POS that sees daily sales becomes an underwriting channel; hand this to the credit researcher.

### Gaps
- **JioMart Partner / Jio POS, Khatabook's billing, Dukaan, and the PhonePe/Paytm business-app billing features: not verified** (search quota exhausted). JioMart claims surfaced only in old 2020 AGM coverage.
- Paytm's soundbox-only count after FY25: a search extract gave 1.17 Cr soundboxes at Q3 FY25 (Dec 2024), but I could not verify it on a page.
- No independent adoption figures for any kirana billing app.

## 5. Southeast Asia — Loyverse, Moka (GoTo), Qasir, Majoo (Indonesia), StoreHub (Malaysia), GrabMerchant

### Takeaway
Loyverse is the global free POS that mini-marts reach for: 1 M+ registered businesses (its own claim), a free POS with loyalty, customer display and KDS, and paid add-ons of $5–25 per store per month. Weighed goods work through a typed-weight keypad and weight-embedded EAN-13 (prefix 20/02 + 5-digit SKU + 5-digit grams). Reviewers praise "free and easy" and complain about variant/modifier stock, payment integrations and audit gaps. The regional players are smaller, paid, and tied to payments or ecosystems: Moka/GoTo ~40k businesses (2020), Majoo 45k+ UMKM (2024), StoreHub 18k+ outlets (2025).

### Cited Findings
**Loyverse**
- "Over 1,000,000 businesses in 170 countries have registered with Loyverse" (registrations, not active users; undated) — [loyverse.com](https://loyverse.com) [P, X]
- Business model: free POS, 31-day sales analytics, essential inventory with low-stock alerts, **loyalty program, customer display, kitchen display**, multi-store and integrations. Paid add-ons per store: unlimited sales history $5/mo ($50/yr), employee management $25/mo ($250/yr), advanced inventory (purchase orders, transfers) $25/mo ($250/yr), each with a 14-day trial. Card acceptance goes through partners (Shift4, SumUp, Tyro, Zettle, Yoco). Runs on the owner's own phone or tablet with a web Back Office — [loyverse.com/pricing](https://loyverse.com/pricing) [P]
- Selling by weight: set "Sold by: Weight" and a price per kg/lb. At the sale the cashier taps the item, a numeric keypad appears, they type the weight ("2.8" for 2.8 kg) and tap OK; the line equals price × weight. No scale connection is described — [Loyverse help: sell by weight](https://help.loyverse.com/help/how-sell-items-weight) [P]
- Weight-embedded barcodes are switched on in Back Office → Features, for items set to sell by weight. Format: prefix "20" or "02" (EAN-13) or "2" (UPC-A), a 5-digit item SKU, a **5-digit weight in grams** (01750 = 1.750 kg) and a checksum. They scan with the camera or a scanner; only EAN-13 and UPC-A are supported — [Loyverse help: embedded weight](https://help.loyverse.com/help/barcodes-with-embedded-weight) [P, X]
- Capterra themes (paraphrased; pages blocked to my fetcher):
  - Pros: the free core ("genuinely free"), fast and easy setup even for low-skill staff, low-stock alerts, hourly to yearly reports.
  - Cons: items inside modifiers and variants aren't stock-tracked; cost can be entered only as an amount; few payment integrations (e.g., no Bancontact); open tickets can be deleted without a trail; no staff, online-ordering or delivery tools; resentment at the paid add-ons.
  - [Capterra](https://www.capterra.com/p/150632/Loyverse-POS/reviews/?page=2) [U, X]
- An Indonesian tutorial on selling by weight in Loyverse exists, a sign of mini-mart use there — [DailySocial](https://en.dailysocial.id/post/how-to-sell-goods-on-oyverse-pos-by-weight) [S, headline only]

**Indonesia**
- Moka served ~40,000 businesses in 200 cities when Gojek acquired it (2020), with access to Gojek's 500k+ merchant partners — [KrASIA](https://www.kr-asia.com/gojek-confirms-acquisition-of-mpos-startup-moka) [S, X, old]; [Moka company info](https://moka.dev.fleava.com/en/company-information) [P, X]. GoTo clarified in 2024 that Moka accepts all e-wallets, not only GoPay — [Katadata](https://katadata.co.id/amp/digital/fintech/6684febd5a461/klarifikasi-goto-sistem-kasir-moka-terima-semua-pembayaran-e-wallet/) [S, headline only]. No 2024–2026 merchant count found.
- Majoo says it digitised **>45,000 UMKM in 600 cities during 2024** (April 2025 release) — [Fortune IDN](https://www.fortuneidn.com/tech/lima-tahun-majoo-telah-fasilitasi-45-ribu-umkm-00-ccw2k-x90npq/amp), [majoo news](https://majoo.id/news/read/majoo-beri-dampak-yang-luas-terhadap-pertumbuhan-umkm-di-indonesia) [P/S, X]. In 2022 it claimed >25,000 active merchants and >100 M transactions worth US$600 M — [majoo Series A](https://majoo.id/news/read/funding-series-a) [P, X, old]
- Qasir: not researched.

**Malaysia / Philippines**
- StoreHub: "18,000+" restaurants, retailers and service businesses (PH site, © 2025), up from 15,000+ across MY/TH/PH in 2022; Dealroom lists ~US$3.5 B merchant GMV — [StoreHub PH](https://www.storehub.com/ph/about), [Dealroom](https://dealroom.co/companies/storehub/), [500.co (2022)](https://latam.500.co/content/how-store-hub-is-helping-small-retailers-in-southeast-asia-digitize-their-operations) [P/S, X]
- GrabMerchant: not researched.

### Inferences
- Loyverse's grams-in-the-barcode format maps one-to-one onto a POS that stores quantity as integer base units (250 g = quantity 250, as this team's POS already does). Scanning a scale label can add a line with quantity = encoded grams, with no floating point.
- The typed-weight keypad is the minimum viable flow without a scale. It needs a live "price/kg × weight = total" readout and a decimal-friendly keypad; reviewers don't praise it, they praise "free + easy".
- The free core plus small per-store add-ons ($5 history, $25 staff, $25 advanced inventory) is a tested price ladder for very small shops, but even $5 draws one-star "pay to see history" reviews.

### Gaps
- **Qasir, GrabMerchant, Pawoon, iSeller: not covered.**
- Loyverse's offline behaviour (widely believed to work offline) is not stated on the pages I read: unverified.
- No current Moka merchant count; Majoo and StoreHub counts are self-reported.

## 6. Across all — offline behaviour, onboarding speed, free vs paid models, customer-facing displays, loyalty, credit/tab, praise and complaints; transferable UX for a Ukrainian grocery vertical

### Takeaway
Free software is the norm at the bottom of the market. The money comes from:
- payments: Airペイ, Toss terminals, Shouqianba;
- device rental plus lending: Paytm, PhonePe;
- hardware: Sunmi;
- add-ons and tiers: Loyverse, Smaregi.

Merchants everywhere praise "simple, fast, free" and complain about network dependence, small text, missing integrations and paying for single-purpose devices. The grocery-relevant UX moments worth copying:
- scale-label barcodes (weight- or price-embedded);
- department keys and a typed-weight keypad for loose goods;
- the semi-self split of scanning from paying;
- network-confirmed voice announcements of payments;
- produce suggestions with one-tap confirm-and-learn;
- one terminal switching modes (kiosk, ID check);
- a customer-facing screen that doubles as loyalty and marketing.

### Cited Findings
- **Offline:**
  - Airレジ needs internet ([airregi.jp](https://airregi.jp/) [P]); a user reports the register failed to start and the drawer stayed shut on a bad signal ([ITreview](https://www.itreview.jp/products/airregi/reviews) [U]).
  - Vyapar markets "offline-first" billing ([Lapaas](https://voice.lapaas.com/startup/vyapar/business-model/) [S, X]); QueueBuster markets online/offline modes ([QueueBuster](https://queuebuster.co/grocery/kirana-stores-pos-billing-software) [V, X]).
  - Alipay's phone voice alert fails when the app is killed or offline, which is why standalone speakers carry their own 4G ([Huawei](https://consumer.huawei.com/cn/support/content/zh-cn00410681/) [P, X]).
- **Onboarding:**
  - Airレジ: start on the iPad you already own, 0 yen ([airregi.jp](https://airregi.jp/) [P]); users say switching was smooth ([ITreview](https://www.itreview.jp/products/airregi/reviews) [U]).
  - Toss: "따로 배우지 않아도 누구나 쓸 수 있어요" ([App Store KR](https://apps.apple.com/kr/app/%ED%86%A0%EC%8A%A4-%EC%82%AC%EC%9E%A5%EB%8B%98-%ED%8F%AC%EC%8A%A4/id6447936572) [P, X]).
  - Loyverse runs on your own phone or tablet ([pricing](https://loyverse.com/pricing) [P]).
  - No source measured "minutes to first sale".
- **How free POS make money:**
  - Airレジ: free plus paid features, with the Airペイ payments funnel ([airregi.jp](https://airregi.jp/) [P]).
  - Loyverse: add-ons $5/$25/$25 per store per month plus payment partners ([pricing](https://loyverse.com/pricing) [P]).
  - Toss: free app; terminals priced on enquiry; free KakaoTalk messages as a hook ([retail page](https://tossplace.com/sector/retail), [yearend2024](https://tossplace.com/story/yearend2024) [V]).
  - Smaregi: free Standard plan plus paid Premium / Premium Plus ([JPX](https://www2.jpx.co.jp/disc/44310/140120240502581358.pdf) [P, X]).
  - Paytm: rental (~₹125/mo), device rental ~14% of revenue, lending (>85% of loan value to device merchants), soundbox ads ([TechCrunch](https://techcrunch.com/2023/01/17/google-pay-soundbox-india/), [The Quint](https://www.thequint.com/amp/story/tech-and-auto/soundbox-the-little-device-that-revolutionized-mobile-payments-in-india), [MediaNama](https://www.medianama.com/2024/10/223-paytm-to-monetize-soundbox-ads-in-partnership-with-meesho-a-shift-away-from-core-payments-business/) [S]).
  - Shouqianba: payment acquiring (users cite zero-fee WeChat as a lure) plus devices ([App Store CN](https://apps.apple.com/cn/app/%E6%94%B6%E9%92%B1%E5%90%A7-%E4%B8%AD%E5%B0%8F%E5%9E%8B%E5%95%86%E6%88%B7%E4%B8%93%E4%B8%9A%E7%A7%BB%E5%8A%A8%E6%94%AF%E4%BB%98%E6%94%B6%E6%AC%BE%E5%B7%A5%E5%85%B7/id980231513) [P/U]).
  - Sunmi: hardware plus platform ([Tiger Brokers](https://www.itiger.com/news/1107754503) [S]).
- **Customer-facing displays:**
  - Toss Front: custom home screen and background image, mini kiosk, points, face pay ([retail](https://tossplace.com/sector/retail), [yearend2024](https://tossplace.com/story/yearend2024) [V]; [Herald](https://www.heraldk.com/article/2025101216101225400) [S]).
  - Loyverse: a free Customer Display app ([pricing](https://loyverse.com/pricing) [P]).
  - 湃扬: a second screen showing ads ([NetEase](https://www.163.com/dy/article/HDN1F9V30518CPI9.html) [V]).
  - Japan: the semi-self payment machine is itself the customer-facing station ([NewsSwitch](https://newswitch.jp/p/2772) [S]).
  - India: Google Soundpod's LCD and Paytm's screen soundbox ([TechCrunch](https://techcrunch.com/2023/01/17/google-pay-soundbox-india/), [CXOToday](https://cxotoday.com/media-coverage/paytm-q4-fy-2025-revenue-of-%e2%82%b91911-cr-ebitda-before-esop-and-pat-improved-to-%e2%82%b981-cr-and-%e2%82%b923-cr-respectively/)).
  - Shanghai: a market-entrance screen with specials ([The Paper](https://m.thepaper.cn/baijiahao_16546170) [S]).
- **Loyalty:**
  - Toss: points and stamps, revisit coupons, prepaid and session passes, free KakaoTalk messages ([Toss Feed](https://toss.im/tossfeed/article/anniversary) [P], [yearend2024](https://tossplace.com/story/yearend2024) [V]).
  - Loyverse: a free loyalty program ([pricing](https://loyverse.com/pricing) [P]).
  - Shouqianba: member tools "留住老客户" ([App Store CN](https://apps.apple.com/cn/app/%E6%94%B6%E9%92%B1%E5%90%A7-%E4%B8%AD%E5%B0%8F%E5%9E%8B%E5%95%86%E6%88%B7%E4%B8%93%E4%B8%9A%E7%A7%BB%E5%8A%A8%E6%94%AF%E4%BB%98%E6%94%B6%E6%AC%BE%E5%B7%A5%E5%85%B7/id980231513) [P]).
- **Credit / tab (brief; covered in depth elsewhere):**
  - BUSY bundles khata credit with kirana billing ([BUSY](https://busy.in/accounting-software/retail-shop/kirana-store/) [V, X]).
  - Toss sells prepaid balances and session passes ([yearend2024](https://tossplace.com/story/yearend2024) [V]).
  - Paytm lends to device merchants ([The Quint](https://www.thequint.com/amp/story/tech-and-auto/soundbox-the-little-device-that-revolutionized-mobile-payments-in-india) [S]).
- **Age-restricted goods:** Toss's ID-check mode ([Toss Feed](https://toss.im/tossfeed/article/anniversary) [P]).
- **What reviewers complain about:**
  - Network dependence and slow page changes (Airレジ, [ITreview](https://www.itreview.jp/products/airregi/reviews) [U]).
  - Text that ignores the OS font size and a landscape-only phone app (Toss, [App Store KR](https://apps.apple.com/kr/app/%ED%86%A0%EC%8A%A4-%EC%82%AC%EC%9E%A5%EB%8B%98-%ED%8F%AC%EC%8A%A4/id6447936572) [U]).
  - Fees for single-purpose devices (Paytm, [TechCrunch](https://techcrunch.com/2023/01/17/google-pay-soundbox-india/) [U via S]).
  - Variant and modifier stock and payment integrations (Loyverse, [Capterra](https://www.capterra.com/p/150632/Loyverse-POS/reviews/?page=2) [U, X]).
  - Broken WhatsApp invoices (Vyapar, [Capterra IN](https://www.capterra.in/software/180579/vyapar) [U, X]).

### Inferences — ideas a Ukrainian grocery vertical could adopt (ranked by evidence × fit)
1. **Scale-label barcodes of both kinds, configurable per store.** Support weight-embedded labels (Loyverse: 20/02 + 5-digit SKU + 5-digit grams → integer grams fits the existing unit model) and price-embedded labels (Japan NON-PLU 02/20, optional price check digit, Sharp). Make the prefix and the field lengths settings, because label-printing scales differ. Scan → the line appears with weight and amount, no keypad.
2. **Loose goods without a scale link:**
   - a department or quick key (Airレジ 部門打ち) for "Овочі — 37,50";
   - a big-digit weight keypad showing ₴/kg × weight = total live (Loyverse);
   - the cashier's last and most frequent produce first, numeric PLU entry, and one-tap confirm, i.e. the AI-scale shape without the camera.
3. **Split scanning from paying (セミセルフ).** The cashier keeps scanning the next basket while the customer pays on the customer-facing terminal (card/QR) and, later, a cash recycler. Japanese 1–3-store chains prefer this to full self-checkout about 5:1, and Maruetsu measured ~1.4× throughput.
4. **A network-confirmed "payment received" voice and banner with a replay button** for QR/instant payments (Paytm, PhonePe, Shouqianba): spoken in Ukrainian, triggered by the bank or acquirer callback, never by the customer's phone, and **free inside the POS**. Merchants resent paying "just for speaking".
5. **One terminal, several modes:** a self-order/self-pay kiosk mode, and an ID or age prompt when alcohol or tobacco is in the basket (Toss kiosk and ID-check modes).
6. **The customer-facing screen as a loyalty and marketing canvas:** the store's own background and promos, loyalty points, the running total, and a "Сплачено ✓" state (Toss Front, Loyverse CFD, 湃扬's ad screen).
7. **Accessibility from day one:** follow the OS text size, high-contrast menus, and a portrait layout for owner and phone use (Toss complaints).
8. **An offline-first till as a sales argument.** Airレジ users lose sales when the drawer won't open offline, and Vyapar sells "offline-first". This team's desktop till already queues offline, so make it visible on the grocery landing page.
9. **Owner-controlled prices:** staff cannot change the price at the counter or scale without permission (Shanghai smart markets).
10. **Receipts and promotions through the local messenger** (Vyapar's WhatsApp, Toss's KakaoTalk). In Ukraine that likely means Viber or Telegram — an inference about Ukrainian channel habits, not sourced here.
11. **Price-ladder lesson:** a free core with small per-store add-ons (Loyverse $5/$25/$25) works, but even $5 for history draws angry reviews. Put essentials such as history, inventory alerts and the customer display in the free core.

### Gaps
- No systematic, sourced comparison of offline behaviour across Toss, Loyverse, Shouqianba and Smaregi.
- No source quantified onboarding time (minutes to first sale) for any product.
- No adoption data for customer-facing displays or loyalty usage at grocery-type shops.
- Not covered for lack of search budget: Square Japan, Ubiregi, Keruyun, Meituan 收银, Aclas/Dahua/Hikvision AI scales, Qasir, GrabMerchant, JioMart Partner, Khatabook, Dukaan. A follow-up search round could fill these.
