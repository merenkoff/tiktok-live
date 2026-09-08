# POS · GTIN enrichment — налаштування

Пов’язано: [[POS_GTIN_ENRICHMENT]] · [[POS_POST_MVP]] · [[RAILWAY_POS]]

Підказка назви товару за штрихкодом у приході (форма «Створити новий товар»).

---

## Що працює без ключів

Після деплою з міграцією `008_pos_gtin_cache.sql`:

- власний кеш (без TTL)
- Open Products Facts + Open Food Facts + Open Beauty Facts (з браузера)
- UPCitemdb trial (~100 запитів/день з **сервера**)

Міграція застосовується через `npm run pos:migrate` або при старті API на Railway (`node dist/pos/migrate.js`).

---

## Ключів не потрібно

Усі три живі джерела працюють без реєстрації:

- **Open Products / Food / Beauty Facts** — з браузера каси, CORS `*`;
- **UPCitemdb trial** — через наш сервер, 100 запитів на добу на IP.

> **upc.dev прибрано 2026-09-09** — провайдер вигадував назви (деталі в
> [[POS_GTIN_ENRICHMENT]]). Ключ отримувати не треба; `UPC_DEV_API_KEY` більше
> ніде не читається, а поля «API-ключ» і «Ліміт на добу» зникли з налаштувань.

---

## Опційні змінні оточення

| Змінна | Навіщо | Default |
|--------|--------|---------|
| `GTIN_UPCITEMDB_DAILY_LIMIT` | стеля UPCitemdb на сервері | `100` |
| `GTIN_SOURCE_PRIORITY` | порядок merge, через кому | manual → products → upcitemdb → beauty → food |
| `GTIN_CONTACT_EMAIL` | контакт у User-Agent на server-викликах | порожньо |
| `VITE_GTIN_OPEN_FACTS_ENABLED` | на UI: вимкнути Open*Facts (`false`) | увімкнено |

Приклад food-first:

```
GTIN_SOURCE_PRIORITY=manual,open_food_facts,open_products_facts,upcitemdb,open_beauty_facts
```

---

## Вимкнути на магазин

У БД:

```sql
UPDATE pos_stores SET gtin_lookup_enabled = FALSE WHERE id = <store_id>;
```

Endpoints тоді відповідають `403`.

---

## Масове наповнення кешу

Batch ingest і seed з дампів Open*Facts — окремий продукт: [[POS_GTIN_LEARNING_API]].

---

## Чеклист після деплою

- [ ] Міграція `008` є в логах start
- [ ] Прихід → «Нічого не знайдено» → створити новий → EAN → немає crash при miss
- [ ] Повтор того ж EAN після успіху → підказка з кешу
- [ ] Після ~100 server-викликів upcitemdb за день UI не падає

---

## Архітектура коротко

1. `GET /api/pos/gtin/:code` — кеш  
2. Клієнт: parallel Open*Facts → `POST /gtin/ingest`  
3. Якщо miss: `POST /gtin/lookup/quota-providers` (UPCitemdb, з добовим бюджетом)  
4. Placeholder з barcode навчає кеш (`manual`)
