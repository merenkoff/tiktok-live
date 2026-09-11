# Фискализация ПРРО — общий план и точка возобновления

Подключение украинского ПРРО (програмний РРО) к POS: чек продажи и чек возврата
уходят провайдеру фискализации, возвращаются с фискальным номером и налоговым QR,
и это видно кассиру в «Чеках» и на печатном чеке.

**Этот документ — точка возобновления.** Если сессия потеряна — начинать отсюда:
раздел [«Прогресс по фазам»](#прогресс-по-фазам) говорит, где мы остановились.
Каждая фаза выполняется отдельным планом; после завершения фазы **обновить
таблицу прогресса в этом файле**.

Статус: **все фазы v1 завершены (1, 2а, 2б, 3, 4, 5, 6)** — бэкенд, реальный
адаптер Checkbox и клиент готовы: схема (миграция 024), шифрование секретов,
настройки, контракт `FiscalProvider`, таксономия ошибок, маппинг, лимитер,
смены, реестр документов, оркестрация чекаута, а на клиенте — три исхода на
кассе, блокировка офлайн-продажи, ремонт outbox, бейджи в «Чеках» и карточка
настроек. Фаза 6 добавила провайдеро-специфичный UI как online-only бандл
(`fiscal-checkbox`, по образцу `tiktok-live`) — его страницы `/admin/fiscal`
и `/fiscal` работают и проверены живьём в браузере. Фаза 2б добавила сам
адаптер `providers/checkbox/` и зарегистрировала его в `BUILT_IN` — магазин с
настоящими Checkbox-кредами теперь реально фискализирует продажи, возвраты и
службові чеки, что подтверждено вживую (не только юнит-тестами на
фикстурах) через `/api/pos/sales/complete` → реальный `fiscal_code` от
`api.checkbox.in.ua`. Фаза 8а закрыла печать: на бумагу теперь уходит либо чек провайдера как есть
(`receipt_source='provider'`), либо наш макет с фискальным блоком и QR ДПС —
до неё касса печатала слип без единого фискального поля. Осталось вне
области v1 (фаза 8б) — Вчасно, Є-Чек, полный офлайн-режим ПРРО.

Следующий шаг — **фаза 7** (обкатка: seed для локальной разработки без
sandbox-кредов, CI-выпуск бандла `fiscal-checkbox`, ранбук для оператора —
последний уже есть: [POS_FISCAL_CHECKBOX_SETUP.md](POS_FISCAL_CHECKBOX_SETUP.md)).

---

## 1. Ответ на исходный вопрос

> Может ли модуль «Чеки та повернення» содержать в себе варианты фискализации,
> подключаемые выбором версии модуля?

Частично.

- **Да** — «Чеки та повернення» это правильное *место*, где кассир видит
  фискальный результат.
- **Нет** — выбирать провайдера «версией модуля» нельзя. Фискализация по природе
  **бэкендовая**: license key и PIN кассира нельзя класть в бандл, который лежит
  на CDN и грузится в браузер кассира; чек обязан фискализироваться ровно один
  раз (идемпотентность + ретраи + хранение фискального номера в Postgres); чек
  возврата обязан ссылаться на фискальный номер продажи.
- **Механизма «модуль расширяет модуль» в коде сегодня нет вообще.**
  `ModuleDescriptor.requires` (`pos/src/modules/types.ts:108`) объявлен, но нигде
  не читается в рантайме, и явно `Omit`-ится из `RemoteModuleDescriptor`
  (`pos/src/modules/registry.ts:84-101`). Кросс-модульных импортов ноль. Слотов,
  шины событий, точек расширения — нет.

**Вывод: механизм слотов изобретать не нужно и не надо.** Фискальный результат
(статус, фискальный номер, QR, ошибка) — это **обычные доменные поля продажи**,
которые рендерит хост. Иначе и быть не может:

1. ESC/POS-чек собирается **в Rust** (`pos/src-tauri/src/hardware/receipt.rs:100-200`,
   `build_ticket`, из serde-структуры) — туда никакой JS-модуль не «впрыгнет» ни
   за какие деньги.
2. Автопечать срабатывает в **хостовой** странице (`pos/src/pages/register/RegisterPage.tsx:143-179`),
   до того как смонтирован хоть один модульный роут.
3. Офлайн-зеркало чеков в Dexie принадлежит хосту (`LocalSaleRow.detail`,
   `pos/src/offline/db.ts:89-100`) — фискальные поля должны рендериться офлайн из
   кэша, которого модуль не касается.

---

## 2. Архитектура (гибрид)

| Слой | Что там | Почему именно там |
|---|---|---|
| **Бэкенд** `src/pos/fiscal/` | Интерфейс `FiscalProvider`, адаптеры провайдеров, секреты (AES-256-GCM), реестр фискальных документов, оркестрация, кроны | Секреты, идемпотентность, ретраи, жизненный цикл смены |
| **Хост-фронт** | Фискальные поля на экране успеха, в «Чеках», в `SaleDetail`, на печатном чеке; тумблер вкл/выкл + выбор провайдера в `SettingsPage` | Rust-печать и офлайн-кэш модулю недостижимы |
| **Модуль-бандл на провайдера** `fiscal-checkbox` | Только свои роуты: `/admin/fiscal` (креды, тест связи, диагностика) и `/fiscal` (смена, Z/X-отчёт, внесение/изъятие) | Разный код клиента, когда дойдём до Checkbox Kasa / Вчасно Device Manager |

### Отдельный id модуля на каждого провайдера

`fiscal-checkbox`, `fiscal-vchasno`, `fiscal-echeck` — а **не** один `fiscal`
с тремя разными URL.

- Кэш модулей на десктопе ключуется на `moduleId` + semver и качает только
  строго новее (`pos/src-tauri/src/module_remotes.rs:256-270`). Смена провайдера
  на одном id **молча не доедет** до кассы.
- CI выпускает один артефакт на id (`.github/workflows/module-release.yml`
  требует `pos/src/modules/<id>/remote-entry.ts` и скрипт `build:<id>-remote`).
  Один общий id означал бы один бандл со всеми тремя провайдерами внутри — что
  сводит на нет саму идею «у каждого провайдера свой бандл».
- `applyModuleRemotes` отвергает `descriptor.id !== id` (`registry.ts:249`), так
  что все три манифеста были бы обязаны заявлять `id: 'fiscal'`, и кнопка
  «Перевірити» в настройках рапортовала бы одно и то же для всех трёх.

Все три монтируют **одни и те же** пути `/fiscal` и `/admin/fiscal`. Коллизия
невозможна, потому что включён всегда ровно один — см. гарды в фазе 6.

### Тумблер живёт в хосте, не в бандле

`enabled` и `provider` редактируются в хостовом `pos/src/pages/admin/SettingsPage.tsx`.
Если бы единственный редактор жил внутри бандла провайдера, а бандл не
загрузился (**на вебе это происходит молча**, `registry.ts:279-287`), магазин с
`fail_mode='block'` не смог бы ни продавать, ни это выключить. Та же логика, что
у `live_tiktok_username` в `POS_LIVE_SELLING_MODULE.md`.

---

## 3. Провайдеры

| | Checkbox | Вчасно.Каса | Є-Чек |
|---|---|---|---|
| Публичный API | **Да**, OpenAPI `api.checkbox.in.ua/api/openapi.json`, wiki `wiki.checkbox.ua` | Cloud API v3 `wiki-kasa.vchasno.ua/uk/cloud/CloudAPI` + Device Manager (локальный HTTP) | Заявлены интеграции с CRM/ERP/BAS, **публичной техдокументации не найдено** |
| Локальный компонент | Checkbox Kasa (`wiki.checkbox.ua/uk/api/local_api_specification`) | Device Manager на localhost | ? |
| Песочница | Да, после регистрации на `my.checkbox.ua` | ? | 14 дней триал |
| Цена | — | — | 220 грн/мес за кассу |
| Очередь | **№1, референс** | №2 (фаза 8) | №3, после ответа их поддержки |

### Подтверждённые эндпоинты Checkbox (v1)

```
POST /api/v1/cashier/signinPinCode      заголовок X-License-Key
POST /api/v1/cashier/signin             логин/пароль
POST /api/v1/cashier/signout
GET  /api/v1/cashier/me
GET  /api/v1/cashier/shift
POST /api/v1/shifts                     открыть смену
POST /api/v1/shifts/close               закрыть смену (Z-отчёт)
POST /api/v1/receipts/sell              чек продажи; чек возврата — related_receipt_id (UUID) + is_return на позициях
POST /api/v1/receipts/service           служебное внесение/изъятие
GET  /api/v1/receipts/{id}
GET  /api/v1/receipts/{id}/{text|html|png|pdf|xml|qrcode}
```

Общие заголовки `X-Client-Name`, `X-Client-Version`; на чековых ручках ещё
`X-Access-Key` и `X-Device-ID`. **Лимит 2 чека/сек на кассу** (превышение
блокирует передачу на 5 секунд; лимит на кассу, не на IP).

### Что дала спека (скачана 2026-09-09, `2.106.4`, 131 путь, 249 схем)

OpenAPI 3.1 по адресу `https://api.checkbox.in.ua/api/openapi.json`. Находки,
меняющие проект:

| Находка | Следствие |
|---|---|
| `POST /api/v1/receipts/validate` принимает тот же `ReceiptSellPayload` и отвечает 200 | **Сухой прогон.** Первая проверка маппинга на песочнице — без выпуска реального фискального чека |
| `CreateShiftPayload.auto_close_at` | Checkbox умеет закрывать смену сам. Наш `closeDueShifts` — подстраховка, а не единственный механизм; при открытии смены передаём `auto_close_at` |
| `GET /api/v1/cashier/tax` | Источник кодов ставок. Форма настроек в фазе 6 подтягивает список, а не просит владельца ввести код руками |
| `POST /api/v1/cash-registers/ping-tax-service` | Настоящий health-check для `preflight` — дешевле, чем `GET /cashier/shift` |
| `ReceiptSellPayload.id` — «Обов'язково вкажіть унікальний UUID чеку!» | Подтверждает клиентский ключ идемпотентности, на котором держится защита от двойной фискализации |
| `POST /api/v1/receipts/sell-offline` | Точка входа для полного офлайн-режима ПРРО (фаза 8) |
| `GoodItemPayload`: `good`, `quantity` (integer), `is_return`, `discounts`, `total_sum` | Позиция чека возврата помечается `is_return`, а сам чек ссылается через `related_receipt_id` |

**Чего спека НЕ даёт.** Документирован только `422 HTTPValidationError` со
свободным текстом в `message` (плюс `403` на `signinPinCode`). Какой
статус/код означает `duplicate` против `shift_closed` против `auth_expired` —
из спеки не выводится, а это ровно та таблица, на которой стоит вся семантика
отказов (§8). Поэтому **адаптер Checkbox пишется последним**, когда появится
песочница: иначе угаданная классификация закрепится в тестах и чинить придётся
и код, и тесты.

---

## 4. Решения v1

| Вопрос | Решение | Почему |
|---|---|---|
| Провайдер №1 | **Checkbox** | Единственный с полной публичной спецификацией; отдаёт готовый текст чека под термопринтер |
| Нет связи с ПРРО | **Продажа блокируется** | Юридически чисто. Существующая офлайн-очередь остаётся как есть для магазинов **без** фискализации |
| Источник печатного чека | **Решено в фазе 8а**: `receipt_source` живая настройка | `'local'` — наш макет + фискальный блок (номер, дата, QR ДПС); `'provider'` — текст провайдера как есть, снимается один раз при фискализации под `receipt_width` магазина. Касса решает только по наличию `receipt_text` — сбой снятия текста = тихий фолбэк на `'local'` |
| Налоговый код | Store-default + override на товаре | НДС — свойство товара; размеры/цвета его делят |
| Полный офлайн-режим ПРРО | Вне области v1; дизайн — [POS_FISCAL_OFFLINE.md](POS_FISCAL_OFFLINE.md) | Требует диапазонов офлайн-номеров от ДПС; поддержка офлайна — capability адаптера (Checkbox — эталон), провайдеры без неё остаются online-only |
| Весовые товары | **Вне области**, см. оговорку 6 | `pos_sale_items.quantity INTEGER` не выражает 0.35 кг |

---

## 5. Баг, который эта фича внесла бы (найден до написания кода)

`src/pos/routes/checkout.routes.ts:34-37` возвращает **200 с найденной продажей
независимо от её статуса**:

```ts
if (clientUuid) {
  const existing = await salesService.getSaleByClientUuid(auth.storeId, clientUuid);
  if (existing) return reply.code(200).send(existing);
}
```

При стратегии «провал фискализации → `voidSale`» повтор с тем же `client_uuid`
вернёт кассиру **экран успеха для уже отменённого чека**. Хуже для офлайн-outbox:
он реплеит *сохранённый* uuid (`pos/src/offline/sync.ts:63-79`) и попадёт в ту же
ловушку.

**Чинить в фазе 4:** при `existing.status === 'voided'` отдавать
**409 `sale_voided_not_fiscalised`**.

**Чего делать нельзя:** менять `getSaleByClientUuid`, чтобы он пропускал
отменённые. `idx_pos_sales_store_client_uuid` — UNIQUE
(`migrations/010_pos_offline_sync.sql:13-15`), поэтому реплей уйдёт в вечный
`23505`, а восстановление по `23505` (`sales.service.ts:355-366`) всё равно
вернёт тот же труп.

---

## 6. Схема (миграция 024)

**Три новые таблицы:**

| Таблица | Роль |
|---|---|
| `pos_fiscal_settings` | Настройки на магазин: `enabled`, `provider`, `config jsonb`, `secrets_encrypted bytea`, `default_tax_code`, `auto_open_shift`, `fail_mode`, `receipt_source` |
| `pos_fiscal_shifts` | Смены: `provider_shift_id`, `status`, `auto_close_due_at`, `z_report`. Частичный UNIQUE-индекс не даёт двум кассам открыть две смены на одном регистраторе |
| `pos_fiscal_receipts` | Реестр/outbox фискальных документов: `doc_type`, `sale_id`/`refund_id`, `provider_request_id` (**наш** идемпотентный ключ), `provider_doc_id`, `fiscal_code`, `tax_url`, `qr_payload`, `receipt_text`, `attempts`, `next_attempt_at` |

**Плюс денормализованная проекция:** `fiscal_status` на `pos_sales` и
`pos_refunds` (`'none'|'pending'|'done'|'failed'`, DEFAULT `'none'`).

**Почему настройки отдельной таблицей, а не колонками на `pos_stores`.**
`GET /api/pos/store` (`src/pos/routes/store.routes.ts:12-16`) это `ensurePosAuth`
— **любой продавец** — и возвращает полный вывод `mapStore`, а `getStore` делает
`SELECT *` (`analytics.service.ts:232`). Новая колонка на `pos_stores` находится
в одной неаккуратной строке `mapStore` от браузера каждого кассира.

**Почему денормализация в дополнение к реестру.** `fiscal_status` надо писать
**внутри** существующей транзакции `completeSale`, передавая его в INSERT.
Падение процесса между `COMMIT` (`sales.service.ts:337`) и вызовом фискализации
не должно оставить продажу помеченной `'none'`: **молча нефискализированная
выручка — худший исход этой фичи**. Плюс сканы крона (`WHERE fiscal_status IN
('pending','failed')`) становятся дешёвыми, а список чеков в магазине без
фискализации остаётся запросом без единого JOIN.

Дисциплина, которая держит проекцию честной: её пишет **только**
`fiscal.service.ts`, всегда в той же транзакции, что переход в реестре.
Реконсайл-джоб умеет пересобрать её из реестра.

**Налоговый код:** `pos_products.fiscal_tax_code` (не на варианте), резолв
`COALESCE(p.fiscal_tax_code, s.default_tax_code)`. Оба NULL при требующем
провайдере → **терминальная ошибка конфигурации на префлайте**, никогда не
посреди чека. Рядом резервируется `pos_products.fiscal_uktzed` (nullable,
не используется) — чтобы будущий подакцизный магазин не потребовал миграции.

**Секреты:** `src/pos/core/secrets.ts`, AES-256-GCM, env `POS_SECRETS_KEY`
(32 байта base64), конверт `[1B version][12B IV][16B tag][ciphertext]`,
**AAD = `${storeId}:${provider}`** — украденная строка не переиграется в другой
магазин. Ключа нет → `PATCH` отдаёт 503 (никогда не хранить открытым текстом),
префлайт кидает `not_configured` (никогда не продавать нефискально). На проводе
секреты отдаются как `*_set: boolean` — по образцу `toSettingsView`
(`src/users/settings.controller.ts`).

### Полный DDL `migrations/024_pos_fiscal.sql`

Не забыть дописать имя файла в `src/pos/migrations.ts` — это единственное место,
где список миграций упорядочен (см. комментарий в шапке того файла).

```sql
CREATE TABLE pos_fiscal_settings (
  store_id BIGINT PRIMARY KEY REFERENCES pos_stores(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  provider VARCHAR(32),                       -- 'checkbox' | 'vchasno' | 'echeck'
  config JSONB NOT NULL DEFAULT '{}'::jsonb,  -- несекретное, provider-shaped
  secrets_encrypted BYTEA,                    -- AES-256-GCM, никогда не покидает бэкенд
  secrets_key_version SMALLINT,
  default_tax_code VARCHAR(16),
  auto_open_shift BOOLEAN NOT NULL DEFAULT TRUE,
  fail_mode VARCHAR(16) NOT NULL DEFAULT 'block' CHECK (fail_mode IN ('block')),
  receipt_source VARCHAR(16) NOT NULL DEFAULT 'local'
    CHECK (receipt_source IN ('local','provider')),   -- инертно до фазы 8
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT enabled OR provider IS NOT NULL)
);

CREATE TABLE pos_fiscal_shifts (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  cash_register_key TEXT NOT NULL DEFAULT '',
  provider_shift_id TEXT,
  status VARCHAR(16) NOT NULL CHECK (status IN ('opening','open','closing','closed','error')),
  opened_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
  auto_close_due_at TIMESTAMPTZ,              -- opened_at + 23h30m
  opened_by_staff_id BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
  z_report JSONB, z_report_text TEXT,
  error_code VARCHAR(64), error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Две кассы не откроют две смены на одном регистраторе.
CREATE UNIQUE INDEX idx_pos_fiscal_shifts_live ON pos_fiscal_shifts (store_id, cash_register_key)
  WHERE status IN ('opening','open','closing');
CREATE INDEX idx_pos_fiscal_shifts_due ON pos_fiscal_shifts (auto_close_due_at) WHERE status = 'open';

CREATE TABLE pos_fiscal_receipts (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  doc_type VARCHAR(16) NOT NULL CHECK (doc_type IN ('sale','refund','service_in','service_out')),
  sale_id   BIGINT REFERENCES pos_sales(id)   ON DELETE RESTRICT,
  refund_id BIGINT REFERENCES pos_refunds(id) ON DELETE RESTRICT,
  shift_id  BIGINT REFERENCES pos_fiscal_shifts(id) ON DELETE SET NULL,
  provider VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending','sent','done','failed','abandoned')),
  provider_request_id UUID NOT NULL,   -- НАШ id, уходит провайдеру как id документа
  provider_doc_id TEXT,                -- UUID чека у Checkbox
  fiscal_code TEXT, fiscal_date TIMESTAMPTZ,
  tax_url TEXT, qr_payload TEXT, qr_image_data_url TEXT,
  receipt_text TEXT,                   -- готовый текст провайдера
  total_cents INTEGER NOT NULL DEFAULT 0, vat_cents INTEGER,
  attempts SMALLINT NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ,
  error_code VARCHAR(64), error_message TEXT,
  request_payload JSONB, response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ( (doc_type='sale'   AND sale_id IS NOT NULL AND refund_id IS NULL)
       OR (doc_type='refund' AND refund_id IS NOT NULL)
       OR (doc_type LIKE 'service\_%' AND sale_id IS NULL AND refund_id IS NULL) )
);
CREATE UNIQUE INDEX idx_pos_fiscal_receipts_sale   ON pos_fiscal_receipts (sale_id)   WHERE doc_type='sale';
CREATE UNIQUE INDEX idx_pos_fiscal_receipts_refund ON pos_fiscal_receipts (refund_id) WHERE doc_type='refund';
CREATE UNIQUE INDEX idx_pos_fiscal_receipts_request ON pos_fiscal_receipts (store_id, provider_request_id);
CREATE INDEX idx_pos_fiscal_receipts_retry ON pos_fiscal_receipts (next_attempt_at)
  WHERE status IN ('pending','sent','failed');

ALTER TABLE pos_sales   ADD COLUMN fiscal_status VARCHAR(16) NOT NULL DEFAULT 'none'
  CHECK (fiscal_status IN ('none','pending','done','failed'));
ALTER TABLE pos_refunds ADD COLUMN fiscal_status VARCHAR(16) NOT NULL DEFAULT 'none'
  CHECK (fiscal_status IN ('none','pending','done','failed'));
CREATE INDEX idx_pos_sales_fiscal_open ON pos_sales (store_id, created_at DESC)
  WHERE fiscal_status IN ('pending','failed');

ALTER TABLE pos_products ADD COLUMN fiscal_tax_code VARCHAR(16);
ALTER TABLE pos_products ADD COLUMN fiscal_uktzed VARCHAR(32);  -- зарезервировано, не используется
```

`ON DELETE RESTRICT` на `sale_id`/`refund_id` — намеренно, по домашнему правилу
из `src/__tests__/helpers/pos-fixtures.ts` («проданный вариант или кассир с
чеками не должны удаляться в проде»). Стоит это двух строк в `dropTestStore`.

**Две правки в тестовом хелпере, без которых 021 сломает прогон:**
`applyPosMigrations` (`pos-fixtures.ts:35-38`) щупает артефакт **последней**
миграции (сейчас `pos_gtin_provider_budget.scope` из 020) — пробу надо
перенацелить на `pos_fiscal_settings`, иначе схема останется применённой
наполовину. И в упорядоченный список `dropTestStore` добавить
`pos_fiscal_receipts` и `pos_fiscal_shifts` **перед** `pos_sales` — FK стоят
`RESTRICT`.

---

## 7. Интерфейс адаптера

`src/pos/fiscal/types.ts`. Спроектирован против всех трёх провайдеров, не под
Checkbox.

```ts
export interface FiscalProvider {
  readonly id: FiscalProviderId;              // 'checkbox' | 'vchasno' | 'echeck'
  readonly title: string;
  /** Декларативно — одна универсальная форма кредов на всех провайдеров. */
  readonly secretKeys: readonly {
    key: string; label: string; required: boolean; kind: 'text' | 'password' | 'file';
  }[];

  probe(creds: FiscalCredentials): Promise<FiscalProbe>;   // «Перевірити зʼєднання», не мутирует
  signIn(creds: FiscalCredentials): Promise<FiscalSession>;
  signOut(ctx: FiscalCallCtx): Promise<void>;

  getShift(ctx: FiscalCallCtx): Promise<FiscalShiftState | null>;   // состояние ПРОВАЙДЕРА
  openShift(ctx: FiscalCallCtx): Promise<FiscalShiftState>;
  closeShift(ctx: FiscalCallCtx): Promise<FiscalShiftClosed>;       // несёт Z-отчёт
  xReport(ctx: FiscalCallCtx): Promise<FiscalReport>;

  registerSale(ctx: FiscalCallCtx, doc: FiscalSaleDoc): Promise<FiscalResult>;
  registerRefund(ctx: FiscalCallCtx, doc: FiscalRefundDoc): Promise<FiscalResult>;
  registerService(ctx: FiscalCallCtx, doc: FiscalServiceDoc): Promise<FiscalResult>;

  /** Перечитать документ, который мы, возможно, всё-таки создали. */
  fetchDocument(ctx: FiscalCallCtx, providerDocId: string): Promise<FiscalResult | null>;

  /** ОПЦИОНАЛЬНО — /png /pdf /qrcode есть только у Checkbox. */
  renderReceipt?(ctx: FiscalCallCtx, providerDocId: string,
    format: 'text' | 'html' | 'png' | 'pdf' | 'xml' | 'qrcode'): Promise<FiscalRendering | null>;
}
```

Что делает его провайдеро-нейтральным:

- `secretKeys` **декларативны** → одна форма обслуживает `{licenceKey, cashierPin}`
  Checkbox, `{apiKey, deviceId}` Вчасно и `{cert, certPassword}` Є-Чек без единой
  строки provider-специфичного UI.
- `FiscalSession { token, expiresAt, meta? }` непрозрачна — base URL локального
  Device Manager Вчасно живёт в `meta`, JWT кассира Checkbox в `token`.
- `getShift()` возвращает состояние **провайдера**, а оркестратор сверяет нашу
  таблицу с ним, не наоборот. У Вчасно смену может открыть Device Manager помимо
  нас; дизайн, доверяющий `pos_fiscal_shifts`, рассинхронизировался бы навсегда.
- `quantityMilli` (1 шт = 1000) — общая конвенция ПРРО, а не ×1000 Checkbox,
  зашитый в контракт.
- `receiptText: string | null` в результате — Є-Чек может не дать; это ровно тот
  шов, который позволяет **отложить решение о печати**.
- `renderReceipt?` опционален — так выражается «/png /pdf есть не у всех».

### Таксономия ошибок

`src/pos/fiscal/errors.ts` — один класс `FiscalError`, дискриминант `kind`:

| kind | Класс | Поведение |
|---|---|---|
| `not_configured` | терминальная | Настройка неполна, нужен владелец |
| `auth_rejected` | терминальная | Неверный license/PIN, нужен владелец |
| `rejected` | терминальная **для этого документа** | Провайдер провалидировал и отказал |
| `auth_expired` | восстановимая | Re-signin + одна повторная попытка |
| `shift_closed` | восстановимая | Открыть смену + одна повторная попытка |
| `shift_expired` | восстановимая | Закрыть + открыть + одна повторная попытка |
| `rate_limited` | ретраибельная | Уважает `retryAfterMs` |
| `unavailable` | ретраибельная | Сеть / 5xx |
| `unknown` | ретраибельная | Считается в счётчик отказа |
| **`duplicate`** | **успех** | Провайдер уже знает наш `requestId` → `fetchDocument` |

**`duplicate` — краеугольный камень корректности.** Checkbox принимает
client-supplied UUID документа; второй POST с тем же id конфликтует. Адаптер
мапит это в `duplicate` + `existingProviderDocId`, оркестратор дочитывает
документ и считает успехом. **Без этого сетевой таймаут после того, как
провайдер уже провёл чек, фискализирует продажу дважды** — в ПРРО два чека,
налог с обоих.

---

## 8. Оркестрация и семантика отказов

Оркестрация живёт **в роуте** (`src/pos/routes/checkout.routes.ts`), не в
`sales.service.ts`: последняя сегодня — чистая DB-функция без единого сетевого
вызова, её напрямую дёргают четыре тестовых файла; роут — единственная точка,
через которую реплеит офлайн-синк.

```
POST /sales/complete
1. ensurePosAuth                                       (без изменений)
2. client_uuid pre-check — ФИКС: status==='voided' → 409 sale_voided_not_fiscalised
3. gate = await fiscalService.preflight(storeId)
     'off' | 'ready' | throws → 503 { error:'fiscal_unavailable', code, message }
     *** ДО completeSale: ничего не записано, номер не сожжён, склад не двинут ***
4. sale = completeSale({ ..., fiscal_status: gate.on ? 'pending' : 'none' })   // В INSERT
5. if (!gate.on) return 201 sale
6. try   { return 201 { ...sale, fiscal: await fiscalService.fiscalizeSale(sale, gate) } }
   catch { const voided = await fiscalService.abortSale(sale, e);   // voidSale + реестр 'abandoned'
           return 502 { error:'fiscal_failed', code: e.kind, message, sale_voided: voided } }
```

`voidSale` (`sales.service.ts:510-574`) **уже документирован в коде** как
зарезервированный ровно под случай «ещё не фискализировано» и сегодня не
вызывается ни одним UI. Переиспользуем его, а не пишем новое.

**Никаких ретраев внутри запроса.** Одна попытка. Восстановимые виды получают
одно восстановление + один ретрай; `rate_limited` — один ретрай не дольше 600 мс.
Кассир стоит перед покупателем: экспоненциальный бэкофф на кассе строго хуже,
чем «спробуйте ще раз».

**Бюджет времени.** Один общий `AbortSignal.timeout(9000)` на всю фискальную
фазу, прокинутый через `FiscalCallCtx.signal` (необязательным его не делаем,
чтобы нельзя было забыть). У axios-клиента `timeout: 15000`
(`pos/src/services/api.ts:64`); если фискальная фаза способна выйти за ~12 с,
клиент отвалится, пока сервер ещё работает, и продажа зафискализируется уже
после того, как касса показала ошибку.

**Префлайт — не сетевой вызов на каждую продажу.** In-process кэш на магазин
`src/pos/fiscal/runtime.ts` (`{ session, shiftState, lastOkAt }`, TTL 60 с,
инвалидация на любой `auth_expired`/`shift_*`). Та же позиция, что у
`sessionManager` и лимитера в `qr.service.ts`. Иначе — лишний round-trip в
горячем пути и половина бюджета 2/сек.

### Матрица отказов

| Ситуация | Продажа | Ответ кассе |
|---|---|---|
| Фискализация выключена | `completed`, `fiscal_status='none'` | 201, как сегодня |
| Провайдер недоступен на префлайте | **не создана** | 503 `fiscal_unavailable` |
| Провал, документ **точно не дошёл** (`rejected`, `shift_closed`, `auth_expired`, не передавали) | `voided`, реестр `abandoned` | 502 `fiscal_failed`, `sale_voided: true` |
| Провал, документ **мог дойти** (`unavailable`, `unknown`, таймаут) | `completed` / `fiscal_status='failed'` — **не отменяется** | 502 `fiscal_failed`, `sale_voided: false`, `sale_kept: true` |
| Провал, и сам `voidSale` упал | `completed` / `fiscal_status='failed'` | 502 `fiscal_failed`, `sale_voided: false`, строка в списке внимания |
| `duplicate` | `done`, **ровно одна** строка реестра | 201 с фискальными данными |
| `duplicate`, но `fetchDocument` не отдал документ | `completed` / `failed`, `duplicate_unresolved`, **никогда не отменяется** | 502 |
| `shift_closed` | смена авто-открылась, один ретрай, `done` | 201 |
| Реплей `client_uuid` отменённой | — | **409** `sale_voided_not_fiscalised` |
| Отмена (`/sales/:id/void`) фискализированного чека | остаётся `completed` | **409** `sale_fiscalised` |
| Провал фискализации **возврата** | возврат цел, `fiscal_status='failed'` | **200** + `fiscal:{status:'failed'}` |

Офлайн-режим (`offline_mode`, [POS_FISCAL_OFFLINE.md](POS_FISCAL_OFFLINE.md), фаза 2 — случай B, провайдер недоступен с бэкенда). Ответы 503 сохраняют форму `{ error: 'fiscal_unavailable', code: <kind> }`, чтобы касса не училась новой:

| Ситуация | Продажа | Ответ кассе |
|---|---|---|
| Провайдер недоступен на префлайте, `offline_mode`, смена открыта онлайн | `completed`, реестр `pending` / `mode='offline'` со штампом (код из пула = фискальный номер, `fiscal_date`, `offline_seq`) | **201**, `fiscal: { status: 'pending', mode: 'offline', fiscal_code, control_number: null, qr_payload: null }` |
| Провайдер недоступен, `offline_mode`, живой смены нет | **не создана** | 503 `code: 'unavailable'` (v1: смена открывается только онлайн) |
| Сессия `open`, провайдер уже доступен | как выше — штамп до реплея (онлайн-чек внутри сессии ломает порядок `go_offline_date`) | 201, `mode: 'offline'` |
| Сессия `replaying` | **не создана** | 503 `code: 'replaying'` — секунды-минуты |
| Сессия старше 36 ч − 30 мин | **не создана**, сессия `stuck` (`offline_limit`) | 503 `code: 'offline_limit'` |
| Смена старше 24 ч − 15 мин при живой сессии | **не создана** | 503 `code: 'shift_deadline'` |
| Возврат или служебный чек при живой сессии | **не создан** | 503 `code: 'offline_session_open'` (чекаут) / 409 `error: 'offline_session_open'` (фискальные роуты, включая ручное закрытие смены) |
| Штамп не удался (пул пуст — `offline_codes_exhausted`, реплей начался) | `voided`, реестр `abandoned` — ничего не передавалось | 502 `fiscal_failed`, `sale_voided: true` |
| Реплей: `go-offline` отклонён или онлайн-документ доставлен позже старта сессии | документы остаются `pending` | сессия `stuck` (`go_offline_rejected` / `go_offline_order`), список внимания; ничего не отправлено |
| Реплей: офлайн-документ `rejected` | `completed`, реестр `abandoned` — **не отменяется** | список внимания; цепочка продолжается |
| Реплей: `unavailable`/таймаут посреди сессии | `done` до точки обрыва, остальное `pending` | сессия `replaying`, следующий тик продолжает без второго `go-offline` |
| Онлайн-документ магазина в `failed` при живой сессии | не трогается | плоский ретрай ждёт закрытия сессии, попытки не сгорают |

### Отменять продажу можно только при доказанном отсутствии документа

Исходно в этом плане было проще: «провал фискализации после коммита →
`voidSale`». **Так делать нельзя, и это исправлено в фазе 4.**

Самый вероятный отказ после коммита — таймаут на самом вызове регистрации, а
таймаут ничего не говорит о том, провёл провайдер чек или нет. Отменив продажу,
мы возвращаем товар на склад, пока ПРРО, возможно, держит по ней валидный чек.
Кассир перебивает продажу — с **новым** `client_uuid`, значит с новым
`provider_request_id` — и механизм `duplicate`, существующий ровно чтобы этого не
допустить, обходится стороной. Два фискальных чека, налог с обоих, один из них на
отменённую продажу.

Решает один предикат — `mayExistAtProvider(kind, transmitted)` в
`fiscal.service.ts`. Неоднозначные случаи остаются закоммиченными с
`fiscal_status='failed'` и разбираются ретраем **с тем же `requestId`**, который
и может вернуться как `duplicate` → `fetchDocument`.

**`rejected` ⇒ документ не создан — это требование к адаптерам, а не вывод.**
Записано комментарием на `FiscalErrorKind` в `errors.ts`. Адаптер, возвращающий
`rejected` там, где провайдер мог всё-таки записать документ, приведёт к отмене
фискализированных продаж. В сомнении — `unknown`.

**Асимметрия возврата.** `unRefundSale` не существует — деньги и склад уже
двинулись. Поэтому провал фискализации возврата отдаётся как **200**, а не
ошибкой: возврат действительно произошёл, а экран ошибки заставит кассира
повторить и вернуть деньги дважды. UI показывает янтарную полосу «повернення не
фіскалізовано — повторимо автоматично».

**Продажа в `failed`, до которой catch не добрался** (падение процесса между
COMMIT и вызовом) кроном **не** авто-отменяется — возвращать склад за спиной
кассира спустя часы нельзя. После 8 попыток → `abandoned` в список внимания
владельца, который отменяет или возвращает её осознанно.

**Окно ретраев ограничено сменой.** Чек ПРРО принадлежит смене, Z-отчёт
суммирует её чеки, поэтому документ, проведённый после Z-отчёта, ломает оба
отчёта. `closeShift` вызывает `abandonShiftDocs` на обоих выходах. Плюс три
подстраховки, потому что закрытие смены может и не случиться:

- возрастная сетка (`abandonStaleDocs`) — `closeDueShifts` умеет припарковать
  смену в `'error'`, не вызвав `closeShift`, и её документы иначе стали бы
  невидимы навсегда;
- `abandonVoidedSaleDocs` — `abortSale` отменяет продажу первой, а помечает
  строку второй (обратный порядок оставил бы живую продажу с брошенным
  документом); падение между ними оставило бы отменённую продажу с вполне
  пригодной к отправке строкой;
- усыновление сирот — `completeSale` коммитит `fiscal_status='pending'`, а
  вставка строки реестра идёт отдельной транзакцией. Падение в этом окне
  оставляет продажу, которая *говорит*, что фискализируется, и которую при этом
  никто и никогда не фискализирует. Усыновляем только внутри живой смены,
  которой продажа принадлежит; иначе сразу паркуем к владельцу.

### Смены и кроны

- Авто-открытие в `preflight`, когда `auto_open_shift` и провайдер сообщает, что
  открытой смены нет. Гард от гонки — частичный UNIQUE-индекс
  `idx_pos_fiscal_shifts_live`: проигравший ловит `23505`, перечитывает, идёт
  дальше.
- `auto_close_due_at = opened_at + 23h30m` (ПРРО требует ≤24 ч).
- `src/index.ts`, рядом с QR-реконсайлом: `*/5 * * * *` → `closeDueShifts`,
  `*/2 * * * *` → `retryPendingFiscalDocs`, `*/10 * * * *` → `refillAllStores`
  (пул офлайн-кодов, фаза 8б).
- `closeDueShifts` обязан использовать **`FOR UPDATE SKIP LOCKED`** — на Railway
  может быть больше одной реплики, а `closeShift`, в отличие от
  `reconcileQrPayments`, **не идемпотентен**.
- Бэкофф: `next_attempt_at = NOW() + LEAST(2^attempts, 900) сек` ±20 % джиттера;
  `attempts >= 8` → `abandoned`.
- Лимит 2/сек — in-process token bucket на `(storeId, registerKey)`, **с
  резервом, который крон ретраев не трогает**: бэклог не должен голодить живой
  чек.

---

## 9. Фронтенд

| Где | Что |
|---|---|
| Хост `SettingsPage.tsx`, секция «Фіскалізація (ПРРО)» | `enabled`, выбор провайдера, `default_tax_code`, статус. Owner-only |
| Бандл провайдера `/admin/fiscal` | Креды (форма генерится из `secretKeys`), тест связи, provider-специфичный конфиг, диагностика |
| Бандл провайдера `/fiscal` (касса) | Открыть/закрыть смену, Z-отчёт, X-отчёт, внесение/изъятие, итоги текущей смены |
| Хост везде остальное | Фискальный номер / QR / бейдж статуса на экране успеха, в списке чеков, в детали чека, на печатном чеке |

`mount: 'admin'` даёт owner-only **по построению** через `<Guard ownerOnly>` в
`renderRoutes.tsx:36-46` — флаг `ownerOnly` на манифесте ставить **нельзя**, он
убьёт кассовый экран для продавцов.

**Раскладка бандла:**

```
pos/src/modules/fiscal-core/      # общий, НЕ модуль: без manifest.ts, без remote-entry.ts, не в MODULES
  types.ts  lib/hostPlatform.ts  lib/diagnostics.ts  data/fiscalApi.ts
  components/{SecretsForm,ShiftPanel,FiscalErrorCard}.tsx  hooks/useFiscalShift.ts
pos/src/modules/fiscal-checkbox/  # тонкий
  manifest.ts  remote-entry.ts  pages/{CheckboxAdminPage,CheckboxTillPage}.tsx
```

`fiscal-core` импортируется относительно — `check-platform-boundary.mjs` это
разрешает (он банит только перечисленные синглтоны). Синглтонов в нём нет.
У него **не должно быть** `remote-entry.ts`, иначе CI сочтёт его выпускаемым
модулем.

**В `@pos/platform` добавляется ровно один рантайм-символ — `posRequest`**
(дженерик-обёртка над тем же axios-клиентом, наследующая baseURL, Bearer,
`X-POS-API-Version` и телеметрию скью). Альтернатива в стиле `tiktok-live` (по
типизированному методу на эндпоинт) — это 3 провайдера × ~10 эндпоинтов, а
комментарий в `hostPlatform.ts` прямо говорит, что каждый новый символ это ещё
одна версия шелла, на которой модуль больше не запустится. Прецедент отдачи
модулю примитива уже есть — `apiOrigin` (`pos/src/platform/urls.ts:8-13`). Всё
остальное модулю нужно **только типами** — они стираются и версию шелла не стоят.

**QR:** энкодера QR в `pos/package.json` **нет** — `html5-qrcode` это ридер.
Берём рендер провайдера (`renderReceipt(...,'qrcode')`), кэшируем в
`pos_fiscal_receipts.qr_image_data_url`, отдаём data URL (под Tauri CSP работает,
см. `qr.service.ts:36`). Новой зависимости не заводим.

---

## 10. Чек-лист выпуска модуля

1. Бампнуть `pos/package.json` (версия модуля = версия приложения — иначе кассы
   не обновятся).
2. **Сначала выпустить шелл**, потом модуль — `posRequest` должен уже быть в
   хосте, иначе каждая десктопная касса, синкнувшая `fiscal-checkbox`, сразу
   получит `HostTooOldError`.
3. `npm run build:fiscal-checkbox-remote` → в `dist-remotes/fiscal-checkbox/`
   должны быть `remote-entry.js`, `style.css`, `manifest.json`, `manifest.json.sig`
   и **ни одного лишнего `.js`** (лишний = Rollup вынес общий чанк, который
   подпись не покрывает).
4. `npm run check:fiscal-checkbox-css-coverage` (прогоняется по **обоим**
   каталогам — `fiscal-core` и `fiscal-checkbox`).
5. Тег `module-fiscal-checkbox-v<версия>` → `.github/workflows/module-release.yml`.
6. Прописать URL в `pos_stores.module_remotes['fiscal-checkbox']` (объектная
   форма) через Адмінка → Налаштування → Онлайн-модулі.

---

## 11. Оговорки

1. **Кэш модулей на десктопе.** Правка `fiscal-checkbox` без бампа
   `pos/package.json` **не доедет ни до одной кассы** — молча, без записи в
   логах (`module_remotes.rs:256-270`). Здесь это кусается сильнее, чем у
   `tiktok-live`: сломанный фискальный модуль = магазин не может открыть смену.
   Откат указанием на старый тег **не работает** по той же причине — только
   вперёд.
2. **`sanitizeModuleRemotes` молча выбрасывает неизвестные поля**
   (`src/pos/core/modules.ts:158-171` собирает свежий объект только из известных
   ключей). Любую фискальную конфигурацию, «протащенную» в запись
   `module_remotes`, следующий `PATCH /store` удалит **без ошибки**. Вся
   конфигурация — только в `pos_fiscal_settings`.
3. **`X-POS-API-Version` не бампать.** Фискальные роуты чисто аддитивны; бамп
   заставит каждый развёрнутый POS логировать скью, а при
   `POS_API_STRICT_VERSION=1` — 409-ить весь POS. `posRequest` как раз и означает,
   что фискальные эндпоинты могут развиваться, не трогая это число.
4. **Коллизия роутов двух фискальных бандлов разрешается молча** порядком
   массива в `renderRoutes.tsx` — ошибки нигде не будет. Настоящий гард —
   бэкендовый `assertSingleFiscalRemote` в `PATCH /store` (400). Клиентский
   «оставить первый `fiscal-*`» — подстраховка на случай правки строки в БД мимо
   роута.
5. **Ключи подписи синхронизируются в трёх местах:**
   `pos/src/modules/remoteSigningKeys.ts`, `pos/src-tauri/src/module_remotes.rs:48-59`,
   `.github/workflows/module-release.yml:60`. Комментарий в Rust-файле фиксирует,
   что этот разрыв уже однажды поехал в прод и сломал десктопный синк с
   бесполезным «нет связи». На вебе такой сбой **невидим**.
6. **Весовые товары вне области.** `pos_sale_items.quantity INTEGER`
   (`migrations/002:175`) не выражает 0.35 кг. Адаптер умножает на 1000 и схему
   не трогает, но реальные весовые товары потребуют миграции `quantity_milli` по
   продажам, возвратам, складу и офлайн-зеркалу.
7. **Номера чеков «прыгают».** `nextReceiptNumber` инкрементит
   `pos_store_counters` (`sales.service.ts:141-151`), и отменённая после провала
   фискализации продажа удерживает `R-00042` — покупатель получит `R-00043`. Под
   ПРРО внутренняя нумерация не обязана быть без разрывов (фискальный номер —
   обязан), но это будущий звонок в поддержку.
8. **Мульти-реплика.** Кэш сессий, лимитер и кроны предполагают один процесс.
   Лимитер деградирует мягко (2/сек на реплику); `closeDueShifts` — **нет**,
   отсюда `FOR UPDATE SKIP LOCKED`. Если лимитер когда-нибудь укусит — в стеке
   уже есть Redis.
9. **Офлайн-очередь.** `repository.ts:308-365` ставит продажу в outbox
   автоматически, отказаться сегодня нечем. Отказ должен управляться флагом
   `fiscal.enabled` **внутри кэшированного `pos_auth`** — в холодном офлайне
   другого источника нет. Именно поэтому фаза 1 кладёт `fiscal` в
   `AuthResponse.store`, а не только в `GET /fiscal/settings`. Второй порядок:
   магазин, включивший фискализацию, когда продажи уже стоят в очереди — они
   реплеят через обычный путь, и если фискализация падает, они отменяются,
   а строка outbox обязана показать 409, а не ретраить вечно.

---

## Прогресс по фазам

Обновлять после каждой завершённой фазы.

| Фаза | Что | Статус |
|---|---|---|
| **0** | Этот документ + песочница Checkbox + фикстуры | 🟡 документ готов; аккаунт и фикстуры — за владельцем |
| **1** | Миграция 024, `secrets.ts`, `pos_fiscal_settings` + роуты настроек (бэкенд) | ✅ |
| **2а** | `FiscalProvider` + таксономия ошибок + `mapping.ts` + rate limit + фейковый провайдер | ✅ |
| **2б** | Адаптер Checkbox | ✅ |
| **3** | Смены, `runtime.ts`, кроны | ✅ |
| **4** | Оркестрация чекаута + реестр + фикс 409 | ✅ |
| **5** | Хост-фронт: фискальные поля везде + офлайн-блок | ✅ |
| **6** | Бандлы `fiscal-core` + `fiscal-checkbox`, `posRequest`, гарды | ✅ |
| **7** | Обкатка: список внимания, seed, CI-выпуск, ранбук | 🟡 CI-выпуск (`module-release.yml`) и ранбук ([POS_FISCAL_CHECKBOX_SETUP.md](POS_FISCAL_CHECKBOX_SETUP.md)) есть; массовое обновление URL модуля — супер-админка `/super` ([POS_SUPER_ADMIN.md](POS_SUPER_ADMIN.md)); список внимания есть (`GET /fiscal/attention` + `CheckboxAdminPage`, в фазе 2 к нему добавились `stuck`-сессии); seed — ⬜ |
| **8а** | Печать: `receipt_source='provider'` + фискальный блок в локальном макете | ✅ |
| **8б** | Отложенное: Вчасно, офлайн-режим ПРРО, Є-Чек | 🟡 офлайн-режим — **дизайн одобрен 2026-09-10**, [POS_FISCAL_OFFLINE.md](POS_FISCAL_OFFLINE.md); **фаза 1 сделана 2026-09-11** (capability `FiscalProvider.offline`, миграция 027, пул кодов + крон `*/10`, держатель регистратора + `register/*` роуты, `X-POS-Device-ID`) — **фаза 2 сделана 2026-09-11** (серверная офлайн-сессия, случай B: миграция 028, `offline/session.ts`, реплей в `retryPendingFiscalDocs`) — **фаза 4 (UI) сделана 2026-09-11** (тумблер офлайна в хостовой карточке, панели запаса/сессии и держателя на `/fiscal`, `stuck`-сессии и принудительная передача на `/admin/fiscal`) — см. таблицу ниже; фазы 3 и 5 ⬜; Вчасно, Є-Чек — ⬜ |

### Что уже лежит в репозитории (фаза 1)

| Файл | Роль |
|---|---|
| `migrations/024_pos_fiscal.sql` | Схема. Идемпотентна, накатывается на БД, стоящую на 020 |
| `src/pos/core/secrets.ts` | AES-256-GCM, `POS_SECRETS_KEY`, AAD = `storeId:provider` |
| `src/pos/fiscal/types.ts` | `FiscalProviderId`, настройки, `FiscalCredentials`. Интерфейс адаптера сюда же в фазе 2 |
| `src/pos/fiscal/settings.service.ts` | `getFiscalSettings`, `getFiscalCredentials`, `toFiscalSettingsView`, `updateFiscalSettings` |
| `src/pos/routes/fiscal.routes.ts` | `GET`/`PATCH /api/pos/fiscal/settings`, owner-only, core-группа |
| `src/__tests__/pos.secrets.test.ts` | 12 тестов шифрования, без БД |
| `src/__tests__/pos.fiscal.settings.test.ts` | 20 тестов роутов, на БД |

### Что уже лежит в репозитории (фаза 2а)

| Файл | Роль |
|---|---|
| `src/pos/fiscal/types.ts` | + `FiscalProvider`, документы, `FiscalResult`, смены, `FiscalCallCtx` |
| `src/pos/fiscal/errors.ts` | `FiscalError` + 10 видов + предикаты + `supportCode` + сообщения кассиру |
| `src/pos/fiscal/mapping.ts` | Продажа/возврат → фискальный документ. **Чистый**: ни БД, ни сети |
| `src/pos/fiscal/rateLimit.ts` | Token bucket 2/сек на кассу, резерв под живой чек |
| `src/pos/fiscal/providers/index.ts` | `getProvider` / `registerProvider` / `resetProviders` |
| `src/__tests__/helpers/fake-fiscal-provider.ts` | Программируемый фейк: реальная идемпотентность и состояние смены |
| `src/__tests__/pos.fiscal.core.test.ts` | 24 теста: таксономия, реестр, лимитер, фейк |
| `src/__tests__/pos.fiscal.mapping.test.ts` | 19 тестов маппинга, включая округление скидки корзины |

Два инварианта, зафиксированные тестами и важные для фаз 3–4:

1. **Каждый вид ошибки попадает ровно в один класс.** Оркестратор ветвится на
   `isTerminal` / `isRecoverable` / `isRetryable` / `isDuplicate` и больше ни на
   чём, поэтому вид, не попавший ни в один (или в два), молча провалился бы
   мимо логики. Тест перебирает все 10.
2. **`src/pos/fiscal/` не импортирует `sales.service.ts`.** Проверено: единственные
   импорты — `db.js`, `core/secrets.js` и файлы внутри самого каталога.
   Суммы возврата **передаются в маппинг**, а не пересчитываются: `refundSale`
   уже посчитал их через `refundLineAmount`, и вторая реализация того же
   кумулятивного округления была бы денежным багом. Тест маппинга при этом
   импортирует `allocateCartDiscount`/`refundLineAmount` из `sales.service.ts`
   намеренно — он доказывает согласие с настоящей арифметикой, не создавая
   связанности в продакшн-коде.

Затронуто: `src/pos/migrations.ts` (список), `src/pos/core/auth.ts` +
`src/pos/auth.service.ts` + `src/pos/types.ts` (`store.fiscal` в ответе логина —
это то, чем офлайн-касса будет блокировать продажу),
`src/__tests__/helpers/pos-fixtures.ts` (зонд последней миграции +
`dropTestStore`), `src/pos/pos.routes.ts`, `.env.example`, `CLAUDE.md`.

**Локальный прогон DB-тестов.** Порт 5433 из `docker-compose.yml` может быть
занят Postgres другого проекта. Тогда — отдельный контейнер:

```bash
docker run -d --name tiktok-live-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tiktok_live -p 5434:5432 postgres:16-alpine
```

```bash
DB_HOST=localhost DB_PORT=5434 DB_NAME=tiktok_live DB_USER=postgres DB_PASSWORD=postgres npm test
```

### Что уже лежит в репозитории (фаза 3)

| Файл | Роль |
|---|---|
| `src/pos/fiscal/runtime.ts` | Кэш сессии и смены на магазин, TTL 60 с, точечная инвалидация |
| `src/pos/fiscal/shifts.service.ts` | `resolveContext`, `ensureOpenShift`, `openShift`, `closeShift`, `xReport`, `closeDueShifts`, `getStatus` |
| `src/pos/routes/fiscal.routes.ts` | + `GET /fiscal/status`, `POST /fiscal/shift/open`, `/shift/close`, `/x-report` — **любой сотрудник** |
| `src/index.ts` | Крон `*/5 * * * *` → `closeDueShifts` |
| `src/__tests__/pos.fiscal.shifts.test.ts` | 25 тестов на БД + фейковый провайдер |

Решения, которые легко переизобрести неправильно:

1. **Провайдер владеет сменой, `pos_fiscal_shifts` — зеркало.** Каждое чтение
   приводит нашу строку к тому, что сообщил провайдер, никогда наоборот. У
   Вчасно смену может открыть Device Manager помимо нас, а у ДПС смена может
   истечь, пока наша строка говорит «open». Дизайн, доверяющий своей таблице,
   рассинхронизировался бы навсегда.
2. **Ровно одна живая строка на кассу** держится частичным UNIQUE-индексом плюс
   `ON CONFLICT … WHERE status IN ('opening','open','closing')`: второй
   писатель обновляет строку первого, а не падает.
3. **Смену открываем с `auto_close_at`** (23 ч 30 хв). Checkbox закроет её сам;
   наш крон — подстраховка для провайдеров, которые не умеют. Переполнение 24 ч
   это нарушение, а не косметика, отсюда два механизма.
4. **Крон работает по схеме claim-then-work**, а не «внутри транзакции»: строка
   переводится в `'closing'` под `FOR UPDATE SKIP LOCKED` и коммитится, и только
   потом идёт сетевой вызов. Держать блокировку строки всю латентность
   провайдера нельзя. `SKIP LOCKED` обязателен: реплик может быть больше одной,
   а `closeShift`, в отличие от `reconcileQrPayments`, **не идемпотентен**.
5. **Транзиентный сбой возвращает смену в `open`** (следующий тик повторит), а
   `not_configured` / `auth_rejected` паркуют её в `'error'` — повторять их
   каждые пять минут бессмысленно, нужен владелец.
6. **Смена открывается любым сотрудником, не только владельцем.** Открыть смену
   — первое, что делает кассир утром; магазин, где это может только владелец, не
   торгует, пока владелец не залогинится.
7. **`GET /fiscal/status` не бросает исключений**: недоступный провайдер — это
   *состояние для показа*, а не сбойный запрос. Единственный, кому нельзя
   продолжать при плохом состоянии, — префлайт чекаута, и он зовёт
   `ensureOpenShift` напрямую.

### Что уже лежит в репозитории (фаза 4)

| Файл | Роль |
|---|---|
| `src/pos/fiscal/ledger.ts` | Автомат `pos_fiscal_receipts` + **все** записи проекции. Отдельный файл, чтобы `shifts.service → fiscal.service` не стало циклом |
| `src/pos/fiscal/fiscal.service.ts` | `preflight`, `runDocument`, `fiscalizeSale/Refund/Service`, `abortSale`, `retryPendingFiscalDocs`, усыновление сирот |
| `src/pos/routes/checkout.routes.ts` | Поток продажи/возврата, фикс 409, гейт на отмену фискализированного чека |
| `src/pos/sales.service.ts` | Три аддитивные правки: `fiscal_status` в оба INSERT, `fiscal` в `getSale`, `fiscal_status` в `listSales` |
| `src/pos/fiscal/shifts.service.ts` | `sweepShiftDocuments` на обоих выходах `closeShift` |
| `src/pos/fiscal/rateLimit.ts` | `maxWaitMs` + `RATE_LIMIT_DECLINED` — см. ниже |
| `src/pos/routes/fiscal.routes.ts` | `POST /fiscal/service`, `GET /fiscal/attention`, `adapter_available` |
| `src/index.ts` | Крон `*/2 * * * *` → `retryPendingFiscalDocs` |
| `src/__tests__/pos.fiscal.checkout.test.ts` | 22 теста роутов |
| `src/__tests__/pos.fiscal.ledger.test.ts` | 12 тестов автомата и крона |

Существующие `pos.routes.checkout.test.ts`, `pos.sales.refunds.test.ts`,
`pos.sales.numbering.test.ts` остались **без единой правки** — параметр
`fiscal_status` опциональный со значением `'none'`.

**`'sent'` не пишется никогда.** Значение осталось в CHECK (убирать его
миграцией не за что), но ни один путь его не производит: никто на нём не
ветвится; окно падения он переносит, а не закрывает; а `attempts` инкрементится
**до** вызова, поэтому `status='pending' AND attempts>0` — уже готовый маркер
этого окна. Как метка владения он был бы багом: у статуса нет срока, а
`next_attempt_at`-аренда самовосстанавливается. Закреплено тестом.

**Найден и исправлен баг фазы 2а в лимитере.** `reserveSlot` уменьшал счётчик
токенов даже возвращая ожидание, без нижней границы. Фоновый прогон 20
документов уводил счётчик в −18, и следующий **живой** чек получал ожидание
`(1+18)/2·1000 = 9500 мс` — больше всего бюджета в 9 с, то есть 503 перед
покупателем от механизма, написанного ровно чтобы этого не допустить. Теперь
фоновый вызов **отказывается** (`maxWaitMs`, токен не тратится) вместо того
чтобы вставать в очередь перед кассиром. Прежний тест ловил только один фоновый
вызов; новый прогоняет двадцать.

### Что уже лежит в репозитории (фаза 5)

| Файл | Роль |
|---|---|
| `pos/src/lib/checkoutError.ts` | Классификатор ответа чекаута → один из трёх исходов. Чистый |
| `pos/src/offline/outboxPolicy.ts` | Бэкофф от последней попытки, терминальность, лимит попыток. Чистый |
| `pos/src/offline/errors.ts` | + `OfflineFiscalError`, `FiscalSaleUnknownError` |
| `pos/src/offline/{db,sync,repository,status,cashierApi,auth-local}.ts` | Терминальный статус outbox, `discardQueuedSale`, блокировка офлайн-продажи, кэш `store.fiscal`, `updateStaffUnlockStoreFlags` |
| `pos/src/pages/register/RegisterPage.tsx` + `components/CheckoutModal.tsx` | Три исхода, слот ошибки поверх модалки, гейты автопечати и отмены |
| `pos/src/modules/returns/**` | `FiscalBadge` / `FiscalDetailCard`, предупреждение до возврата, результат фискализации возврата, кнопка «Видалити з черги» |
| `pos/src/pages/admin/FiscalSettingsCard.tsx` | Секция настроек со своим сохранением и двумя жёсткими состояниями |

Решения, которые легко переизобрести неправильно:

1. **Ветвимся на `sale_voided`, никогда на `sale_kept`.** Одна серверная ветка
   не присылала `sale_kept` вовсе (исправлено, но клиент всё равно читает
   `sale_voided`), и чтение `sale_kept === true` тихо уронило бы этот случай в
   исход «пробей ещё раз» — для продажи, которая уже состоялась.
2. **502 «продажа сохранена» — экран успеха, не ошибки.** Покупатель заплатил и
   ушёл с товаром. Там же подавляется автопечать (иначе на руки уедет бумажка
   без фискального номера, выглядящая как чек) и скрывается «Скасувати чек».
3. **Модалка оплаты непрозрачна**, поэтому 503 показывается **внутри неё**;
   раньше сообщение уходило на баннер за модалкой и кассир не видел ничего.
4. **Путь синхронизации никогда не читает `sale_voided`.** Следующая попытка
   сама превращает неопределённость в ответ: 503 ничего не записал; 502
   «сохранена» реплеится в 200 с продажей; 502 «отменена» — в 409. Это и купил
   фикс 409 в фазе 4.
5. **Лимит попыток нельзя вводить наивно.** Ожидание клиента — пропуск, а не
   попытка; 401 останавливает весь прогон, ничего не помечая. Иначе один
   протухший токен вынес бы всю очередь за восемь тиков.
6. **Бампа версии Dexie нет** — все новые поля не индексируются, а `'dead'` это
   новое *значение* на уже проиндексированном `status`.
7. **`refund_fiscal` не попадает в сохранённую продажу.** `putLocalSale`
   хранит `detail` целиком, поэтому иначе фискальный код возврата навсегда
   выдавал бы себя за код продажи в офлайн-зеркале.
8. **`FiscalBadge` на `'none'`/`undefined` не рендерит ничего** — именно это
   оставляет экраны нефискального магазина неизменными.

### Что уже лежит в репозитории (фаза 6)

| Файл | Роль |
|---|---|
| `src/pos/routes/fiscal.routes.ts` | `POST /fiscal/test-connection` (owner) — зовёт `provider.probe` через `getFiscalCredentials(storeId, {requireEnabled:false})`, не требует включённого тумблера |
| `src/pos/fiscal/settings.service.ts` | `getFiscalCredentials` — новый опциональный `{requireEnabled?}`, по умолчанию `true` (существующие вызовы не тронуты) |
| `src/pos/core/modules.ts` | `assertSingleFiscalRemote` + `FiscalRemoteConflictError` — не больше одного `fiscal-*` в `module_remotes`, и его суффикс обязан совпасть с `pos_fiscal_settings.provider`, если тот уже задан |
| `src/pos/routes/store.routes.ts` | `PATCH /store` зовёт гард перед записью `module_remotes`, 400 при конфликте |
| `pos/src/services/api.ts` | `PosApi.posRequest<T>(method, path, body?)` — единственный новый символ в `@pos/platform`, дженерик поверх того же `this.client` (та же `baseURL`/`Authorization`/`X-POS-API-Version`), а не метод на эндпоинт — три провайдера × ~10 эндпоинтов не должны стать версией шелла на каждый |
| `pos/src/modules/fiscal-core/` | Общий код, НЕ модуль (нет `manifest.ts`/`remote-entry.ts`): `types.ts` (зеркало wire-типов), `lib/hostPlatform.ts` (`REQUIRED_HOST_API=['api.posRequest']`, `HostTooOldError`), `lib/diagnostics.ts` (коды поддержки `FC-…`), `data/fiscalApi.ts`, `components/{SecretsForm,ShiftPanel,FiscalErrorCard}.tsx`, `hooks/useFiscalStatus.ts` |
| `pos/src/modules/fiscal-checkbox/` | Тонкий бандл: `manifest.ts` (`id:'fiscal-checkbox'`, `alwaysEnabled:true`, роуты `/fiscal/*` и admin `fiscal`), `remote-entry.ts`, `secretSpecs.ts` (`CHECKBOX_SECRET_SPECS`: `licenceKey`, `cashierPin` — статично, контрактным тестом закреплено под будущий адаптер), `pages/{CheckboxAdminPage,CheckboxTillPage}.tsx` |
| `pos/vite.fiscal-checkbox-remote.config.ts` | Копия `vite.tiktok-live-remote.config.ts`, `outDir: dist-remotes/fiscal-checkbox` |
| `pos/scripts/module-tailwind.mjs` | `moduleCss(moduleId, extraContent=[])` — второй, обратно совместимый параметр, чтобы Tailwind-классы `fiscal-core` попали в `style.css` бандла, который его импортирует |
| `pos/package.json` | `build:fiscal-checkbox-remote`, `serve:fiscal-checkbox-remote` (порт 5005), `check:fiscal-checkbox-css-coverage`; версия `1.1.0` |

Решения, которые легко переизобрести неправильно:

1. **`POST /fiscal/test-connection` намеренно не требует `enabled:true`.** Весь
   смысл кнопки «Перевірити з'єднання» — дать владельцу проверить креды
   *перед* тем, как включать тумблер; сам `probe()` документирован как
   безопасный для вызова с экрана настроек.
2. **Хост-владеемые настройки** (`enabled`/`provider`/`default_tax_code`/
   `auto_open_shift`) редактируются только в хостовой `FiscalSettingsCard`
   (фаза 5); **креды** — только в бандле провайдера, через `PATCH
   /fiscal/settings` с телом `{secrets:{...}}`, отправленным через `posRequest`
   в обход узкого `updateFiscalSettings` (его `FiscalSettingsPatch` намеренно
   не включает `secrets`, чтобы хостовая карточка не могла словить 503). Если
   бы единственный редактор «включено ли» жил внутри бандла, который не
   загрузился, магазин не смог бы его выключить.
3. **`assertSingleFiscalRemote` терпим к порядку бутстрапа**: `null`
   настроенный провайдер не конфликтует ни с чем — владелец может добавить
   `fiscal-checkbox` в `module_remotes` раньше, чем выберет провайдера в
   настройках (и это подтверждено живым тестом через реальный UI, не мок).
4. **`fiscal-core` — не модуль.** Не имеет `manifest.ts`/`remote-entry.ts`,
   иначе `module-release.yml` счёл бы его отдельно выпускаемым; импортируется
   бандлом относительно (`../fiscal-core/…`), что `check-platform-boundary.mjs`
   уже разрешает.
5. **Форма кредов не тянет схему с бэкенда.** Адаптера ещё нет, поэтому
   `secretSpecs.ts` статично объявляет два поля Checkbox из спеки
   (`CashierSignInPinCode.pin_code` + заголовок `X-License-Key`); тест на
   `manifest.test.ts` — тревога, если реальный адаптер фазы 2б заведёт другой
   набор `secretKeys`.
6. **`GET /fiscal/status` никогда не бросает** — «не налаштовано» рендерится
   в `CheckboxTillPage`/`CheckboxAdminPage` как обычное состояние, а не через
   `FiscalErrorCard` (тот берёт `error: unknown` и предназначен для реально
   пойманных исключений, например неудачного `POST`).
7. **Rollup выносит общий чанк между двумя ленивыми страницами бандла**
   (`FiscalErrorCard-*.js`) — это ожидаемо и безопасно: `sign-remote.mjs`
   хеширует каждый `.js`/`.css` в `dist-remotes/<id>/`, а не только
   `remote-entry.js`, так что подпись покрывает и его.

Ручная проверка живьём (без реального Checkbox, на `FakeFiscalProvider`):
собранный бандл добавлен в `module_remotes` через настоящий UI «Онлайн-модулі»
и подтверждён прямым запросом в БД; подпись Ed25519 проверена кнопкой
«Перевірити джерело» («Підпис дійсний · fiscal-checkbox 1.1.0»); `/admin/fiscal`
и `/fiscal` открыты в браузере против настоящего бэкенда — обе страницы
рендерятся корректно, «Перевірити з'єднання» честно отдаёт 409
`FS-NOT-CONFIGURED` (адаптера нет), `/fiscal` показывает «ПРРО не
налаштовано». Полный автопрогон: бэкенд 794 теста / 54 файла, клиент 461 тест
/ 51 файл, покрытие 99.17%/97.56%, typecheck/lint чисты на обеих сторонах.

### Что уже лежит в репозитории (фаза 2б)

| Файл | Роль |
|---|---|
| `src/pos/fiscal/providers/checkbox/index.ts` | Сам `CheckboxProvider`: все 11 методов `FiscalProvider`, поллинг открытия/закрытия смены и продажи/возврата/чека внутри одного вызова |
| `src/pos/fiscal/providers/checkbox/client.ts` | Сырой HTTP-транспорт: заголовки, парсинг тела, `CheckboxApiError` |
| `src/pos/fiscal/providers/checkbox/poll.ts` | `pollUntil`/`delay` — использует `ctx.signal` как есть, без своего таймаута |
| `src/pos/fiscal/providers/checkbox/errors.ts` | HTTP-код + `code` тела → `FiscalErrorKind`, таблица на живых фикстурах |
| `src/pos/fiscal/providers/checkbox/payload.ts` | `FiscalDoc` → payload Checkbox и обратно |
| `src/pos/fiscal/providers/index.ts` | `BUILT_IN = [checkboxProvider]` — больше не пуст |
| `src/__tests__/fixtures/checkbox/` | Реальные пары запрос/ответ песочницы (20 файлов + README с находками) |
| `src/__tests__/pos.fiscal.checkbox.{poll,client,errors,payload,provider}.test.ts` | 76 юнит-тестов, вся сеть замокана |

Решения, которые легко переизобрести неправильно:

1. **Весь поллинг живёт внутри одного вызова метода адаптера.** Checkbox
   отвечает `202`/`201` сразу, финальное состояние — секунды спустя, а вся
   оркестрация выше (`shifts.service.ts`, `fiscal.service.ts`) `await`-ит
   каждый метод `FiscalProvider` РОВНО ОДИН РАЗ и трактует результат как уже
   финальный — ни одного места для «подожди и перечитай» на этом уровне нет.
2. **`ctx.signal` прокидывается в каждую попытку `fetch` без урезания** —
   никакого собственного `AbortSignal.timeout()`, в отличие от
   `qr.service.ts`. Это ОБЩИЙ бюджет всей операции с точки зрения вызывающей
   стороны (9 c живой чек, 12 c интерактивные роуты смены, 20 c крон); при
   срабатывании поллинг просто падает `TimeoutError`/`AbortError`, что
   `asFiscalError` уже превращает в `unavailable` — специального кода не
   нужно.
3. **`auto_close_at` в `openShift` никогда не передаётся Checkbox.** Найдено
   только живым прогоном: Checkbox отклоняет его `422`-ошибкой, если дата
   выходит за рамки текущего календарного дня, а `shifts.service.ts` всегда
   считает его как «сейчас + 23.5 ч» — во второй половине дня это почти
   всегда следующие сутки, и БЕЗ этого фикса открытие смены (а значит и
   любая продажа) 503-ит на протяжении половины суток. Свой крон
   (`SHIFT_MAX_AGE_MS`) остаётся единственным энфорсером лимита для этого
   провайдера.
4. **Строчная скидка идёт через `discounts:[{mode:'VALUE'}]`, не
   `total_sum`.** `total_sum` (прямой override суммы строки) оказался
   переключаемой настройкой организации — тестовый аккаунт отверг его
   `400 organization.option_disabled`. `discounts` — базовый механизм,
   доступный всем; скидка **вычисляется** (`unitPriceCents×quantity −
   lineTotalCents`), а не берётся из `line.discountCents` напрямую, потому
   что `mapping.ts` всегда обнуляет это поле у возвратов (скидка уже внутри
   `amount_cents`) — доверие ему занизило бы скидку ровно там, где она
   реально есть.
5. **`receipt.already_exists` резолвится без похода в тело ошибки.**
   Checkbox использует наш `requestId` как id чека 1-в-1 (подтверждено
   вживую), так что при дубликате `existingProviderDocId` подставляется как
   `doc.requestId` — `resolveDuplicate` в `fiscal.service.ts` сразу знает,
   что читать через `fetchDocument`.
6. **`base.credentials` → `auth_expired`, не `auth_rejected`.** JWT
   песочницы не несёт `exp`-клейма, и этот код приходит одинаково и на
   мусорный, и на честно устаревший токен — терминальная классификация
   означала бы, что сессия, инвалидированная по обычной причине, никогда не
   восстановится сама.
7. **X-звіт не поллится вовсе** — в отличие от смен и чеков, `fiscal_code`
   X-звіту никогда не заполняется (он не уходит в ДПС, в отличие от
   Z-звіту), а текст готов сразу после `POST /reports`. Z-звіт получает
   текст сразу после того, как поллинг закрытия смены увидел `CLOSED` —
   `z_report.fiscal_code` к этому моменту уже заполнен.

Живая сквозная проверка (реальные sandbox-креды, реальный `/api/pos`):
`PATCH /fiscal/settings` → «Перевірити з'єднання» (`ok:true`, имя
тестового касира) → `/fiscal/shift/open` → `POST /sales/complete` → `fiscal.
status:'done'` с настоящим `fiscal_code` от `api.checkbox.in.ua` → возврат
через `/sales/:id/refunds` → `refund_fiscal.status:'done'` → X-звіт через
`/fiscal/x-report` → `/fiscal/shift/close` → корректный Z-звіт с верным
оборотом. Оба найденных вживую бага (п. 3–4 выше) обнаружены и исправлены
именно на этом прогоне — юнит-тесты на заранее собранных фикстурах их не
поймали, потому что обе фикстуры были собраны раньше, чем эти сценарии
(скидка, полный чекаут с реальным открытием смены) были опробованы.

### Что уже лежит в репозитории (фаза 8б, шаг 1 — фундамент офлайна)

Подробности — [POS_FISCAL_OFFLINE.md](POS_FISCAL_OFFLINE.md) §2, §3, §3а. Пока
`offline_mode` выключен (дефолт), поведение магазина не меняется вообще.

| Файл | Роль |
|---|---|
| `migrations/027_pos_fiscal_offline.sql` | `pos_fiscal_settings.offline_mode / offline_codes_target (50..2000) / holder_* / handover_*`; `pos_fiscal_offline_codes` (`free/leased/used/burned`); `pos_fiscal_offline_sessions` (`open/replaying/closed/stuck`, одна живая на регистратор); `pos_fiscal_receipts.mode / offline_session_id / offline_seq / control_number` |
| `src/pos/fiscal/types.ts` | `FiscalOfflineOps`, `OfflineStamp`, `OfflineCode`, `RegisterState`; `FiscalProvider.offline?`; `FiscalResult.controlNumber`; `FiscalErrorKind` + `register_held` |
| `src/pos/fiscal/providers/checkbox/{client,payload,errors,index}.ts` | `sell-offline`, `go-offline`, `go-online`, `ask/get-offline-codes(-count)`, `cash-registers/info`; текстовые отказы → `rejected` с `providerCode` `offline_not_manual` / `offline_code_used` |
| `src/pos/fiscal/offline/pool.ts` | `countCodes`, `refillOfflineCodes` (ask best-effort → get → upsert; недостача у провайдера → `burned` только для `free`), `takeFreeCodes` (`FOR UPDATE SKIP LOCKED`, по `serial_id`), `releaseLeasedCodes`, `refillAllStores` (крон) |
| `src/pos/fiscal/offline/holder.ts` | `claimRegister`, `touchHolder` (троттлинг в `runtime.ts`), `releaseRegister`, `requestHandover`, `confirmHandover`, `forceHandover`, `assertHolder` (гейт `preflight`, только при `offline_mode`) |
| `src/pos/fiscal/offline/status.ts` | блоки `offline` / `holder` для `GET /fiscal/status` |
| `src/pos/fiscal/settings.service.ts` | `offline_mode` принимается только для провайдера с capability и при `enabled`; сброс при смене провайдера; запрет выключать при живой сессии; `offline_capable` в view |
| `src/pos/fiscal/shifts.service.ts` | `closeDueShifts` пропускает смену с сессией `open/replaying` |
| `src/pos/routes/{fiscal,checkout}.routes.ts`, `routes/_shared.ts` | `readDeviceId` (`X-POS-Device-ID`); `POST /fiscal/register/{claim,release,handover/request,handover/confirm,handover/force}`; 409 `register_held {holder}` на продаже/возврате/служебном чеке |
| `src/pos/core/auth.ts`, `src/pos/types.ts`, `pos/src/types.ts` | `fiscal.offline_mode` в auth-контексте и ответе логина |
| `src/api.ts` | `X-POS-Device-ID` в CORS `allowedHeaders` |
| `src/index.ts` | Крон `*/10 * * * *` → `refillAllStores` |
| `pos/src/services/api.ts`, `pos/src/offline/sync.ts` | `api.setDeviceId` — касса шлёт `X-POS-Device-ID` |
| `src/pos/fiscal/providers/checkbox/sandbox-offline.ts` | `npm run fiscal:sandbox:offline` — прогон офлайн-цикла на тестовой кассе, пишет `fixtures/checkbox/offline_*.json` |
| `src/__tests__/pos.fiscal.{checkbox.offline,offline.pool,holder}.test.ts` (+ settings, shifts) | адаптер на fetch-моке; пул и крон; держатель/передача/force через роуты; валидация настроек; гейт автозакрытия |

### Что уже лежит в репозитории (фаза 8б, шаг 2 — серверная офлайн-сессия)

План и решения — [POS_FISCAL_OFFLINE.md](POS_FISCAL_OFFLINE.md) «План
исполнения фазы 2». Случай B: провайдер недоступен с бэкенда, касса на связи.

| Файл | Роль |
|---|---|
| `migrations/028_pos_fiscal_offline_replay.sql` | `pos_fiscal_offline_sessions.last_go_online_at` — троттлинг `go-online` (≤ 1 раз в 2 мин) переживает рестарт |
| `src/pos/fiscal/offline/session.ts` | `openServerSession` (INSERT под частичным уникальным индексом + код на `go-offline` в той же транзакции), `stampNext` (`FOR UPDATE` строки сессии → плотный `offline_seq`, следующий `free`-код → `used` с `receiptId`), `getLiveSession`, `listLiveServerSessions`, `listStuckSessions`, `mark{Replaying,GoOfflineSent,GoOnlineSent,Closed,Stuck}` |
| `src/pos/fiscal/ledger.ts` | `mode` в `openDocument`, `stampOfflineDocument`, `listSessionDocuments`, `claimSessionDocument`, `lastDoneProviderDocId`, `lastOnlineDeliveredAt`, `countSessionDocuments`; `claimDueDocuments` — только `mode='online'` и не для магазина с живой сессией; `abandonStaleDocs` не трогает документы живой сессии |
| `src/pos/fiscal/errors.ts` | гейтовые `kind`: `replaying`, `offline_limit`, `shift_deadline`, `offline_session_open`, `offline_codes_exhausted` (`isOfflineGate`, терминальные) |
| `src/pos/fiscal/fiscal.service.ts` | `preflight(…, op)`: живая сессия → `offlineGate` (гейты 36h/24h, `replaying`, не-продажи), `unavailable` при `offline_mode` внутри смены, открытой онлайн → `openServerSession`; `fiscalizeSaleOffline` (без вызова провайдера; провал штампа → void); `unavailable` на живом вызове сбрасывает кэш смены; `replayServerSessions` / `replayOneSession` (`live`-приоритет лимитера — продажи магазина в `replaying` и так отклонены); `RetryResult` + `replayed/closed/stuck` |
| `src/pos/fiscal/offline/pool.ts` | `takeFreeCodes(…, db)` в чужой транзакции; `refillAllStores({ storeId })` для тестов |
| `src/pos/fiscal/offline/status.ts` | `sessionView`: `go_offline_sent`, `last_go_online_at`, `documents {pending,done,abandoned}`, `error_code` |
| `src/pos/routes/checkout.routes.ts`, `routes/fiscal.routes.ts` | `op` в `preflight` (`refund` / `service`); `FiscalView` + `mode` / `control_number`; 409 `offline_session_open` на `POST /fiscal/shift/close`; `sessions` в `GET /fiscal/attention`; гейтовые `kind` → 409 в `replyFiscalError` |
| `src/index.ts` | лог крона `*/2` с `replayed/closed/stuck` |
| `src/__tests__/pos.fiscal.offline.{session,checkout,replay}.test.ts`, `helpers/fake-fiscal-provider.ts` | сессия/штамп под гонкой; случай B по HTTP и все гейты; полный реплей, обрыв посреди, `rejected`, порядок дат, троттлинг `go-online`, `duplicate`; фейк: `goOfflineError`, `goOnlineLag`, `registerErrors` |

Что осталось из «Проверка (по фазам)» для фаз 1–2: прогон на песочнице
Checkbox (фаза 0) — `npm run fiscal:sandbox:offline`.

### Что уже лежит в репозитории (фаза 8а)

| Файл | Роль |
|---|---|
| `migrations/026_pos_fiscal_receipt_width.sql` | `pos_fiscal_settings.receipt_width SMALLINT ∈ (32, 48)`, дефолт 32 |
| `src/pos/fiscal/types.ts` | `FiscalReceiptWidth`, `receipt_width` в настройках/view/patch; `renderReceipt(..., opts?: {width})` |
| `src/pos/fiscal/fiscal.service.ts` | `attachProviderReceiptText` — между финалом документа и `markDone`, под-бюджет `RECEIPT_TEXT_BUDGET_MS = 2.5 c`, swallow-on-failure |
| `src/pos/fiscal/providers/checkbox/{client,index}.ts` | `?width=` на `GET /receipts/{id}/text` |
| `pos/src/lib/printer.ts`, `pos/src-tauri/src/hardware/receipt.rs` | `ReceiptData.provider_text?` / `fiscal?` — опциональные, `#[serde(default)]`; `build_ticket` печатает текст verbatim либо макет + фискальный блок с `printer.qrcode()` |
| `pos/src/lib/receipt.ts` | `fiscalParts()` — `sale.fiscal` / `refund_fiscal` → `provider_text` + `fiscal` |
| `pos/src/components/ReceiptPrintable.tsx` | `<pre>` для текста провайдера; фискальный блок со ссылкой ДПС в PDF-фолбэке |
| `pos/src/pages/admin/FiscalSettingsCard.tsx` | «Джерело чека», «Ширина чекової стрічки» (58/80 мм ↔ 32/48) |
| `pos/src/modules/returns/components/RefundSaleDialog.tsx` | Фискальный гейт автопечати возврата — паритет с продажей |

Решения, которые легко переизобрести неправильно:

1. **Текст тянет оркестратор, не адаптер.** `FiscalCallCtx` не несёт
   `receipt_source`, и это правильно — адаптер не должен знать про печать.
   `attachProviderReceiptText` сидит в `runDocument` после финала документа
   и до `markDone`, одна точка для продажи/возврата/duplicate-recovery/крона.
2. **Обрыв снятия текста никогда не ронятет документ.** Он уже `DONE` у
   провайдера; свой `AbortSignal.any([gate.signal, timeout(2.5 c)])`, ошибка
   логируется и `receiptText` остаётся как есть. Без этого 9-секундный бюджет
   чекаута мог бы «отменить» чек, который налоговая уже приняла.
3. **В `'local'`-режиме `receipt_text` принудительно `null`**, даже если
   адаптер что-то вернул из `registerSale`. Касса печатает текст провайдера
   ровно тогда, когда он есть, — значит наличие текста обязано быть
   *настройкой владельца*, а не случайностью адаптера.
4. **Ширина — настройка магазина, не станции.** Текст хранится per-чек и
   снимается там, где станции нет (крон-ретрай); `Dexie`-настройка рулона
   каждой кассы (`receiptPaperWidthMm`) серверу недоступна. Колонка, а не
   `config` jsonb: `PATCH` заменяет `config` целиком, а там уже
   `cashRegisterKey`.
5. **Фискальный блок в `'local'` — не опция.** Это фолбэк режима
   `'provider'`; без него сбой снятия текста печатал бы ту же нефискальную
   бумажку, ради которой всё затевалось. QR — нативная ESC/POS-команда
   (`codes_2d` уже в default-фичах `escpos 0.19`), не картинка.
6. **Никакой новой Tauri-команды.** Два опциональных поля в `ReceiptData`
   — ноль новой поверхности для модулей, ноль правок
   `check-tauri-capabilities.mjs`; старый Rust-билд молча печатает макет.
7. **`GET /receipts/{id}/text?width=`** подтверждён вживую на 32 и 48 —
   Checkbox сам переносит адрес и держит колонки; на 42 (дефолт) на 58 мм
   ломался бы каждый разделитель.

### Открытые вопросы

- [ ] X/Z-звіти на экране кассы рендерятся Checkbox'ом на 42 символа —
      только экран, не печать; при необходимости `receipt_width` туда — одной
      строкой через тот же `opts` у `xReport`/`closeShift`.
- [ ] QR в PDF-фолбэке (веб без принтера): ссылка `tax_url` текстом, QR-
      библиотеки нет. `qr_image_data_url` в 024 по-прежнему не пишется.
- [x] Завести тестовый аккаунт Checkbox (`my.checkbox.ua`), получить license key
      и PIN кассира — сделано, фаза 2б. **Коды налоговых ставок** не понадобились
      отдельно: `FiscalProvider` не имеет метода их листинга, `default_tax_code`
      остаётся полем, которое владелец вводит вручную на хостовой
      `FiscalSettingsCard` — завести `GET /cashier/tax` в интерфейс адаптера
      можно отдельной, небольшой фазой, если понадобится подсказка в форме.
- [x] Снять реальные пары запрос/ответ в `src/__tests__/fixtures/checkbox/*.json` —
      сделано, фаза 2б (20 файлов): успех, дубликат, закрытая смена, битый
      токен, неверный PIN/ключ, невалидный payload, health-check, X/Z-звіт.
      **Не снято**: 429 (не удалось спровоцировать — организация троттлит
      обработку, не приём запроса) и статус чека `ERROR` после успешного
      создания (ни один sandbox-чек так и не упал в это состояние) — оба
      оставлены как консервативные, но неподтверждённые решения в
      `providers/checkbox/errors.ts`/`index.ts`.
- [ ] Запросить у поддержки **Є-Чек** техническую документацию API — публичной не
      найдено.
- [ ] Уточнить у Вчасно, обязателен ли Device Manager или Cloud API v3
      самодостаточен (влияет на объём фазы 8).
- [ ] Решить, нужен ли магазину статус плательщика ПДВ (влияет на то, будет ли
      `default_tax_code` вообще заполнен).
