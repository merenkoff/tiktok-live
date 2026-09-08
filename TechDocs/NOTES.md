# Локальные заметки по проекту

POS post-MVP / штрихкоди: [[POS_POST_MVP]] · [[POS_GTIN_ENRICHMENT]] · [[POS_GTIN_SETUP]] · [[POS_GTIN_LEARNING_API]] · [[POS_GTIN_TODO]] · [[RAILWAY_POS]] · [[POS_DESKTOP]]

## Inventory

- Таблицы `inventory` **нет** в реальной схеме (`migrations/001_create_schema.sql`) и в коде.
- Упоминания в `TechDocs/archive/ARCHITECTURE.md`, `PROJECT_SUMMARY.md`, `IMPLEMENTATION_GUIDE.md` — устаревшие. Весь набор MVP-доков перенесён из корня в `TechDocs/archive/` 2026-09-06 (см. `TechDocs/archive/README.md`), в корне остались только `README.md`, `CLAUDE.md`, `ИНСТРУКЦИЯ.md`.
- Остатки/каталог товаров не ведутся.
- «Доступность» = нет активной брони в `reservations` по тройке `user_id` + `product_code` + `size` со `status = 'reserved'` и `expires_at > NOW()`.
- Эндпоинт: `GET /api/availability/:productCode/:size` (требует токен, продавец = владелец токена).

## Настройки LIVE: только БД, не env (2026-09-08)

Раньше часть настроек читалась из переменных окружения, оставшихся от одно-пользовательского MVP,
и поэтому поля в админке (go.the-live.shop → Налаштування) ни на что не влияли:

| Было (env) | Стало |
|---|---|
| `RESERVATION_TIMEOUT_MINUTES` | `user_settings.reservation_timeout_minutes` |
| `NOVAPOSHTA_API_KEY` / `NOVAPOSHTA_MERCHANT_NAME` | `user_settings.novaposhta_*` |
| `TIKTOK_USERNAME`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` | уже были в `user_settings`; env-копии удалены вместе с MVP-синглтонами `src/tiktok.ts` и `src/telegram.ts` |

Настройки читаются один раз при старте сессии (`sessions.manager.ts` кладёт их в `ActiveSession`)
и дальше передаются вниз. Это осознанно: одна трансляция идёт с одним набором настроек,
изменения подхватываются только после stop/start. Онлайн-модуль `tiktok-live` в POS работает
через тот же `users`-ряд (мост `POST /api/pos/live/session-token`), так что настройки у него
те же самые, отдельной копии нет.

## Дрейф схемы, который был исправлен заодно (2026-09-08)

`src/reservations.ts` и `src/orders.ts` были написаны под MVP-схему и падали на реальной:

- `reservations` INSERT без `user_id` / `session_id` → `null value in column "user_id" violates not-null constraint`;
- `orders` SELECT колонок `telegram_id` / `nova_poshta_branch` / `payment_confirmed_at` / `shipped_at`,
  которых в таблице нет → `42703 undefined_column`.

То есть весь путь «комментарий → бронь → заказ» не работал; жили только лента комментариев и логи сессии.
