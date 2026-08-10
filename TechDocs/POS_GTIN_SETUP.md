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

## Обов’язково лише для upc.dev

1. Відкрий [upc.dev](https://upc.dev/) → **Get your free API key** (без кредитки, 100 lookup/день).
2. У Railway → **API service** → Variables додай:

```
UPC_DEV_API_KEY=your_key_here
```

3. Redeploy API.

Без ключа upc.dev **тихо пропускається** — решта джерел працює.

Локально додай той самий рядок у `.env`.

---

## Опційні змінні оточення

| Змінна | Навіщо | Default |
|--------|--------|---------|
| `GTIN_UPCITEMDB_DAILY_LIMIT` | стеля UPCitemdb на сервері | `100` |
| `GTIN_UPC_DEV_DAILY_LIMIT` | стеля upc.dev | `100` |
| `GTIN_SOURCE_PRIORITY` | порядок merge, через кому | kidswear: products → upc_dev → upcitemdb → beauty → food → manual |
| `GTIN_CONTACT_EMAIL` | контакт у User-Agent на server-викликах | порожньо |
| `VITE_GTIN_OPEN_FACTS_ENABLED` | на UI: вимкнути Open*Facts (`false`) | увімкнено |

Приклад food-first:

```
GTIN_SOURCE_PRIORITY=open_food_facts,open_products_facts,upc_dev,upcitemdb,open_beauty_facts,manual
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
- [ ] (З ключем) `best_source` / підказка може бути `upc.dev`
- [ ] Після ~100 server-викликів upcitemdb за день UI не падає

---

## Архітектура коротко

1. `GET /api/pos/gtin/:code` — кеш  
2. Клієнт: parallel Open*Facts → `POST /gtin/ingest`  
3. Якщо miss: `POST /gtin/lookup/quota-providers` (UPCitemdb + upc.dev з окремими бюджетами)  
4. Placeholder з barcode навчає кеш (`manual`)
