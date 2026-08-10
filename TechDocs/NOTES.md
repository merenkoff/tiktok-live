# Локальные заметки по проекту

POS post-MVP / штрихкоди: [[POS_POST_MVP]] · [[POS_GTIN_ENRICHMENT]] · [[RAILWAY_POS]]

## Inventory

- Таблицы `inventory` **нет** в реальной схеме (`migrations/001_create_schema.sql`) и в коде.
- Упоминания в `ARCHITECTURE.md`, `PROJECT_SUMMARY.md`, `IMPLEMENTATION_GUIDE.md` — устаревшие.
- Остатки/каталог товаров не ведутся.
- «Доступность» = нет активной брони в `reservations` по паре `product_code` + `size` с `expires_at > NOW()`.
- Эндпоинт: `GET /api/availability/:productCode/:size`.
