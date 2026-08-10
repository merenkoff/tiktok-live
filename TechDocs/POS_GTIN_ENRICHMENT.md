# POS · GTIN enrichment — API, реєстрація, гроші, безкоштовні шляхи

Дослідження для post-MVP підказки назви товару після скану штрихкоду в приході.

Пов’язано: [[POS_POST_MVP]] · [[RAILWAY_POS]]

> Статус: **не імплементувати зараз**. Документ для рішення «коли / чим / за скільки».

---

## 1. Що ми хочемо продуктово

| Правило | Деталі |
|--------|--------|
| Лише **підказка** | Prefill `name` (+ barcode) у формі заглушки; юзер може змінити |
| Не блокує | Немає в базі / офлайн / ліміт → тиха форма як зараз |
| Не auto-create | Товар у каталог тільки після «Провести» |
| Server-side proxy | Ключі API не на клієнті; кеш GTIN у нас |
| Feature flag | `gtin_lookup_enabled` default **off** |

---

## 2. GS1: веб vs API (що платно)

### 2.1. Веб-пошук GEPIR (UA) — безкоштовно

- UI: [newgepir.gs1ua.org/search/gtin](https://newgepir.gs1ua.org/search/gtin)
- Без логіну, без оплати для **ручних** запитів
- Часто повертає **компанію-власника** коду, не «бодик 74»
- **Немає офіційного публічного REST API** для вбудовування в POS
- Скрейпити сайт у прод — погана ідея (ToS, нестабільність, блокування)

### 2.2. Verified by GS1 (глобальний веб) — безкоштовно з лімітом

- Сервіс: [gs1.org/services/verified-by-gs1](https://www.gs1.org/services/verified-by-gs1)
- Пояснення UA: [gs1ua.org/verified-gs1](https://gs1ua.org/verified-gs1/)
- Публічний веб: **~30 запитів / 24 год** на користувача (антиаб’юз)
- Для продакшену POS цього мало

### 2.3. Enterprise / API Verified by GS1 — платно / через локальну GS1

Офіційної публічної прайс-сторінки «для всіх країн» немає. Доступ і ціна — через **локальну Member Organisation**.

**Як зареєструватися (типовий шлях для UA):**

1. Зв’язатися з [Асоціацією GS1 Україна](https://gs1ua.org/) / [контакти](https://gs1ua.org/en/gs1-ukrayina/contacts) — спитати **Verified by GS1 API / enterprise lookup** для ритейлу (не для видачі власних GTIN).
2. Уточнити: чи потрібне **членство** асоціації, NDA, контракт, обсяг запитів/міс.
3. Отримати credentials + OpenAPI / endpoint (у різних країн різний API Hub).
4. Укласти договір на обсяг (batch + API).

**Орієнтир цін (інша країна, не UA прайс):**  
[GS1 Switzerland API Hub](https://www.gs1.ch/en/barcodes-standards/api-hub) публікує для Verified by GS1:

| Тариф (приклад CH) | Орієнтовно |
|--------------------|------------|
| TRY (тест, не прод) | **CHF 0** / рік |
| Платні прод-пакети | **CHF ~5 500** і **~9 900** / рік |

Це **не** рахунок для України — лише порядок величини: enterprise GS1 = тисячі €/рік, не «$29/міс SaaS».

**Що уточнити у GS1 UA (чеклист листа):**

- [ ] Чи є API VbG для нечленів / лише для членів?
- [ ] Ціна за рік / за 1 000 запитів / included quota
- [ ] Чи можна кешувати відповіді у своїй БД
- [ ] Дозволене комерційне використання в POS для продавців одягу
- [ ] Які поля в відповіді (brand, gtinName, image) vs лише company prefix
- [ ] SLA, sandbox, rate limits

---

## 3. Як закрити ідею **безкоштовно** (реалістично)

Покриття **UA kidswear / опт / ноунейм** скрізь слабке. Мета MVP-підказки — «іноді допомогло», не «завжди знайде».

### Рекомендована безкоштовна стратегія (waterfall)

```
скан EAN
  → 1) наш кеш (Postgres)
  → 2) Open Products Facts (без ключа)
  → 3) UPCitemdb trial (100/день, без signup)
  → 4) (опційно) Open Food Facts / Beauty — якщо колись універсальний магазин
  → miss → форма заглушки вручну
```

### 3.1. Open Products Facts — найкращий «справді відкритий» варіант

- Сайт / data: [openproductsfacts.org](https://world.openproductsfacts.org) · dumps: [data page](https://world.openproductsfacts.org/data) (або sibling openfoodfacts data)
- Live API (приклад):  
  `GET https://world.openproductsfacts.org/api/v2/product/{barcode}.json`
- **Безкоштовно**, open data (ODbL) — читати ToS/reuse
- Умова використання API: **1 виклик ≈ 1 реальний скан юзера**; скрейп усієї БД через API блокують → для bulk є **нічні dumps**
- Header з User-Agent / контактним email — recommended
- Покриття одягу **рідке**, але для частини імпортних брендів інколи є title/brand/image
- Sibling-и: [Open Food Facts](https://world.openfoodfacts.org) (їжа), [Open Beauty Facts](https://world.openbeautyfacts.org) (косметика) — для kidswear майже нерелевантні

**Реєстрація:** не обов’язкова для read API; для ввічливості — написати на reuse@… / вказати app у header.

### 3.2. UPCitemdb — безкоштовний trial без реєстрації

- Docs: [upcitemdb.com/api](https://www.upcitemdb.com/api/) · [план](https://www.upcitemdb.com/wp/docs/main/development/plan/)
- Free **EXPLORER**: **100 combined req/день**, без signup
- Endpoint: `https://api.upcitemdb.com/prod/trial/lookup?upc=...`
- Burst: ~6 lookup / хв; sustainable ~1 / 10 с
- База загальний retail (US-важка) — для UA kidswear hit-rate невідомий, треба прогнати 20–50 реальних EAN з вашого складу
- Paid DEV/PRO — коли виросте обсяг (десятки тисяч req/день)

### 3.3. Інші freemium (другорядні)

| Сервіс | Free | Нотатки |
|--------|------|---------|
| [upc.dev](https://upc.dev/) | ~100/день + key | Freemium SaaS |
| GTINHub / подібні | 3–10/день | Тільки smoke-test |
| EcomSource тощо | freemium | Часто Amazon-орієнтовані |

Не перший пріоритет для UA одягу.

### 3.4. Чого **немає** безкоштовно «як у великих»

| Джерело | Чому не підходить як free API |
|---------|-------------------------------|
| Amazon Product Advertising API | Не «відкритий barcode DB»; ключі, афіліат, ToS |
| Google Shopping | Публічного безкоштовного EAN→title API немає; EAN-пошук обмежили |
| Rozetka / OLX / Prom | Немає офіційного публічного GTIN lookup API |
| Square Item library | Закритий ритейл-каталог Square, не для нас |
| Парсинг GEPIR UI | Крихко + юридично сумнівно |

### 3.5. «Безкоштовно і надійно» для вашого кейсу

Найкращий **безкоштовний** і чесний шлях саме для Cloth POS:

1. **Власний кеш** успішних lookups + ручних назв по barcode (росте з кожним приходом).
2. Waterfall **OPF → UPCitemdb** тільки як soft-hint.
3. GS1 enterprise — **пізніше**, якщо hit-rate і бізнес виправдають тисячі €/рік.

Це і є «закрити ідею безкоштовно»: підказка інколи є, каса не ламається, квот не палимо.

---

## 4. Що часто забувають (чеклист перед імплементацією)

- [ ] **Privacy / ToS** кожного провайдера (кеш, передача EAN на третю сторону)
- [ ] **User-Agent + контакт** у HTTP headers
- [ ] **Rate limit + черга** на бекенді (не з браузера каси)
- [ ] **Кеш** `gtin → {name, brand, source, fetched_at}` (TTL тижні)
- [ ] **Нормалізація** коду (EAN-8/12/13, leading zeros, check digit)
- [ ] UI: показати джерело («знайдено в Open Products Facts») + кнопка «очистити»
- [ ] Метрика hit-rate по джерелах на реальних штрихкодах магазину
- [ ] Feature flag per store
- [ ] Не логувати повні відповіді з PII (якщо з’являться)
- [ ] Fallback copy українською без «помилка API»

---

## 5. Технічний скелет (коли дійдемо)

```
GET /api/pos/catalog/gtin-lookup?code=4820…
→ { found, name?, brand?, image_url?, source: 'cache'|'opf'|'upcitemdb'|'gs1', raw? }
```

Порядок у сервісі: cache → OPF → UPCitemdb → (optional GS1) → `{ found: false }`.

Тести: mock HTTP; hit/miss/timeout; feature flag off; не викликати зовнішнє при повторному тому ж GTIN у межах TTL.

---

## 6. Висновок

| Питання | Відповідь |
|---------|-----------|
| GEPIR веб платний? | **Ні** (ручний пошук) |
| GS1 API для POS? | **Так, через договір з GS1 MO**; орієнтир — тисячі CHF/€/рік (приклад CH), UA — питати в асоціації |
| Як безкоштовно закрити? | Waterfall **Open Products Facts + UPCitemdb trial + власний кеш**; очікувати низький hit-rate на kidswear |
| Великі сайти з відкритим API? | Повноцінного «Amazon/Google GTIN free» немає; найближче — **Open*Facts** екосистема |

Коли будете готові імплементувати — окремий implementation-план + оновити статус у [[POS_POST_MVP]].
