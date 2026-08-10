# POS · GTIN Learning API

Масове наповнення [`pos_gtin_cache`](../migrations/008_pos_gtin_cache.sql) без live-скрейпу Open Facts HTTP API.

Пов’язано: [[POS_GTIN_SETUP]] · [[POS_GTIN_ENRICHMENT]] · [[POS_POST_MVP]]

---

## Навіщо окремо від live lookup

| Live (прихід) | Learning |
|---------------|----------|
| 1 скан → 1–few зовнішніх запитів | Batch / dump → тисячі рядків у кеш |
| Open*Facts з браузера + UPCitemdb/upc.dev | Офлайн дампи ODbL або ваш batch JSON |
| Немає TTL | Той самий кеш, score-safe merge |

Після навчання `GET /gtin/:code` у приході б’є лише нашу БД.

---

## Auth

Усі endpoints — **owner** (та сама сесія, що адмін POS).  
Якщо `pos_stores.gtin_lookup_enabled = FALSE` → `403`.

Base path: `/api/pos` (як інші POS routes).

---

## Endpoints

### `POST /gtin/learn/batch`

Навчити кеш з масиву (max **500** items).

```bash
curl -s -X POST "$API/api/pos/gtin/learn/batch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "gtin": "4820000000017", "name": "Бодик коричневий", "brand": "Acme", "source": "manual" },
      { "gtin": "bad", "name": "skip me" }
    ]
  }'
```

Відповідь:

```json
{
  "accepted": 1,
  "upserted": 1,
  "skipped": [{ "gtin": "bad", "reason": "bad_gtin:non_digits" }]
}
```

`source` default: `manual`. Дозволені: `manual`, `open_products_facts`, `open_food_facts`, `open_beauty_facts`, `upcitemdb`, `upc_dev`.

Skip reasons: `bad_gtin:*`, `empty_name`, `bad_source`.

### `GET /gtin/learn/stats`

```bash
curl -s "$API/api/pos/gtin/learn/stats" -H "Authorization: Bearer $TOKEN"
```

Повертає `cache_total`, `by_source`, `events_24h`, `recent_jobs`.

### `POST /gtin/learn/jobs`

Старт seed з локальних дампів у `GTIN_DUMP_DIR` (default `data/gtin-dumps`).

```bash
curl -s -X POST "$API/api/pos/gtin/learn/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "datasets": ["products"], "limit": 10000 }'
```

`datasets`: `products` | `food` | `beauty`. Job стартує в процесі API (`setImmediate`).

### `GET /gtin/learn/jobs/:id`

Статус: `queued` | `running` | `done` | `failed` | `cancelled` + counters.

### `POST /gtin/learn/jobs/:id/cancel`

М’яка відміна (`cancel_requested`).

### Перевірка hit

```bash
curl -s "$API/api/pos/gtin/4820000000017" -H "Authorization: Bearer $TOKEN"
```

---

## Дампи Open*Facts (ODbL)

1. Завантаж офіційний dump (не через live product API для bulk):
   - Products / Food / Beauty — CSV/TSV/JSONL з [Open Food Facts data](https://world.openfoodfacts.org/data) та sibling-сайтів.
2. Поклади файл у `data/gtin-dumps/` з ім’ям на кшталт:
   - `products.tsv` / `products.tsv.gz`
   - `food.jsonl` / `beauty.csv.gz`
3. Env: `GTIN_DUMP_DIR=/absolute/path` (опційно).

**Атрибуція:** дані Open*Facts — ODbL; дотримуйтесь їхніх умов reuse.

---

## CLI (повний / великий dump)

Краще на машині з диском, ніж довгий HTTP на Railway:

```bash
# після migrate
GTIN_DUMP_DIR=./data/gtin-dumps \
  npx tsx src/pos/gtin/seed-from-dump.ts --dataset products --limit 10000
```

Без `--limit` обробить увесь файл (може бути довго).

---

## Merge / пріоритет

Той самий `GTIN_SOURCE_PRIORITY`, що й live lookup.  
`manual` і вищий score **не** затираються гіршим рядком з dump.

---

## Troubleshooting

| Симптом | Що перевірити |
|---------|----------------|
| `403 gtin lookup disabled` | `UPDATE pos_stores SET gtin_lookup_enabled = TRUE` |
| job `failed` dump not found | файл у `GTIN_DUMP_DIR`, ім’я `products.tsv` тощо |
| batch `bad_gtin:bad_check_digit` | валідний EAN/UPC з check digit |
| Railway timeout на великому job | CLI one-off / `limit` |

Міграція: `009_pos_gtin_learn_jobs.sql` (через `npm run pos:migrate`).
