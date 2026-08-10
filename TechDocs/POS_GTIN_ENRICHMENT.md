# POS · GTIN enrichment — API, реєстрація, гроші, безкоштовні шляхи

Дослідження + статус імплементації підказки назви за штрихкодом у приході.

Пов’язано: [[POS_GTIN_SETUP]] · [[POS_POST_MVP]] · [[RAILWAY_POS]]

> **Статус:** free path **реалізовано** (кеш + Open*Facts + UPCitemdb + upc.dev).  
> GS1 enterprise — як і раніше поза scope.  
> Налаштування ключів: [[POS_GTIN_SETUP]].

---

## 1. Продуктові правила

| Правило | Деталі |
|--------|--------|
| Лише **підказка** | Prefill `name` у формі заглушки; юзер може змінити / очистити |
| Не блокує | Немає в базі / офлайн / ліміт → тиха форма |
| Не auto-create | Товар у каталог тільки після «Провести» |
| Кеш без TTL | `filled_at` / `updated_at`; eviction — на майбутнє |
| Feature flag | `pos_stores.gtin_lookup_enabled` default **true** |

---

## 2. Реалізовані джерела

| Джерело | Як | Квота |
|---------|-----|--------|
| Власний `pos_gtin_cache` | server | ∞ |
| Open Products / Food / Beauty Facts | **клієнт** (CORS `*`) | 1 скан ≈ 1 req |
| UPCitemdb trial | **server** proxy | 100/день (окремий budget) |
| [upc.dev](https://upc.dev/) Free | **server** + `UPC_DEV_API_KEY` | 100/день (окремий budget) |

UPCitemdb **немає** CORS для наших origin — клієнтські квоти для нього неможливі без proxy.

---

## 3. GS1 (не імплементовано)

- [GEPIR UA веб](https://newgepir.gs1ua.org/search/gtin) — безкоштовний ручний пошук, без офіційного API
- [Verified by GS1](https://www.gs1.org/services/verified-by-gs1) — веб ~30/день; enterprise API через [GS1 Україна](https://gs1ua.org/verified-gs1/) (орієнтир тисячі €/рік)

---

## 4. Flow

```
скан/EAN у stub
  → GET cache
  → parallel Open*Facts (browser) → POST ingest
  → POST quota-providers (upcitemdb ∥ upc_dev)
  → miss → ручна назва
```

Merge priority (default):  
`open_products_facts` > `upc_dev` > `upcitemdb` > `open_beauty_facts` > `open_food_facts` > `manual`  
Override: `GTIN_SOURCE_PRIORITY`.

---

## 5. Що часто забувають

Див. чеклист у [[POS_GTIN_SETUP]].
