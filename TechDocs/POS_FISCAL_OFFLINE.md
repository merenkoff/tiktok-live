# ПРРО — полный офлайн-режим (фаза 8б): дизайн

Статус: **дизайн одобрен 2026-09-10, реализация не начата.** Родитель —
[POS_FISCAL_PRRO.md](POS_FISCAL_PRRO.md) (§4 «Нет связи с ПРРО → продажа
блокируется» остаётся поведением по умолчанию; этот документ описывает, что
меняется, когда владелец включает офлайн-режим).

## Зачем

Сегодня фискализирующий магазин **не продаёт без связи с ПРРО** (`fail_mode =
'block'`, `OfflineFiscalError` на кассе, 503 `fiscal_unavailable` на бэкенде).
Юридически чисто, но магазин стоит, пока нет интернета. ДПС предусматривает
офлайн-режим: касса заранее получает запас офлайн-фискальных номеров, выдаёт
чеки без связи не дольше 36 часов, а при восстановлении отправляет цепочку
транзакций в порядке создания.

Checkbox реализовал это в API — берём как **эталонный каркас**: провайдер,
который умеет офлайн, обязан уметь ровно этот набор операций; кто не умеет
(Вчасно, Є-Чек — пока неизвестно) — его UI-модуль остаётся online-only.
Офлайн-способность — **capability адаптера**, включение — **параметр магазина
в модуле ПРРО**.

## Что даёт API Checkbox (OpenAPI 2.106.4, `api.checkbox.in.ua/api/openapi.json`)

| Операция | Эндпоинт / поля |
|---|---|
| Перевести кассу в офлайн | `POST /cash-registers/go-offline {go_offline_date, fiscal_code?}` — сама транзакция, тратит код; без кода сервер назначит сам |
| Вернуть в онлайн | `POST /cash-registers/go-online` — отправляет в ДПС все офлайн-транзакции **в порядке создания**, первой обязана быть «перехід в офлайн»; касса онлайн только после успешной отправки всех |
| Запас кодов | `GET /cash-registers/ask-offline-codes?count&sync` (только онлайн, запрос к ДПС) → `GET /get-offline-codes?count` → `[{fiscal_code, serial_id, cash_register_id, created_at}]`; `GET /get-offline-codes-count` → `{available, minimal, default, used, enough_offline_codes}` |
| Семантика кодов | Код «сгорает» в ДПС **только после отправки чека с ним**; повторный `get` без передачи чеков возвращает те же коды → пул дедуплицируется по `fiscal_code` |
| Офлайн-чек | `POST /receipts/sell-offline` = `ReceiptSellPayload` + `fiscal_code`, `fiscal_date`, `control_number` (1–4 симв.), `previous_receipt_id?`; требует, чтобы касса была в офлайн-режиме («Cash register should be in manual offline mode!») |
| Смена офлайн | `CreateShiftPayload` / `CloseShiftPayload`: `fiscal_code` + `fiscal_date` («Час офлайн відкриття/закриття зміни») |
| Служебные чеки офлайн | `ReceiptServicePayload.fiscal_code/fiscal_date` |
| Состояние | `DetailedCashRegisterModel.offline_mode`, `stay_offline`; `TransactionModel.offline_id`, `previous_hash` — хеш цепочки считает ТП Checkbox |
| Лимит | 36 часов офлайна, потом касса блокируется до выхода в онлайн |
| Дедуп | заголовок `X-Device-ID` |

Из вики «Режим роботи каси» (снята 2026-09-10, полный текст —
[checkbox-api/cash-register.md](checkbox-api/cash-register.md)) — четыре
факта, которые правят дизайн:

1. **Порядок времени жёсткий.** Любая офлайн-транзакция — с `fiscal_date` ≥
   времени `ask-offline-codes`; `go_offline_date` ≥ времени последней
   доставленной в ДПС транзакции. **Неверная дата = касса застревает в
   офлайне и ломается** (формулировка Checkbox). Значит, офлайн-сессия не
   может перекрываться с онлайн-чеками того же регистратора.
2. **Checkbox сам уходит в офлайн при молчании ДПС** и подставляет коды из
   пула даже в чеки, присланные как онлайн. Перед реплеем пул нужно
   пересинхронизировать; `Offline code … was used before!` — ожидаемая
   ошибка, лечится следующим кодом.
3. **`go-online` асинхронный:** статус проверять раз в минуту по
   `offline_mode`, повторять при необходимости, лимит 1 запрос / 2 мин на
   кассу, после выхода в онлайн повторы прекратить.
4. ДПС выдаёт **до 5000 кодов**; `go-offline` без тела берёт код и время сам.

**Формат номера и контрольное число (ДПС):** фискальный номер офлайн-чека =
`<номер офлайн-сесії>.<порядковий номер документа в сесії>.<контрольне число>`;
чек обязан нести отметку «офлайн» и контрольное число, сформированное ПРРО. По
Порядку ДПС контрольное число — из SHA-256 над строкой полей чека (seed сессии,
дата, время, локальный номер, ФН ПРРО, сумма). **Точная строка, разделители,
источник seed и обязательность `control_number` в `sell-offline` — вопросы
фазы 0.**

## Ключевые решения

### 1. Три случая потери связи — один механизм

| Случай | Кто без связи | Кто выдаёт офлайн-чек | Кто держит коды |
|---|---|---|---|
| A. ДПС недоступна, Checkbox доступен | Checkbox ↔ ДПС | **Checkbox сам** (`enough_offline_codes`, авто-запрос `default`) — наш `POST /receipts/sell` работает, чек помечен офлайн | Checkbox |
| B. Checkbox недоступен, касса ↔ наш API есть | бэкенд ↔ Checkbox | **бэкенд** из серверного пула | бэкенд (`pos_fiscal_offline_codes`) |
| C. Касса без интернета (главный бизнес-случай) | касса ↔ наш API | **касса** из своей аренды кодов | касса (лизинг от бэкенда) |

A нам почти ничего не стоит — только отметка офлайн на чеке. B и C — одна и та
же «офлайн-сессия» с разным **держателем** (`holder: 'server' | 'device'`) и
одна цепочка реплея. Это и есть каркас, который провайдер обязан поддержать.

### 2. Capability адаптера, параметр магазина

```ts
// src/pos/fiscal/types.ts
export interface FiscalOfflineOps {
  goOffline(ctx, at: Date, fiscalCode: string): Promise<void>;
  goOnline(ctx): Promise<void>;                         // отправка цепочки
  askOfflineCodes(ctx, count): Promise<void>;           // только онлайн
  getOfflineCodes(ctx, count): Promise<Array<{ fiscalCode: string; serialId: number }>>;
  offlineCodesCount(ctx): Promise<{ available; minimal; used; enough: boolean }>;
  registerSaleOffline(ctx, doc: FiscalSaleDoc, off: OfflineStamp): Promise<FiscalResult>;
  registerRefundOffline(ctx, doc: FiscalRefundDoc, off: OfflineStamp): Promise<FiscalResult>;
  openShiftOffline?(ctx, off: OfflineStamp): Promise<FiscalShiftState>;   // v2
  closeShiftOffline?(ctx, off: OfflineStamp): Promise<FiscalShiftClosed>; // v2
}
export interface OfflineStamp { fiscalCode: string; fiscalDate: Date; controlNumber: string; previousDocId?: string }
FiscalProvider.offline?: FiscalOfflineOps;   // отсутствует ⇒ модуль online-only
```

- `pos_fiscal_settings.offline_mode BOOLEAN` (миграция 027). `PATCH` с
  `offline_mode: true` → 400, если у адаптера нет `offline`. `GET
  /fiscal/settings` отдаёт `offline_capable`; UI-модуль показывает тумблер
  только когда `true`. `AuthResponse.store.fiscal.offline_mode` — касса в
  холодном офлайне читает решение «блокировать или выдавать» из кеша
  (`staffUnlock`, как `fiscalEnabled`).
- Контрольное число считает **хост** (`pos/src/lib/fiscalOffline.ts` + зеркало
  `src/pos/fiscal/offlineNumber.ts`, одна чистая функция, общие векторы
  тестов): формула ДПС-шная, не Checkbox-специфичная. Если фаза 0 покажет, что
  seed/формула зависят от провайдера — уйдёт в `FiscalOfflineOps`.

### 3. Пул кодов и лизинг

- **Пул на бэкенде** — `pos_fiscal_offline_codes (store_id, register_key,
  fiscal_code UNIQUE, serial_id, status: 'free'|'leased'|'used'|'burned',
  lease_id, used_by_receipt_id, fetched_at)`. Пополнение: крон раз в 10 мин и на
  `preflight`, если `free < minimal` и провайдер онлайн → `askOfflineCodes` +
  `getOfflineCodes`, upsert по `fiscal_code`. Размер запаса — настройка
  (`offline_codes_target`, дефолт 200).
- **Аренда кассе** — `POST /fiscal/offline/lease {device_id, want}` → K кодов
  (`offline_lease_size`, дефолт 50) + `shift` (id, `opened_at`, `deadline =
  opened_at + 24h`), `prro_fn`, seed (если нужен) → касса хранит в
  `cloth-pos-offline` (`meta`), обновляет на каждом `/me`/синке. Коды `leased`
  бэкенд **не** использует сам.
- **Одна аренда на магазин** (v1): один регистратор = одна офлайн-сессия;
  вторая касса того же магазина получает `409 lease_taken` и в офлайне
  блокируется как сегодня. Web-шелл лизинг не получает никогда.
- **Пока аренда активна, регистратор принадлежит этой кассе.** Из факта 1
  выше: если во время офлайна кассы бэкенд доставит в ДПС хоть один онлайн-чек
  (веб-шелл, вторая касса), офлайн-сессию с более ранним `go_offline_date`
  реплеить нельзя. v1: магазин с `offline_mode` — это **одна касса**;
  онлайн-продажи через веб-шелл при активной аренде бэкенд отклоняет 409
  `register_leased` с понятным текстом. Снятие ограничения — v2 (две
  сессии/два регистратора).

### 4. Касса без сети (случай C) — что делает `completeSale`

Гейты, все локальные: `offline_mode` включён · аренда не пуста · смена **была
открыта до потери связи** и `now < shift.deadline − 15 мин` · `now −
offline_since < 36h − 30 мин`. Любой провал → `OfflineFiscalError` с конкретной
причиной («закінчились офлайн-коди», «зміна спливає», «офлайн понад 36 год»).

Иначе: взять следующий код, `fiscal_date = now`, `local_number` (наш `OFF-…`),
`control_number = f(…)`, фискальный номер `<code>.<control>`, QR/ссылка ДПС
собираются локально → продажа в outbox с `fiscal_offline: { fiscal_code,
fiscal_date, control_number, seq }` → чек печатается **с фискальным блоком и
отметкой «ОФЛАЙН»** (расширение `fiscalParts()` / `ReceiptData.fiscal`). Экран
успеха — обычный.

### 5. Реплей (оба держателя)

`pos_fiscal_offline_sessions (id, store_id, holder, device_id, lease_id,
started_at, go_offline_code, status: 'open'|'replaying'|'closed'|'stuck',
ended_at)`. Оркестратор в `fiscal.service.ts`:

0. пересинхронизировать пул (`getOfflineCodes`) — Checkbox мог сам уйти в
   офлайн и потратить коды; коды, которых больше нет в выдаче, помечаются
   `burned`, арендованные кассой и уже использованные ею — остаются;
1. `goOffline(at = started_at, code = go_offline_code)` — один раз на сессию
   (идемпотентно: сессия помнит `id` транзакции); `started_at` обязан быть ≥
   времени последней доставленной транзакции — иначе сессия сразу `stuck` в
   список внимания, **не** отправляем;
2. документы сессии в порядке `seq`/`fiscal_date` → `registerSaleOffline` со
   штампом; `duplicate` → `fetchDocument`, как сегодня; `rejected` на
   офлайн-документе — в список внимания, **не** отменять продажу (товар ушёл);
3. когда очередь сессии пуста и держатель сообщил «снова онлайн» (касса — по
   факту синка; сервер — по факту `preflight` ok) → `goOnline`, дальше крон
   раз в минуту читает `offline_mode`, при `true` повторяет `goOnline` не
   чаще 1 раза в 2 минуты; при `false` — сессия `closed`, `used`-коды
   помечены, пул пополнен. Обычные онлайн-продажи магазина на время
   `replaying` не принимаются (503 `fiscal_replaying`, секунды-минуты).

Случай C: `POST /sales/complete` принимает `fiscal_offline`; бэкенд создаёт
продажу (идемпотентно по `client_uuid`), строку реестра `mode='offline'` со
штампом и **не вызывает провайдера в запросе** — реплей делает крон
`retryPendingFiscalDocs` по сессиям, в порядке. Ответ 201 с фискальными полями
из штампа. Случай B: `preflight` при `unavailable` и `offline_mode` →
серверная сессия, документ регистрируется штампом сразу, 201; крон реплеит,
когда провайдер вернётся.

### 6. Смена и 24 часа — честный компромисс

Пока у кассы живая аренда, `closeDueShifts` **не закрывает** смену: Z-отчёт,
отправленный до реплея офлайн-чеков, сделает их чеками «после Z». Если дедлайн
смены прошёл, а касса так и не вышла на связь — смена помечается `stuck`,
попадает в список внимания владельца; продажи на кассе уже заблокированы
гейтом (§4). Открытие/закрытие смены **офлайн** (с кодами) — v2: в v1
офлайн-сессия живёт только внутри смены, открытой онлайн.

### 7. Что не делаем в v1

- Офлайн-открытие/закрытие смены и офлайн-служебные чеки.
- Возвраты офлайн (`registerRefundOffline` в контракте есть, касса в офлайне
  возврат не проводит — как сегодня).
- Две офлайн-кассы на один регистратор.
- Провайдеры без capability — ничего, кроме скрытого тумблера.

## Фазы

Каждая фаза перед стартом получает свой короткий план исполнения.

| Фаза | Что | Оценка | Статус |
|---|---|---|---|
| **0. Исследование на песочнице** | Раздел «Офлайн режим» вики Checkbox и Порядок ДПС; на тестовой кассе: `ask/get-offline-codes`, `go-offline`, `sell-offline` с `control_number` и без, `go-online`, поведение `POST /receipts/sell` в manual offline; источник seed; фикстуры `src/__tests__/fixtures/checkbox/offline_*.json`; итог — раздел «Контракт офлайн» здесь с точной формулой | 2–3 дня | ⬜ |
| **1. Capability + пул** | `FiscalOfflineOps`, реализация в `providers/checkbox` (+ `offlineNumber.ts`), миграция 027 (`offline_mode`, `offline_codes_target`, таблицы кодов и сессий), крон пополнения, `GET /fiscal/status` с `offline: {available, leased, session}`; тесты | 3–4 дня | ⬜ |
| **2. Серверная сессия (случай B)** | `preflight` → офлайн-выдача штампом, реестр `mode`, реплей сессии в кроне, `goOnline`; матрица отказов §8 родителя дополнена офлайн-строками | 3 дня | ⬜ |
| **3. Лизинг и касса (случай C)** | `/fiscal/offline/lease`, кеш аренды и смены в `cloth-pos-offline`, гейты, `completeSale` со штампом, `fiscal_offline` в outbox и в `POST /sales/complete`, печать «ОФЛАЙН» + QR, причины вместо одного `OfflineFiscalError` | 5–6 дней | ⬜ |
| **4. UI** | `fiscal-checkbox`: на `/fiscal` блок «Офлайн: N кодів, сесія з …, лишилось …», прогресс реплея; Settings — тумблер «Офлайн-режим» (только при `offline_capable`), размер запаса; `OfflineStatusBanner` — «Офлайн, чеки ПРРО з резерву (N)»; список внимания — `stuck`-сессии и отклонённые офлайн-документы | 3 дня | ⬜ |
| **5. Закалка** | 36h/24h гейты на обеих сторонах, исчерпание кодов, `X-Device-ID`, e2e (веб-шелл с моком провайдера) + чек-лист десктопа, доки (`POS_FISCAL_PRRO.md`, `POS_DESKTOP.md`, `POS_FISCAL_CHECKBOX_SETUP.md`) | 3–4 дня | ⬜ |

Итого ~4 недели. Фаза 0 — обязательный вход: без точной формулы контрольного
числа и семантики `sell-offline` фазы 3–4 не имеют смысла.

## Открытые вопросы (закрыть в фазе 0)

1. Формула контрольного числа и **откуда seed** — есть ли он в
   `GET /cash-registers/info` / в кодах, или Checkbox считает `control_number`
   сам при `sell-offline` (тогда напечатанный офлайн чек не сможет нести
   контрольное число — юридическая проблема, нужен ответ поддержки).
2. Обязателен ли `go-offline` перед `sell-offline` при уже открытой онлайн
   смене (вики «Режим роботи каси» это подтверждает косвенно: офлайн-переход —
   отдельная транзакция с кодом), и что делает `POST /receipts/sell`, пока
   регистратор в manual offline.
3. `previous_receipt_id` — нужна ли ДПС-цепочка на нашей стороне.
4. Отметка «офлайн» на печатном чеке и в QR: какие поля ДПС ждёт в ссылке
   проверки для офлайн-документа.
5. `rejected` на реплее офлайн-чека: переотправить с новым кодом или ручной
   разбор.

## Файлы (ориентир)

- Бэкенд: `src/pos/fiscal/{types,fiscal.service,shifts.service,ledger,runtime}.ts`,
  новые `src/pos/fiscal/{offline.service,offlineNumber}.ts`,
  `providers/checkbox/{client,index}.ts`, `routes/{fiscal,checkout}.routes.ts`,
  `migrations/027_pos_fiscal_offline.sql`, кроны в `src/index.ts`.
- Касса: `pos/src/offline/{repository,db,sync,auth-local,errors}.ts`,
  `pos/src/lib/{fiscalOffline,receipt,printer}.ts`,
  `pos/src-tauri/src/hardware/receipt.rs` (отметка «ОФЛАЙН»),
  `pos/src/components/cashier/OfflineStatusBanner.tsx`, `CheckoutModal.tsx`.
- Модуль: `pos/src/modules/fiscal-core/{data/fiscalApi,components/ShiftPanel}.ts(x)`,
  `fiscal-checkbox/pages/*`, `pos/src/pages/admin/FiscalSettingsCard.tsx`.

## Проверка (по фазам)

- Фаза 0: фикстуры + записанная формула; ручной прогон на песочнице с реальными
  офлайн-кодами и `go-online`, транзакции видны в кабинете Checkbox.
- Фазы 1–2: root vitest с фейковым провайдером с `offline`: пул пополняется;
  провайдер недоступен → 201 со штампом; реплей в порядке; `duplicate`;
  `goOnline` только после пустой очереди.
- Фаза 3: pos vitest на `fake-indexeddb` (гейты, штамп, outbox); root — приём
  `fiscal_offline`; e2e веб-шелл с моком; **десктоп**: выключить сеть, продать
  3 чека, печать с «ОФЛАЙН» и номером, включить сеть → реплей → чеки в
  кабинете Checkbox с теми же номерами.
