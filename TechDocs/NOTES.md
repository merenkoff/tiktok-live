# Локальные заметки по проекту

POS post-MVP / штрихкоди: [[POS_POST_MVP]] · [[POS_GTIN_ENRICHMENT]] · [[POS_GTIN_SETUP]] · [[POS_GTIN_LEARNING_API]] · [[RAILWAY_POS]] · [[POS_DESKTOP]]

## Inventory

- Таблицы `inventory` **нет** в реальной схеме (`migrations/001_create_schema.sql`) и в коде.
- Упоминания в `TechDocs/archive/ARCHITECTURE.md`, `PROJECT_SUMMARY.md`, `IMPLEMENTATION_GUIDE.md` — устаревшие. Весь набор MVP-доков перенесён из корня в `TechDocs/archive/` 2026-09-06 (см. `TechDocs/archive/README.md`), в корне остались только `README.md`, `CLAUDE.md`, `ИНСТРУКЦИЯ.md`.
- Остатки/каталог товаров не ведутся.
- «Доступность» = нет активной брони в `reservations` по паре `product_code` + `size` с `expires_at > NOW()`.
- Эндпоинт: `GET /api/availability/:productCode/:size`.
