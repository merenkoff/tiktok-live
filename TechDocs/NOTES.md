# Локальные заметки по проекту

POS post-MVP / штрихкоди: [[POS_POST_MVP]] · [[POS_GTIN_ENRICHMENT]] · [[POS_GTIN_SETUP]] · [[POS_GTIN_LEARNING_API]] · [[POS_GTIN_TODO]] · [[RAILWAY_POS]] · [[POS_DESKTOP]] · [[POS_PWA]]

## Две копии через границу чанка `@pos/platform` (2026-09-23)

Найдено при PWA-треке ([[POS_PWA]] §2), оба в проде до него:

- `cashier-main.tsx` включал офлайн через относительный импорт `./offline/enabled` — вторая копия флага, которую чанк платформы не читал: релизная десктопная касса офлайн-рантайм не запускала (в `tauri:dev` всё в одном бандле, не видно). Теперь через барел, `enabled.ts` в `STATE_OWNERS` проверки границы.
- `lib/checkoutError.ts` сравнивал ошибки офлайна через `instanceof` с классами из чанка — на собранной оболочке всегда `false`, `FiscalSaleUnknownError` читалась как `rejected` без «Перевірити ще раз». Теперь по `.name`.

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

## Тот же дрейф, но с другой стороны: сама БД (2026-09-17)

Код тогда привели к схеме, а **прод-база осталась в MVP-форме**: `orders` и `reservations`
существовали без `user_id`, `session_id`, `status`, `payment_status`. `001_create_schema.sql`
объявляет таблицы через `CREATE TABLE IF NOT EXISTS`, а это про существующую таблицу молчит —
новые колонки в старую таблицу не добавляются никогда. Наружу торчало только шесть упавших
`CREATE INDEX` (`⚠️ Schema statement skipped (missing column)` в логе каждого деплоя) и cron
чистки резервов, падавший раз в минуту с `42703`. Хуже: в обработчике `42703` было написано
«retry after ALTERs», но ретрая не было — statement просто терялся.

Что сделано:

- на проде обе таблицы снесены (данных не было ни одного) — при следующем старте они
  создались из файла схемы целиком, с `NOT NULL`, FK и всеми индексами;
- `initializeDatabase` ([src/db.ts](../src/db.ts)) теперь складывает упавшие с `42703`
  statement'ы в `deferred`, вызывает `repairLegacyLiveColumns()` (табличный список
  `ADD COLUMN IF NOT EXISTS` — nullable и без FK, потому что в таблицу со строками
  `NOT NULL` не добавить) и **переприкладывает отложенное**, логируя, что восстановилось;
- `src/__tests__/live-schema-repair.test.ts` строит легаси-форму обеих таблиц, прогоняет
  настоящую инициализацию и проверяет колонки, индексы, запрос cron'а и вставку брони.
  Без правки падают все шесть кейсов.

Вывод на будущее: у LIVE-стороны нет раннера миграций, только файл схемы, поэтому любая новая
колонка в существующей таблице должна попадать и в `LEGACY_COLUMNS`, иначе старая база её не
увидит. POS-сторона этой проблемы не имеет — там нумерованные миграции (`src/pos/migrations.ts`).
