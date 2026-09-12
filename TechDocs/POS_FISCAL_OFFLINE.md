# ПРРО — полный офлайн-режим (фаза 8б): дизайн

Статус: **дизайн одобрен 2026-09-10; фаза 1 (фундамент) — 2026-09-11, PR #71;
фаза 2 (серверная сессия, случай B) — 2026-09-11, PR #73; фаза 4 (UI) —
2026-09-11; печать офлайн-чека и свой QR — 2026-09-11/12, PR #75; **фаза 8в
(реквизиты из Checkbox + полный макет) — план 2026-09-12, в работе**; фазы 3 и
5 — ⬜; Checkbox Kasa — отложено.** Родитель —
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

**Контрольное число и QR — считает Checkbox, не мы.** Страницы «Чеки → Офлайн»
и «Зміни» (сняты 2026-09-10, [checkbox-api/receipts-offline.md](checkbox-api/receipts-offline.md),
[checkbox-api/shifts.md](checkbox-api/shifts.md)) закрыли главный вопрос:
в шаблоне `sell-offline` **нет** `control_number`, оно и `mac` для QR-ссылки
ДПС (`mac` = `transaction.previous_hash`, хеш цепочки транзакций ТП Checkbox)
приходят **в ответе**. Формулы в документации нет, цепочку хешей ведёт
Checkbox. Значит чек, напечатанный кассой без связи, может нести только
`fiscal_code`, `fiscal_date` и отметку «ОФЛАЙН»; контрольное число и QR
появляются после `sell-offline`. Плюс из «Зміни»: первая смена — только
онлайн; офлайн-открытие — после `go-offline`; **закрывать смену можно только
когда все её транзакции `DONE`**; лимит офлайна **36 ч подряд и 168 ч в
месяц**, считает клиент; смешивать API с Checkbox.Kasa/Manager запрещено.

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
- **Контрольное число и QR не считаются локально.** Штамп офлайн-чека на
  нашей стороне — только `fiscalCode` + `fiscalDate` (+ `previousDocId`);
  `controlNumber`, `tax_url`/`mac` заполняются из ответа `sell-offline` при
  реплее и **дописываются** в строку реестра и в локальное зеркало чека.
  `OfflineStamp.controlNumber` становится опциональным выходным полем. Если
  другой провайдер даст формулу — это его `FiscalOfflineOps`, не хост.

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
- **Аренду получает только держатель регистратора** (см. §3а): один
  регистратор Checkbox = одна наша касса в каждый момент времени. Web-шелл
  держателем не бывает и лизинг не получает.

### 3а. Регистратор, держатель и передача

**Инвариант v1: один ключ лицензии Checkbox = один регистратор = одна наша
касса, которая в каждый момент либо онлайн, либо офлайн.** Это модель самого
Checkbox (запрет смешивать клиентов на одном регистраторе, `X-Device-ID`
только для дедупликации) и она снимает вопросы про чужие транзакции: последняя
доставленная в ДПС транзакция регистратора — всегда наша же, правило
`go_offline_date` выполняется само.

Две разные вещи, которые нельзя путать:

| | Смена | Владение регистратором (holder) |
|---|---|---|
| Чья сущность | ДПС/Checkbox, на регистратор, ≤ 24 ч, Z-отчёт | наша, на бэкенде: какая касса **сейчас** имеет право использовать лицензию |
| Меняется при замене компьютера | **нет** — смена принадлежит регистратору, не устройству | да — замок переезжает |

`pos_fiscal_settings` (или таблица регистраторов в v2) получает
`holder_device_id`, `holder_name`, `holder_since`, `holder_last_seen_at`
(heartbeat — каждый `GET /fiscal/status` и каждый чекаут держателя, запись не
чаще раза в минуту) и `handover_device_id/_name/_requested_at` — текущий запрос
на передачу. Один держатель. Аренда офлайн-кодов выдаётся только держателю.

**Как реализовано в фазе 1 (2026-09-11):**

- Касса идентифицирует себя заголовком `X-POS-Device-ID` (`getDeviceId()` из
  `pos/src/offline/db.ts`, отправляет `api.setDeviceId` из `startOfflineRuntime`;
  веб-шелл заголовка не шлёт). Читается `readDeviceId` в `routes/_shared.ts`;
  заголовок добавлен в CORS `allowedHeaders`.
- **Замок действует только при `offline_mode = true`** (и у провайдера есть
  capability). При выключенном офлайне несколько онлайн-касс и веб-шелл продают
  как раньше — порядок транзакций держит провайдер.
- **Свободный регистратор занимает первая касса, которая продаёт** (`assertHolder`
  в `preflight`, до открытия смены) — одиночная касса не видит никаких экранов.
  Чужая касса и веб-шелл получают **409** `register_held` с блоком `holder`
  на `/sales/complete`, `/sales/:id/refunds`, `/fiscal/service`.
- Роуты (`src/pos/routes/fiscal.routes.ts`, сервис `src/pos/fiscal/offline/holder.ts`):

  | Роут | Кто | Ответ |
  |---|---|---|
  | `POST /fiscal/register/claim {device_name?}` | касса | 200 `{holder}`; 409 `register_taken` |
  | `POST /fiscal/register/release` | держатель | 200; 409 `not_holder` / `session_open` |
  | `POST /fiscal/register/handover/request {device_name?}` | вторая касса | 202 `requested`; 200 `claimed` (регистратор был свободен); 409 `already_holder` |
  | `POST /fiscal/register/handover/confirm {outbox_pending}` | держатель | 200 `{holder}`; 409 `not_holder` / `no_request` / `handover_blocked` (`reason: outbox_pending \| session_open`) |
  | `POST /fiscal/register/handover/force {device_id?, device_name?}` | **владелец** | 200 `{holder, stuck_sessions, burned_codes}`; 400 `no_target` |

  Без заголовка устройства первые четыре отвечают 400 `device_id_required`.
  `force` переводит открытые/реплеящиеся сессии прежнего держателя в `stuck`
  (`error_code = register_taken`), его `leased`-коды — в `burned`.
- `GET /fiscal/status` дополнен блоками `offline: {capable, enabled,
  codes_target, codes: {free, leased, used} | null, session | null}` и
  `holder: {device_id, name, since, last_seen_at, stale (> 5 мин тишины),
  is_me, handover_request} | null`.

**Передача (штатная, обе кассы онлайн):**
1. Вторая касса при входе видит «Каса зайнята пристроєм A з 09:12» и кнопку
   «Запросити передачу» → `POST /fiscal/register/handover/request`.
2. Держатель видит «Пристрій B просить передати касу. Передати?» и
   подтверждает → `POST /fiscal/register/handover/confirm`. Бэкенд проверяет
   **три условия**: держатель онлайн (это он и вызывает), у него **пустая
   очередь** (касса шлёт `outbox_pending: 0` в подтверждении и бэкенд не
   имеет от неё незакрытой офлайн-сессии), аренда **возвращена**
   (неиспользованные коды → обратно в `free`). Замок переставляется, смена
   продолжается на новой кассе без Z-отчёта.
3. Опция в подтверждении «закрити зміну перед передачею» — по умолчанию
   выключена: замена оборудования посреди дня не должна резать день на два
   Z-отчёта. Закрытие смены — вечерняя операция.

**Передача, когда держатель молчит** (сломан компьютер, ушёл в офлайн):
- пока держатель не подтвердил, вторая касса **не продаёт**; при
  `holder_last_seen_at` старше N минут ей показывается «Каса не відповідає —
  можливо, продає офлайн»;
- забрать регистратор может только **владелец**, кнопкой «Забрати касу
  примусово» с явным предупреждением: если на прежней кассе остались
  офлайн-чеки, они не попадут в ДПС автоматически и уйдут в ручной разбор;
  прежняя касса при выходе в сеть получает 409 `register_taken` на реплей,
  её офлайн-чеки — в список внимания владельца.
- Проверять, «уходила ли касса в офлайн», человеку не нужно: это знает
  бэкенд по аренде и по `outbox_pending` в подтверждении. Ручной остаётся
  только принудительный сценарий.

**Веб-шелл** при включённой фискализации на этот регистратор не продаёт
(409 `register_held`). Второй ключ лицензии = второй регистратор со своей
сменой, Z-отчётом и пулом кодов — модель «регистраторы магазина», **v2**;
он же даст горячий резерв и место для веб-шелла.

### 4. Касса без сети (случай C) — что делает `completeSale`

> **Пересмотрено 2026-09-11.** Ниже — первоначальный вариант, где касса
> печатает чек без контрольного числа и QR. Он отклонён: оба реквизита
> формирует тот, кто ведёт цепочку ПРРО, а офлайн-чек Checkbox их несёт (см.
> «Открытые вопросы»). Случай C делается через Checkbox Kasa — локальный ПРРО
> на машине кассы; гейты и учёт аренды ниже остаются в силе, меняется то, кто
> ставит штамп и что попадает на бумагу.

Гейты, все локальные: `offline_mode` включён · аренда не пуста · смена **была
открыта до потери связи** и `now < shift.deadline − 15 мин` · `now −
offline_since < 36h − 30 мин`. Любой провал → `OfflineFiscalError` с конкретной
причиной («закінчились офлайн-коди», «зміна спливає», «офлайн понад 36 год»).

Иначе: взять следующий код, `fiscal_date = now`, `local_number` (наш `OFF-…`)
→ продажа в outbox с `fiscal_offline: { fiscal_code, fiscal_date, seq }` →
чек печатается **с фискальным номером (= офлайн-код), датой и отметкой
«ОФЛАЙН», без контрольного числа и QR** — их нет до `sell-offline`. После
реплея контрольное число, `tax_url` и QR приходят в зеркало продажи; касса
предлагает **допечатать фискальный блок / отправить е-чек** (SMS/Viber
через `delivery.phone` Checkbox). Экран успеха — обычный, с пометкой
«офлайн: контрольне число буде після синку».

### 5. Реплей (оба держателя)

`pos_offline_session_opens (id, store_id, holder, device_id, lease_id,
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
   `replaying` не принимаются (503 `fiscal_unavailable` / `code: 'replaying'`, секунды-минуты).

Случай C: `POST /sales/complete` принимает `fiscal_offline`; бэкенд создаёт
продажу (идемпотентно по `client_uuid`), строку реестра `mode='offline'` со
штампом и **не вызывает провайдера в запросе** — реплей делает крон
`retryPendingFiscalDocs` по сессиям, в порядке. Ответ 201 с фискальными полями
из штампа. Случай B: `preflight` при `unavailable` и `offline_mode` →
серверная сессия, документ регистрируется штампом сразу, 201; крон реплеит,
когда провайдер вернётся.

### 6. Смена и 24 часа — честный компромисс

Пока у держателя живая аренда, `closeDueShifts` **не закрывает** смену: Z-отчёт,
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
| **0. Исследование на песочнице** | Документация снята (`checkbox-api/`); письмо в поддержку Checkbox по вопросам 1–2 ниже отправлено 2026-09-11; прогон на тестовой кассе — скрипт `npm run fiscal:sandbox:offline -- --ask --go` (`CHECKBOX_SANDBOX_LICENSE_KEY/PIN` в env) делает `ask/get-offline-codes` → `go-offline` → `sell-offline` (без `control_number`) → `go-online` → опрос `info` и пишет фикстуры `src/__tests__/fixtures/checkbox/offline_*.json`; осталось запустить его и закоммитить фикстуры | 1–2 дня | 🟡 ждёт прогона и ответа поддержки |
| **1. Capability, пул, держатель** | `FiscalOfflineOps` + `FiscalResult.controlNumber`, реализация в `providers/checkbox` (`sell-offline`, `go-offline/online`, `ask/get-offline-codes`, `info`), миграция 027 (`offline_mode`, `offline_codes_target`, `holder_*`, `handover_*`, `pos_fiscal_offline_codes`, `pos_offline_session_opens`, `pos_fiscal_receipts.mode/offline_session_id/offline_seq/control_number`), пул `offline/pool.ts` + крон `*/10` `refillAllStores`, держатель `offline/holder.ts` + роуты `register/{claim,release,handover/request|confirm|force}`, гейт в `preflight`, `X-POS-Device-ID` с кассы, `GET /fiscal/status` с `offline`/`holder`, `closeDueShifts` не трогает смену с живой сессией; песочный скрипт `npm run fiscal:sandbox:offline`; 5 новых тест-файлов | 4–5 дней | ✅ 2026-09-11, PR #71 |
| **2. Серверная сессия (случай B)** | `offline/session.ts` (одна живая сессия на регистратор, штамп с плотным `offline_seq`, код на `go-offline` в той же транзакции), `preflight` → сессия и штамп при `unavailable` внутри смены, открытой онлайн; гейты `replaying` / `offline_limit` / `shift_deadline` / `offline_session_open` / `offline_codes_exhausted`; реплей в `retryPendingFiscalDocs` (`replayServerSessions`: проба → пересинк пула → `go-offline` один раз → документы по `seq` → `go-online` ≤ 1/2 мин → `closed`); плоский ретрай не трогает магазин с живой сессией; 409 на ручное закрытие смены; `documents`/`error_code` сессии в `/fiscal/status`, `stuck`-сессии в `/fiscal/attention`; миграция 028; матрица отказов §8 родителя; 3 новых тест-файла (`offline.session`, `offline.checkout`, `offline.replay`) | 3 дня | ✅ 2026-09-11, PR #73 |
| **3. Касса без связи (случай C)** | **Облачный путь** (решение 2026-09-12, см. «Решение…» ниже): касса арендует коды, штампует чек, печатает всё, что есть, `sell-offline` при синке; контрольное число и `mac` дописываются после. Что печатать на бумаге до синка — вопрос в поддержку Checkbox. **Checkbox Kasa — отложено**, вернуться после облачного пути, если ответ Checkbox потребует. Перед фазой 3 — фаза 8в (реквизиты + полный макет) | 5–6 дней | ⬜ после 8в |
| **4. UI** | `fiscal-checkbox`: на `/fiscal` блок «Офлайн: N кодів, сесія з …, лишилось …», прогресс реплея; экраны держателя — «Каса зайнята… Запросити передачу», подтверждение у держателя, «Забрати примусово» у владельца; Settings — тумблер «Офлайн-режим» (только при `offline_capable`), размер запаса; `OfflineStatusBanner` — «Офлайн, чеки ПРРО з резерву (N)»; список внимания — `stuck`-сессии, отклонённые офлайн-документы, чеки принудительно снятой кассы | 4 дня | ✅ 2026-09-11 (план исполнения ниже) |
| **5. Закалка** | 36h/24h гейты на обеих сторонах, исчерпание кодов, `X-Device-ID`, e2e (веб-шелл с моком провайдера) + чек-лист десктопа, доки (`POS_FISCAL_PRRO.md`, `POS_DESKTOP.md`, `POS_FISCAL_CHECKBOX_SETUP.md`) | 3–4 дня | ⬜ |

Итого ~4–5 недель. Фазы 1–2 не зависят от ответа Checkbox на вопрос 1 и
могут идти параллельно с ним; фаза 3 (печать на кассе) — после ответа.

## План исполнения фазы 2 — серверная сессия (случай B)

Написан 2026-09-11 по коду после фазы 1 (`main` @ edfdfb5). Оценка — 3 дня.
Ветка `feat/pos-fiscal-offline-phase2`.

### Цель и граница

Провайдер недоступен, касса ↔ наш API есть, `offline_mode` включён: продажа
**не блокируется** — бэкенд ставит штамп из своего пула, документ ложится в
реестр `mode='offline'`, ответ 201 сразу; крон реплеит сессию в порядке и
возвращает регистратор в онлайн. В фазу 2 **не входит**: аренда кассе и всё
на стороне кассы (фаза 3), UI (фаза 4), офлайн-открытие/закрытие смены и
офлайн-возвраты (v2, §7).

Что оставила фаза 1 и на что опираемся:

- `preflight` (`fiscal.service.ts:114-130`) = `resolveContext` → `assertHolder`
  → `ensureOpenShift` → `getLiveShiftRow`; про офлайн не знает; 503 отдаёт
  роут (`checkout.routes.ts:75-103`, `:180-201`) по `kind`.
- Единственный путь передачи — `runDocument(gate, row, transmit, 'live'|'background')`
  (`:217-285`): duplicate → `resolveDuplicate`, восстановимые → `recover`,
  `rate_limited` → пауза, итог `markDone` / `markFailed` + `mayExistAtProvider`.
  Переиспользуем как есть, подставляя `registerSaleOffline` в `transmit`.
- `retryPendingFiscalDocs` (`:611-654`) — sweeps → `adoptOrphanedSales` →
  плоский `claimDueDocuments(RETRY_BATCH)` без порядка. Офлайн-документы в него
  попадать **не должны**.
- `ledger.openDocument` (`ledger.ts:108-156`) не пишет `mode / offline_session_id /
  offline_seq`; `markDone` уже пишет `control_number` из `result.controlNumber`.
- Строки `pos_offline_session_opens` никто не создаёт (только SELECT'ы и
  `forceHandover` → `stuck`); `closeDueShifts` уже пропускает смену с живой
  сессией; `settings` уже запрещает выключить `offline_mode` при живой сессии.
- Пул: `takeFreeCodes(storeId, key, n, mark)` с `FOR UPDATE SKIP LOCKED`,
  `refillOfflineCodes(ctx, signal)` (ask → get → upsert → `burned` для
  пропавших `free`) — это и есть «пересинк» шага 0 реплея.
- Фейковый провайдер `helpers/fake-fiscal-provider.ts` с `offline: true`
  (`FakeOfflineOps`: `reserve/mint/spend`, `registerSaleOffline` со
  синтетическим `controlNumber`), `queueError('unavailable')` = «провайдер
  недоступен», чекаут через `buildPosTestApp` + `POST /api/pos/sales/complete`.

### Решения, которых нет в §5 (фиксируем здесь)

1. **Пока сессия `open` — все продажи магазина идут штампом**, даже если
   провайдер уже ожил, но крон ещё не отреплеил: онлайн-чек внутри сессии
   ломает порядок `go_offline_date`. Сессию закрывает только реплей.
2. **Сессия `replaying` → 503 `fiscal_unavailable` / `code: 'replaying'`** на новые продажи
   (секунды-минуты; следующий тик крона либо закроет сессию, либо, если
   провайдер снова упал, продолжит с того же места).
3. **Сессия открывается только при живой смене, открытой онлайн**
   (`getLiveShiftRow` даёт строку `open`). Держатель регистратора в
   офлайн-режиме — всегда касса (веб-шелл отсекает `assertHolder`), и в
   случае B именно она и продаёт: серверная сессия открывается *для*
   держателя. Живая сессия с `holder='device'` (случай C, фаза 3) для всех
   остальных вызовов — 503 `offline_session_open`. Нет смены → 503
   `fiscal_unavailable`, как сегодня. _(Исправлено при реализации: исходное
   условие «только если `holder_device_id IS NULL`» было ошибкой.)_
4. **Возвраты и служебные чеки при живой сессии → 503 `offline_session_open`**.
   `registerRefundOffline` в контракте есть, но офлайн-возврат — v2 (§7);
   пропускать возврат онлайн внутри сессии нельзя (п. 1).
5. **`go-offline` тратит код из пула**: сессия при открытии берёт один код
   `takeFreeCodes(…, 1, { status: 'used', receiptId: null })` и хранит его в
   `go_offline_code`; `started_at = now()` (мы здесь, потому что провайдер
   лежит сейчас, значит ≥ последней доставленной транзакции; шаг 1 реплея
   всё равно проверяет).
6. **Штамп документа** = следующий `free` код (`{ status: 'used', receiptId }`)
   + `fiscal_date = now()` + `offline_seq` из счётчика сессии под `SELECT …
   FOR UPDATE` строки сессии (сериализует параллельные чекауты одного
   магазина). Строка реестра: `status='pending'`, `mode='offline'`,
   `fiscal_number = fiscal_code`, `fiscal_at = fiscal_date`, `control_number
   NULL`. Ответ кассе — `FiscalView` с `mode: 'offline'`, `status: 'pending'`,
   `control_number: null`, `qr: null`.
7. **`rejected` на офлайн-документе при реплее** → `markAbandoned` (список
   внимания), продажа **не** отменяется, цепочка продолжается; `previousDocId`
   следующего документа — последний `done` в сессии.
8. **Гейты сессии в `preflight`**: `now − started_at ≥ 36h − 30min` → 503
   `offline_limit`, сессия → `stuck` (`error_code='offline_limit'`);
   `now ≥ shift.opened_at + 24h − 15min` → 503 `shift_deadline`. Ручное
   `closeShift` при живой сессии → 409 `offline_session_open` (симметрично
   `releaseRegister`).
9. Кэш: `preflight` читает строку сессии одним индексированным SELECT (частичный
   уникальный индекс по `status IN ('open','replaying')`); в `runtime.ts` не
   кэшируем — состояние меняет крон из другого процесса.

### Шаги (в этом порядке, каждый с тестами)

**Шаг 1 — сессия и реестр** (`src/pos/fiscal/offline/session.ts`, `ledger.ts`)
- `session.ts`: `getLiveSession(storeId, key)`, `openServerSession(ctx, shiftId)`
  (INSERT `holder='server'` + `ON CONFLICT DO NOTHING` по частичному индексу →
  перечитать; код для `go-offline`), `stampNext(session, receiptId)` →
  `{ fiscalCode, fiscalDate, seq }`, `markReplaying / markClosed / markStuck(code, msg)`.
- `ledger.ts`: `OpenDocumentInput` + `mode`, `offlineSessionId`, `offlineSeq`,
  `stamp`; `claimDueDocuments` → `AND mode = 'online'`; `abandonStaleDocs` →
  не трогать `mode='offline'` в сессии `open/replaying`;
  `listSessionDocuments(sessionId)` по `offline_seq`; `lastDoneInSession`.
- Тест `pos.fiscal.offline.session.test.ts`: одна живая сессия на регистратор
  (гонка двух `openServerSession` → одна строка), `stampNext` монотонен под
  конкуренцией, коды помечены `used` с `receiptId`, `claimDueDocuments` не
  отдаёт офлайн-строки, `abandonStaleDocs` их не трогает.

**Шаг 2 — `preflight` и чекаут** (`fiscal.service.ts`, `checkout.routes.ts`, `types.ts`, `errors.ts`)
- `FiscalGate` + `mode: 'online' | 'offline'`, `session?`; `FiscalView` +
  `mode`, `control_number`/`qr` nullable.
- `preflight`: до `ensureOpenShift` — если есть живая сессия: `replaying` →
  throw `replaying`; `open` → гейты п. 8 → `gate.mode='offline'`. Иначе как
  сегодня; `catch` на `ensureOpenShift` с `kind==='unavailable'` +
  `offline_mode` + `holder_device_id IS NULL` + `getLiveShiftRow` есть →
  `openServerSession` → `gate.mode='offline'`; нет смены → пробросить.
- `fiscalizeSaleOffline(gate, sale)`: `openDocument(mode='offline', …)` →
  `stampNext` → UPDATE строки штампом → `FiscalView`. Провайдер **не
  вызывается**.
- Роут: `gate.mode==='offline'` → `fiscalizeSaleOffline`; новые `kind` →
  503 `{ error: 'fiscal_unavailable', code: 'fiscal_replaying' | 'offline_limit' |
  'shift_deadline' | 'offline_session_open' }` (форма ответа не меняется —
  касса уже умеет 503 с `code`). Возврат/служебный чек при живой сессии → 503
  `offline_session_open`.
- `FiscalErrorKind` + `replaying`, `offline_limit`, `shift_deadline`,
  `offline_session_open` (все терминальные, гейтовые, `mayExistAtProvider=false`).
- Тесты в `pos.fiscal.checkout.test.ts` (или новый `…offline.checkout.test.ts`):
  `queueError('unavailable')` + `offline_mode` + открытая смена → 201, в ответе
  `mode:'offline'`, `fiscal_number` = код из пула, `control_number:null`;
  сессия `open/server`; вторая продажа → `seq 2`, провайдер не дёргался
  (счётчик вызовов фейка); без смены → 503 `fiscal_unavailable`; держатель —
  касса → 503 как сегодня (не открываем серверную сессию); возврат при сессии →
  503 `offline_session_open`; провайдер ожил, сессия `open` → всё ещё штамп;
  сессия `replaying` → 503 `fiscal_unavailable` / `code: 'replaying'`; 36h/24h гейты (с подменой
  `started_at`/`opened_at` в БД).

**Шаг 3 — реплей** (`src/pos/fiscal/offline/replay.ts`, `fiscal.service.ts`, `pool.ts`)
- `replayServerSessions({ signal }): Promise<ReplayResult>` — вызывается из
  `retryPendingFiscalDocs` **до** плоского цикла, под тем же `retryRunning`.
  Для каждой сессии `open/replaying` с `holder='server'`:
  0. `backgroundGate`-подобный контекст без `ensureOpenShift`; проба
     `provider.offline.registerState(callCtx)` — `unavailable` → пропустить
     (провайдер всё ещё лежит), сессию не трогать;
  1. `refillOfflineCodes(ctx, signal)` — пересинк пула (Checkbox мог сам уйти в
     офлайн и потратить коды; `used`/`leased` не трогает);
  2. `open` → `replaying`; если `go_offline_tx_id IS NULL`: проверить
     `started_at ≥ max(done_at) WHERE mode='online'` (иначе `stuck`,
     `error_code='go_offline_order'`, ничего не отправлять) → `goOffline(ctx,
     started_at, go_offline_code)` → сохранить `go_offline_tx_id`
     (идемпотентность при падении между вызовом и записью — `registerState`:
     если `offlineMode` уже `true`, считаем сделанным);
  3. `listSessionDocuments` со `status='pending'` по `offline_seq` →
     `runDocument(gate, row, cc => provider.offline.registerSaleOffline(cc, doc,
     { fiscalCode, fiscalDate, previousDocId }), 'background')`; `done` →
     `markDone` пишет `control_number`/`qr`; `rejected` → `markAbandoned` +
     продолжить; `unavailable`/таймаут → прервать проход, сессия остаётся
     `replaying`, следующий тик продолжит с той же строки;
  4. очередь пуста → `goOnline` (не чаще 1 раза в 2 мин: `last_go_online_at`
     — новая колонка миграцией 028 или хранить в `error_message`? — **колонка**),
     затем `registerState().offlineMode === false` → `closed`, `ended_at`,
     `refillOfflineCodes`; иначе ждать следующего тика.
- `ReplayResult { sessions, replayed, abandoned, closed, stuck }` → в лог крона.
- Фейк: `FakeOfflineOps` + `goOffline` записывает `(at, code)`, `goOnline`
  переводит `offlineMode=false` через N опросов (настраиваемо), `registerState`.
- Тесты `pos.fiscal.offline.replay.test.ts`: полный цикл (2 продажи → реплей →
  `goOffline` один раз с `started_at`/кодом → документы в порядке `seq` →
  `goOnline` → `closed`, `control_number` записан, `retry` не трогал офлайн-
  строки); провайдер упал на втором документе → сессия `replaying`, первый
  `done`, повторный тик доводит без второго `goOffline`; `rejected` → второй
  документ `abandoned`, третий `done`; `started_at` раньше последней онлайн-
  транзакции → `stuck`; `duplicate` → `resolveDuplicate`; `goOnline` не чаще
  1/2 мин.

**Шаг 4 — смены и статус** (`shifts.service.ts`, `offline/status.ts`)
- `closeShift` (ручное) при живой сессии → 409 `offline_session_open`
  (`closeDueShifts` уже пропускает — тест есть).
- `GET /fiscal/status.offline.session` уже читает сессию — добавить
  `holder`, `seq`, `pending`, `error_code`; список внимания (`listAttentionDocs`)
  + `stuck`-сессии.
- Тесты: `pos.fiscal.shifts.test.ts` (409), `pos.fiscal.test-connection`/status.

**Шаг 5 — клиент и доки**
- `pos/`: `FiscalView.mode`/nullable `control_number` в типах; `CheckoutModal`
  и `ReceiptPrintable` при `mode==='offline'` — экран успеха с пометкой
  «офлайн: контрольне число буде після синку», чек без QR (полноценный UI —
  фаза 4). Проверить, что `fiscal.status==='pending'` не падает в рендер как
  ошибка.
- `POS_FISCAL_PRRO.md` §8 «Матрица отказов» — новые строки:

| Ситуация | Продажа | Ответ кассе |
|---|---|---|
| Провайдер недоступен, `offline_mode`, смена открыта онлайн, держатель не касса | `completed`, реестр `pending` / `mode='offline'` со штампом | 201, `fiscal.mode='offline'`, без контрольного числа и QR |
| Провайдер недоступен, `offline_mode`, живой смены нет | **не создана** | 503 `fiscal_unavailable` (v1: смена открывается только онлайн) |
| Сессия `open`, провайдер уже доступен | как выше — штамп до реплея | 201, `mode='offline'` |
| Сессия `replaying` | **не создана** | 503 `fiscal_unavailable` / `code: 'replaying'` |
| Сессия старше 36 ч − 30 мин / смена старше 24 ч − 15 мин | **не создана**, сессия `stuck` | 503 `offline_limit` / `shift_deadline` |
| Возврат или служебный чек при живой сессии | **не создан** | 503 `offline_session_open` |
| Реплей: `go-offline` отклонён (порядок дат) | документы остаются `pending` | сессия `stuck`, список внимания, ничего не отправлено |
| Реплей: офлайн-документ `rejected` | `completed`, реестр `abandoned` — **не отменяется** | список внимания; цепочка продолжается |
| Реплей: `unavailable`/таймаут посреди сессии | `done` до точки обрыва, остальное `pending` | сессия `replaying`, следующий тик продолжает |

- `POS_FISCAL_PRRO.md` «Что уже лежит в репозитории (фаза 8б, шаг 2)» — таблица
  файлов; этот док — строка фазы 2 в таблице фаз → ✅; `CLAUDE.md` — абзац про
  офлайн («Offline selling and replay (phases 2–3) are not built yet» → фаза 2
  есть, 3 нет).

### Файлы

Новые: `src/pos/fiscal/offline/{session,replay}.ts`, `migrations/028_pos_fiscal_offline_replay.sql`
(`pos_offline_session_opens.last_go_online_at`, `go_offline_tx_id` уже есть),
`src/__tests__/pos.fiscal.offline.{session,replay}.test.ts`.
Правки: `fiscal.service.ts`, `ledger.ts`, `types.ts`, `errors.ts`, `offline/pool.ts`
(`CodeMark` с `receiptId: null`), `offline/status.ts`, `shifts.service.ts`,
`routes/checkout.routes.ts`, `routes/fiscal.routes.ts` (служебный чек),
`src/pos/migrations.ts`, `helpers/fake-fiscal-provider.ts`, `pos/src/types.ts`,
`pos/src/components/cashier/CheckoutModal.tsx`, доки.

### Проверка фазы

`npm run typecheck && npm run lint && npx vitest run src/__tests__/pos.fiscal.*.test.ts`
на локальном Postgres; затем на песочнице Checkbox (после фазы 0): включить
`offline_mode` тестовому магазину, оборвать сеть до `api.checkbox.in.ua` с
бэкенда (hosts/файрвол), продать 2 чека через веб-кассу → 201 с
`mode:'offline'`, вернуть сеть → в течение 2–4 мин сессия `closed`, оба чека в
кабинете Checkbox с теми же фискальными номерами и контрольными числами,
`GET /fiscal/status.offline.session === null`.

## План исполнения фазы 4 — UI офлайн-режима

Написан 2026-09-11 по коду после фазы 2 (`main` @ 5c733af). Оценка — 4 дня.
Ветка `claude/gallant-planck-sow9ce`.

### Цель и граница

Фазы 1–2 целиком серверные: включить офлайн-режим сегодня можно **только
запросом к API**, а замок регистратора (409 `register_held`) кассир видит как
непонятную ошибку на оплате. Фаза 4 показывает владельцу и кассиру то, что
бэкенд уже умеет. Серверного кода фаза не трогает вовсе: все нужные поля уже
отдают `GET /fiscal/status`, `GET /fiscal/attention` и `GET`/`PATCH
/fiscal/settings`.

В фазу 4 **не входит**: аренда кодов кассе и офлайн-продажа на самой кассе
(фаза 3), бумажный офлайн-чек и правка политики автопечати (зависит от вопроса
1 к поддержке Checkbox, см. «Открытые вопросы»), офлайн-открытие/закрытие
смены и офлайн-возвраты (v2, §7), гейты 36 ч / 24 ч на клиенте (фаза 5).

### Что дали фазы 1–2 и на что опираемся

| Что | Где |
|---|---|
| `GET /fiscal/status` + блоки `offline {capable, enabled, codes_target, codes {free, leased, used} \| null, session \| null}` и `holder {device_id, name, since, last_seen_at, stale, is_me, handover_request} \| null` | `src/pos/fiscal/offline/status.ts`, роут `fiscal.routes.ts:166` |
| `OfflineSessionView` — `status: open \| replaying \| closed \| stuck`, `started_at`, `go_offline_sent`, `last_go_online_at`, `documents` (счётчики), `error_code/message` | `offline/status.ts:18` |
| `GET /fiscal/attention` → `{ documents, sessions }`, где `sessions` — застрявшие (`stuck`) сессии | `fiscal.routes.ts:366` |
| `POST /fiscal/register/{claim,release,handover/request,handover/confirm,handover/force}` с кодами 200/202/400/409 из §3а | `fiscal.routes.ts:184-292` |
| `offline_mode`, `offline_codes_target`, `offline_capable` уже **отдаются** в `FiscalSettingsView` и **принимаются** в `PATCH /fiscal/settings` | `settings.service.ts:149-161, 288-334` |
| Правила, которые UI обязан только показать, а не повторять: провайдер без capability, `enabled: false`, живая сессия при выключении, границы запаса 50…2000 (по умолчанию 200) | `settings.service.ts:288-334`, `fiscal/types.ts:80-82` |
| Заголовок `X-POS-Device-ID` шлёт **только десктоп-касса** (`api.setDeviceId` из офлайн-рантайма); веб-шелл не шлёт | `pos/src/offline/sync.ts:188` |
| Число неотправленных чеков для `handover/confirm` доступно модулю: `useOfflineStatus` есть в барреле `@pos/platform` | `pos/src/platform/surface.snapshot.json` |

### Решения, которых нет в §3а (фиксируем здесь)

1. **Тумблер офлайна — в хосте (`FiscalSettingsCard`), не в бандле провайдера.**
   Ровно та же причина, что у `enabled`/`provider` (§«Тумблер живёт в хосте» в
   родителе): бандл на вебе может не загрузиться **молча**, и тогда владелец
   магазина с включённым офлайном не сможет его выключить. Поле видно только
   при `offline_capable` — у `vchasno`/`echeck` его нет вовсе, а не «выключено».
2. **Экраны держателя — в бандле (`/fiscal`), кроме текста на оплате.** Замок
   осмыслен только при включённом офлайне, то есть у capable-провайдера, у
   которого бандл по определению есть. Исключение — 409 `register_held` на
   чекауте: это хост (`RegisterPage` → `classifyCheckoutError`), и он даёт
   только текст «Каса зайнята пристроєм X» + ссылку на «Зміна ПРРО»; кнопки —
   там.
3. **Веб-шелл — режим чтения.** Он не шлёт `X-POS-Device-ID`, поэтому
   `holder.is_me` у него всегда `false`, а `claim`/`release`/`handover` ответят
   400 `device_id_required`. Значит на вебе показываем строку «Каса зайнята
   пристроєм A з 09:12» без кнопок; единственное действие веба — «Забрати
   примусово» у владельца на `/admin/fiscal` (`handover/force` — единственный
   роут группы, которому заголовок не нужен).
4. **Политика автопечати не меняется.** Офлайн-чек лежит как
   `fiscal_status='pending'`, и `RegisterPage:176-182` его не печатает
   автоматически. Это правильное поведение **до** ответа на вопрос 1: пока не
   известно, допустим ли бумажный чек без контрольного числа, менять печать
   нельзя. Фаза 4 только объясняет кассиру, что произошло.
5. **`PLATFORM_VERSION` не бампаем.** Всё новое — либо типы (стираются), либо
   код внутри хоста и модулей; ни одного нового рантайм-экспорта из
   `@pos/platform`. `surface.test.ts` сравнивает только имена экспортов, так
   что он останется зелёным — и это именно тот случай, когда бамп не нужен.

### Шаги (в этом порядке, каждый с тестами)

**Шаг 1 — типы и обёртки API** (без UI, чтобы дальше всё было типизировано)
- `pos/src/types.ts`: `FiscalSettingsView` += `offline_mode: boolean`,
  `offline_codes_target: number`, `offline_capable: boolean`;
  `FiscalSettingsPatch` += `offline_mode?`, `offline_codes_target?`.
- `pos/src/modules/fiscal-core/types.ts`: `FiscalStatus` += `offline`/`holder`
  (зеркало `OfflineStatusBlock` / `HolderStatusBlock` / `OfflineSessionView`
  поле в поле, как это уже сделано для остальных ответов);
  `listFiscalAttention` → `{ documents: AttentionDoc[]; sessions: OfflineSessionView[] }`.
- `fiscal-core/data/fiscalApi.ts`: `claimRegister`, `releaseRegister`,
  `requestHandover`, `confirmHandover(outboxPending)`, `forceHandover(deviceId?)`
  через `posRequest` — как остальные роуты этого файла.
- Тест: отдельного не нужно, проверка — `tsc` и зелёные существующие тесты.

**Шаг 2 — тумблер и запас в хосте** (`pos/src/pages/admin/FiscalSettingsCard.tsx`)
- Блок «Офлайн-режим ПРРО» после «Друк чека», рендерится только при
  `settings.offline_capable`: чекбокс + числовое поле «Запас фіскальних кодів»
  (50…2000, шаг 50) + пояснение «Каса продовжує продавати без зв'язку з ПРРО;
  чеки надсилаються в ДПС після відновлення».
- Поля уходят в тот же `api.updateFiscalSettings`. Ошибку 400 рисовать нечем
  новым — `errorText()` уже показывает `response.data.error`, а бэкенд кладёт
  туда готовый украинский текст («Триває офлайн-сесія — дочекайтесь…»,
  «Увімкніть фіскалізацію перед офлайн-режимом»).
- Тесты в существующий `FiscalSettingsCard.test.tsx`: блока нет при
  `offline_capable: false`; включение шлёт `offline_mode: true` и
  `offline_codes_target`; текст 400 из `data.error` виден на экране.

**Шаг 3 — панель офлайна на `/fiscal`** (`fiscal-core/components/OfflinePanel.tsx`)
- Рендерит `status.offline`: «Офлайн-резерв: N кодів» (`codes.free`, жёлтым при
  `free < codes_target / 4`), под ним — сессия, если есть:
  - `open` → «Працюємо офлайн з 14:02 · чеків: 7 · зв'язок відновиться
    автоматично»;
  - `replaying` → «Надсилаємо чеки в ДПС… 7 з 9» (`documents` + `go_offline_sent`);
  - `stuck` → красная карточка с `error_message` и «Зверніться до власника».
- Нет `offline.enabled` → панель не рендерится вовсе (магазин без офлайна
  выглядит ровно как раньше — то же правило, что у `FiscalBadge` с `'none'`).
- Тест `OfflinePanel.test.tsx`: четыре состояния + невидимость при выключенном.

**Шаг 4 — экраны держателя** (`fiscal-core/components/HolderPanel.tsx`)
- Три состояния из `status.holder`: `null` (свободна — на кассе кнопка «Зайняти
  касу» → `claim`, на вебе ничего), `is_me` (строка «Ця каса — активна» +
  «Звільнити», 409 `session_open` показываем текстом), чужой держатель
  («Каса зайнята пристроєм A з 09:12», `stale` → «немає зв'язку 6 хв»; на кассе
  кнопка «Запросити передачу» → 202 `requested`).
- У держателя при `handover_request` — баннер «Пристрій B просить передати
  касу» + «Передати», который шлёт `outbox_pending` из
  `useOfflineStatus((s) => s.pending)`; 409 `handover_blocked` рисуем по
  `reason` (`outbox_pending` → «Спершу синхронізуйте чеки», `session_open` →
  «Дочекайтесь синхронізації ПРРО»).
- Веб (нет `X-POS-Device-ID`) — все кнопки скрыты, а не выключены: жать их
  бессмысленно, ответ будет 400 `device_id_required`. Признак — хост-шелл
  (`usePosShell() === 'web'` (есть в барреле)), а не отсутствие `holder`.
- Тест `HolderPanel.test.tsx`: три состояния × два шелла, `stale`, запрос
  передачи, `handover_blocked` обоих видов.

**Шаг 5 — владелец: принудительная передача и `stuck`-сессии**
(`fiscal-checkbox/pages/CheckboxAdminPage.tsx`)
- В карточку списка внимания добавить `sessions` из того же ответа: «Офлайн-сесія
  #12 зупинена: <error_message>, чеків: N» — без кнопок (разбор у провайдера).
- Блок «Каса ПРРО»: кто держит регистратор, и «Забрати примусово» с
  подтверждением (`handover/force`); в ответе — `stuck_sessions`, `burned_codes`,
  их показать как итог: «Касу звільнено. Зупинено сесій: 1, згорілих кодів: 12».
- Тесты в существующий `CheckboxAdminPage.test.tsx`.

**Шаг 6 — объяснения на чекауте и в чеках** (хост)
- `pos/src/lib/checkoutError.ts`: новый исход `register_held` (409,
  `body.error === 'register_held'`, плюс `holder` из тела), `keepsModalOpen` —
  да, `keepsCart` — да. Текст: «Касу ПРРО займає пристрій A. Передайте касу на
  екрані «Зміна ПРРО»».
- `pos/src/modules/returns/components/FiscalBadge.tsx`: `FiscalDetailCard` при
  `doc.mode === 'offline' && doc.status === 'pending'` вместо «Реєструється в
  ПРРО…» рисует «Чек з офлайн-резерву · <fiscal_code> · буде надіслано в ДПС
  після відновлення зв'язку». `FiscalBadge` для той же пары — «ПРРО: офлайн»
  (янтарный), чтобы в списке чеков офлайн-чек не путали с зависшим.
- `OfflineStatusBanner` — **не трогаем**: он про офлайн самой кассы (сеть до
  нашего API), а случай B — это провайдер, касса при этом онлайн. Строка про
  офлайн ПРРО живёт в `OfflinePanel`; смешивать два разных «офлайна» в одном
  баннере — прямой путь к неверному решению кассира.
- Тесты: `checkoutError.test.ts` (+1 кейс), `FiscalBadge.test.tsx`.

### Файлы

Новые: `pos/src/modules/fiscal-core/components/{OfflinePanel,HolderPanel}.tsx`
+ их тесты.
Правки: `pos/src/types.ts`, `pos/src/modules/fiscal-core/{types.ts,data/fiscalApi.ts}`,
`pos/src/modules/fiscal-checkbox/pages/{CheckboxTillPage,CheckboxAdminPage}.tsx`
(+ тесты), `pos/src/pages/admin/FiscalSettingsCard.tsx` (+ тест),
`pos/src/lib/checkoutError.ts` (+ тест),
`pos/src/modules/returns/components/FiscalBadge.tsx` (+ тест), доки
(этот файл, `POS_FISCAL_PRRO.md`, `CLAUDE.md`).
Бэкенд — без изменений.

### Что получилось (2026-09-11)

Все шесть шагов сделаны, бэкенд не тронут. Два отличия от плана, оба
осознанные:

1. **В списке чеков офлайн-чек по-прежнему «ПРРО: реєструється».** `mode`
   лежит на документе (`SaleDetail.fiscal`), а строки списка
   (`SaleListItem`) несут только проекцию `fiscal_status` — показать «офлайн»
   в списке значило бы добавить поле в серверную проекцию, а фаза 4 заявлена
   как «без бэкенда». Настоящий текст — на карточке чека, в одном касании.
2. **Из модального окна оплаты нет кнопки на «Зміна ПРРО».** Этот маршрут
   принадлежит бандлу провайдера и не существует, пока бандл не загружен;
   кнопка вела бы на 404. Вместо неё в тексте названо, где передать кассу, и
   какое устройство её держит.

### Проверка фазы

`cd pos && npm run lint && npm test && npm run test:coverage` (гейт покрытия
считает только платформу модулей и чистые хелперы — новые компоненты в него не
попадают, но их тесты всё равно обязательны) и `npm run build` — чтобы
`fiscal-checkbox` собрался как отдельный бандл. Затем вручную на вебе:
магазину с `checkbox` включить офлайн-режим в «Налаштування» → на `/fiscal`
появляется «Офлайн-резерв: N кодів»; оборвать сеть до провайдера с бэкенда,
продать чек → на чеке бейдж «ПРРО: офлайн» и номер, на `/fiscal` — «Працюємо
офлайн з …»; вернуть сеть → «Надсилаємо чеки в ДПС…» и затем пусто. На
десктоп-кассе дополнительно: вторая касса видит «Каса зайнята», запрашивает
передачу, первая подтверждает.

## Печать офлайн-чека (сделано 2026-09-11, не зависит от транспорта)

Фискальный блок нашего макета печатался только при `status='done'`, поэтому
офлайн-чек уходил на бумагу как обычный товарный — без фискального номера и
без отметки. Исправлено при любом варианте случая C:

- `GET /sales/:id` отдаёт `mode` и `control_number` (были в таблице с
  миграции 027, но не в проекции — переоткрытый офлайн-чек выглядел как
  обычный `pending`);
- `buildReceiptPayload` строит блок и для офлайн-документа: номер, дата,
  `offline: true`, контрольное число когда есть;
- ESC/POS-макет (`pos/src-tauri/src/hardware/receipt.rs`) печатает «ОФЛАЙН»
  и «Контрольне число», а при отсутствии `tax_url` — строку «QR буде після
  синхронізації з ПРРО». Эта ветка осталась только для чеков магазина, у
  которого ФН ПРРО ещё не прочитан: **ссылку мы теперь собираем сами** (ниже);
- автопечать решает по `fiscalBlockComplete`: `done` — да; офлайн — только
  когда пришло контрольное число. Неполный чек печатается по кнопке, чтобы
  кассир понимал, что отдаёт.

## Свой налоговый QR на офлайн-чеке (сделано 2026-09-11)

Офлайн-чек получает настоящую ссылку проверки **в момент штампа**, а не после
реплея. Ссылка целиком наша: `id` — код из резерва, `date`/`time` — фискальная
дата в киевском времени, `sm` — сумма, `fn` — ФН ПРРО. `mac` не нужен —
проверено реальным чеком магазина.

- `src/pos/fiscal/taxUrl.ts` — чистая функция сборки; часовой пояс через
  `Intl` (`Europe/Kyiv`), чтобы перевод часов не жил в нашем коде; сумма
  возврата берётся по модулю; без ФН возвращает `null`.
- ФН ПРРО кэшируется в `pos_fiscal_settings.register_fiscal_number`
  (миграция 029). Читается там, где мы и так онлайн и уже говорим с
  провайдером: крон пополнения пула (**один** раз, пока не закэширован) и
  проба реплея. Офлайн спросить его не у кого — в этом вся причина кэша.
- `stampNext` собирает ссылку в той же транзакции, что берёт код, и кладёт её
  в реестр; `offlineView` и `GET /sales/:id` её отдают; реплей затирает её
  ссылкой провайдера (с `mac`) — обе указывают на один документ.
- Кабинет ДПС найдёт чек только после доставки. Это нормально и так же
  работает у Checkbox Kasa; на бумаге рядом с QR стоит «ОФЛАЙН».

Чего нет на бумаге в момент продажи — **контрольного числа**: его считает
ПРРО (Checkbox) из секретного числа сессии и хеша предыдущего документа, см.
«Открытые вопросы». До реплея оно не существует; автопечать офлайн-чека
без него выключена (`fiscalBlockComplete`), кнопка печати работает.

## Решение 2026-09-12: облачный путь; Kasa — отложено

**Делаем облачный путь** — тот, что построен фазами 1–2 и 4: сервер и
веб-шелл говорят с облачным API Checkbox; при потере связи с провайдером чек
создаём сами с кодом из резерва (`ask-offline-codes` → `sell-offline` →
`go-online` — штатная модель Checkbox для «зовнішньої системи», см.
`checkbox-api/openapi-2.106.4.json`, описание `sell-offline`); реквизиты ПРРО
(контрольное число, `tax_url` с `mac`) приходят после синхронизации и
дописываются в реестр.

**Checkbox Kasa (локальный ПРРО на ПК кассы, Kasa Manager 0.4.x) — отложено.**
Причина: это отдельная архитектура — касса говорит с `localhost`, фискальный
клиент переезжает в Tauri, сервер принимает результат со слов кассы, установка
на каждую машину, только Windows. Штатный облачный путь покрывает случай B
целиком и случай C в модели Checkbox для интеграторов. **Вернуться к Kasa,
когда всё по облачному пути дописано** — если ответ Checkbox по бумажному
офлайн-чеку окажется «интегратор так печатать не может».

**Открытый вопрос — один:** что печатать на бумаге в момент офлайн-продажи по
облачной модели, если контрольное число и `mac` приходят только в ответе
`sell-offline`. Письмо в поддержку Checkbox (формулировка в «Открытых
вопросах»). До ответа печатаем **всё, что у нас есть** — на онлайн- и
офлайн-чеке — и всё, что можно забрать у Checkbox при первом онлайне.
Владелец осознанно принимает, что до ответа офлайн-чек на бумаге может быть
неполным по рядкам 32/29 Положення: работа ведётся на демо-аккаунте, цель —
проверить, как модель работает; ответственность за это решение — на
владельце.

## Фаза 8в — реквизиты из Checkbox и полный макет чека

Написана 2026-09-12 по коду после PR #75 (`main` @ 3f6b4c9 + ветка). Оценка —
3 дня. Цель: **не заставлять владельца ничего вводить** — юр. реквизиты,
ФН ПРРО, буквы и ставки ПДВ забираем у Checkbox онлайн, кэшируем, печатаем на
каждом фискальном чеке по п. 2 розділу II Положення № 13; в админке пока
секция «показать что есть», редактирование — потом.

Что даёт API Checkbox (по `openapi-2.106.4.json`):

| Что | Откуда | Рядок Положення |
|---|---|---|
| ФН ПРРО, назва каси, адреса | `GET /cash-registers/info` → `fiscal_number`, `title`, `address` | 34, 2, 3 |
| Організація: назва, ЄДРПОУ, ІПН, платник ПДВ | `GET /cash-registers/{id}` → `branch.organization.{title, edrpou, tax_number, is_vat}`; торгова точка `branch.{name, address}` | 1, 4/5, 2, 3 |
| Ставки: буква, ставка, назва, `no_vat`, `is_default` | `GET /tax` | 11, 21 |
| Суми ПДВ по чеку (онлайн) | `ReceiptModel.taxes[]` в ответе на продажу | 21 |

### Решения

1. **Реквизиты — провайдерская способность, кэш — в `pos_fiscal_settings`.**
   `FiscalProvider.fetchRequisites(ctx) → FiscalRequisites` (провайдеро-нейтральный
   тип: `organization {name, edrpou, tax_number, is_vat}`, `point {name,
   address}`, `register {fiscal_number, title}`, `taxes[] {symbol, label, rate,
   no_vat, is_default}`). Хранится как JSONB `requisites` +
   `requisites_fetched_at` (миграция 030): один блок, одна дата, редактирование
   владельцем потом — поверх, отдельными полями.
2. **Когда тянуть:** (а) `POST /fiscal/test-connection` — владелец нажимает при
   настройке; (б) открытие смены — ежедневно и заведомо онлайн; (в) пополнение
   пула — уже читает `registerState`. Правило: тянуть, если нет или старше
   24 ч; ошибка — только лог, ничего не блокирует.
3. **Кассе реквизиты приезжают в `auth.store.fiscal.requisites`** (публичный
   блок настроек). Десктоп кэширует auth — значит печать без сети работает.
   Никаких запросов с кассы за реквизитами.
4. **Первый чек аккаунта — только онлайн.** Офлайн-штамп (`preflight`, ветка
   сессии) требует закэшированных реквизитов, иначе `unavailable` как раньше:
   без них нечего печатать в шапке.
5. **Макет печатает всё по п. 2, что у нас есть**, в порядке рядков:
   найменування СГ (рядок 1), назва та адреса точки (2, 3), «ПН …» або «ІД …»
   (4/5); позиции с буквой ставки (11); «СУМА» (20), «ПДВ» по буквам (21) —
   считаем из ставок, «ДО СПЛАТИ» (24), «РЕШТА» для готівки (25); форма оплати
   «ГОТІВКА» / «БЕЗГОТІВКОВА» (18); «ЧЕК №» (26); дата й час (27); QR (29);
   «ОНЛАЙН» / «ОФЛАЙН» (31); «Контрольне число» когда есть (32); «ФН ПРРО»
   (34); «ФІСКАЛЬНИЙ ЧЕК» + «ПРРО Checkbox» как виробник (35). `store_name`
   остаётся торговой вывеской над всем.
6. **`receipt_source='provider'` не трогаем** — текст Checkbox по-прежнему
   печатается как есть, когда он пришёл; наш макет — для офлайн-чеков и для
   `'local'`.

### Шаги (каждый с тестами)

**Шаг 1 — бэкенд: тип, контракт, кэш, точки загрузки.**
`fiscal/types.ts` — `FiscalRequisites`, `FiscalProvider.fetchRequisites`;
`providers/checkbox/{client,index}.ts` — три запроса → один блок;
`helpers/fake-fiscal-provider.ts` — фейковые реквизиты; миграция 030;
`settings.service.ts` — `rememberRequisites`, поле в `FiscalSettingsView`
и в `FiscalPublicConfig`; вызовы из `test-connection`, `openShift`
(`shifts.service.ts`), `refillOfflineCodes`. Тесты: `pos.fiscal.requisites.test.ts`
(кэш, TTL, ошибка не блокирует, публичный блок в auth), правка
`pos.fiscal.test-connection.test.ts`.

**Шаг 2 — гейт «первый чек только онлайн».** `preflight`: офлайн-штамп без
`requisites` → `unavailable` с сообщением «Спершу проведіть один чек онлайн».
Тест в `pos.fiscal.offline.checkout.test.ts`.

**Шаг 3 — клиент: типы и секция в админке.** `pos/src/types.ts`;
`FiscalSettingsCard` — секция «Реквізити ПРРО» (read-only: організація,
ЄДРПОУ/ІПН, точка, адреса, ФН ПРРО, ставки) + кнопка «Оновити з ПРРО»
(вызывает `test-connection`) + «нет реквизитов — проведіть чек онлайн».
Тест в `FiscalSettingsCard.test.tsx`.

**Шаг 4 — макет.** `pos/src/lib/{printer,receipt}.ts` — `ReceiptData` +=
`fiscal_header`, `fiscal.register_fiscal_number`, `fiscal.mode`, буквы
ставок у позиций, `vat_lines[]`, `change_cents`; `buildReceiptPayload`
получает `auth.store.fiscal`; `src-tauri/src/hardware/receipt.rs` и
`ReceiptPrintable.tsx` — рендер по п. 5. `fiscalBlockComplete` не меняется.
Тесты: `receipt.test.ts` (шапка, буквы, ПДВ, режим), `ReceiptPrintable`.

**Шаг 5 — доки.** Этот файл (статус), `POS_FISCAL_PRRO.md` (таблица),
`CLAUDE.md`, `POS_FISCAL_CHECKBOX_SETUP.md` (что теперь заполняется само).

### Файлы

Новые: `migrations/030_pos_fiscal_requisites.sql`, `src/__tests__/pos.fiscal.requisites.test.ts`.
Правки: `src/pos/fiscal/{types,settings.service,shifts.service,fiscal.service}.ts`,
`src/pos/fiscal/offline/pool.ts`, `src/pos/fiscal/providers/checkbox/{client,index}.ts`,
`src/pos/routes/fiscal.routes.ts`, `src/pos/auth.service.ts`, `src/pos/types.ts`,
`src/__tests__/helpers/fake-fiscal-provider.ts`, `pos/src/types.ts`,
`pos/src/pages/admin/FiscalSettingsCard.tsx`, `pos/src/lib/{printer,receipt}.ts`,
`pos/src/pages/register/RegisterPage.tsx`, `pos/src/components/ReceiptPrintable.tsx`,
`pos/src-tauri/src/hardware/receipt.rs`, доки.

## Реквизиты чека ПРРО по Положенню № 13 — сверка с нашим макетом (2026-09-12)

Первоисточник — снимок `dps-prro-api/polozhennya-13.md`, розділ II п. 2
(ред. 11.01.2025). Здесь только то, что касается **любого** чека ПРРО и
офлайна; ситуативные рядки (УКТ ЗЕД, акциз, РПД, ЕПЗ при карточной оплате
через интегрированный терминал) не сверялись.

Два прямых ответа из текста:

1. **Позначка режиму и контрольное число — в одной фразе, оба обязательны:**
   «для фіскального чека, що створюється ПРРО: позначку щодо режиму роботи
   (офлайн/онлайн), в якому створений фіскальний чек (рядок 31), контрольне
   число, сформоване в режимі офлайн (рядок 32)». Отметка нужна на **каждом**
   чеке ПРРО («онлайн» тоже), контрольное число — на офлайн-чеке.
2. **QR офлайн-чека включает `mac`:** формат рядка 29 —
   `…/check?mac=ABCD…&date=yyyyMMdd&time=HHmm&id=NNNN…&sm=…&fn=…`, где «MAC
   (hash) зазначається лише для чеків, створених ПРРО в режимі офлайн». Для
   онлайн-чека `mac` отсутствует (реальный чек магазина это и показывает);
   для офлайн-чека он часть формата.

Оба офлайн-реквизита — контрольное число и `mac` — формирует ПРРО из
секретного числа сессии и цепочки документов (`fiscal-server-api.md`). У нас
над облачным API Checkbox их нет до `sell-offline`. **Вывод: бумажный
офлайн-чек, напечатанный до синхронизации, не содержит двух обязательных
реквизитов**, и никакой ответ поддержки этого не изменит — это текст
Положення. Полный офлайн-чек в момент продажи печатает только тот, кто
ведёт офлайн-сессию ДПС на самой кассе: Checkbox Kasa или свой ПРРО.

### Наш макет `receipt_source='local'` — построчно

| Рядок | Реквизит | У нас (`receipt.rs`) | Итог |
|---|---|---|---|
| 1 | найменування СГ | `store_name` (торговое название магазина, не юрлицо) | ⚠ не то поле |
| 2 | назва господарської одиниці (як у 20-ОПП) | нет | ✗ |
| 3 | адреса господарської одиниці | нет | ✗ |
| 4/5 | «ПН» ІПН платника ПДВ / «ІД» податковий номер | нет (в магазине есть только `qr_edrpou` для QR-оплаты) | ✗ |
| 6 | кількість × ціна одиниці | `qty x price` | ✓ |
| 11 | назва товару, вартість, **літерне позначення ставки ПДВ** | назва + вартість; буквы ставки нет (есть `default_tax_code`, уходит только провайдеру) | ⚠ |
| 18 | форма оплати «ГОТІВКА» / «БЕЗГОТІВКОВА» / «ІНШЕ», сума, валюта | «Готівка» / «Картка» / «QR-код», без валюты | ⚠ формулировки |
| 20 | «СУМА» або «УСЬОГО» | «РАЗОМ» | ⚠ формулировка |
| 21 | рядок «ПДВ» для платників ПДВ | нет | ✗ (для платников) |
| 23–25 | заокруглення / до сплати, валюта / решта | нет | ✗ |
| 26 | «ЧЕК №» + фіскальний номер | «ФН чека …» | ⚠ префикс |
| 27 | дата та час (гг:хх:сс) | `fiscal_date` локально | ✓ |
| 29 | QR по формату | наш при офлайне без `mac`; при онлайне — `tax_url` провайдера | ✓ онлайн / ⚠ офлайн |
| 31 | позначка режиму офлайн/**онлайн** | «ОФЛАЙН» есть; для онлайн-чека отметки нет | ⚠ |
| 32 | контрольне число (офлайн) | печатается, когда пришло с реплеем; в момент продажи его нет | ✗ до реплея |
| 34 | «ФН ПРРО» + фіскальний номер ПРРО | **нет вообще** (номер с 2026-09-11 закэширован, но не печатается) | ✗ |
| 35 | напис «ФІСКАЛЬНИЙ ЧЕК» + найменування/логотип виробника | «Фіскальний чек» строчными, виробника нет | ⚠ |

Итог честный и неприятный: **наш локальный макет не соответствует Положенню
даже для онлайн-чека** — не хватает юридических реквизитов магазина (2, 3,
4/5), «ФН ПРРО» (34), букв ПДВ (11, 21) и нескольких обязательных
формулировок. Текст чека от провайдера (`receipt_source='provider'`) эти
реквизиты содержит — Checkbox печатает по Положенню. Значит для
фискализирующего магазина сегодня безопасен только `'provider'`, а офлайн-чек
(у которого текста провайдера нет по определению) идёт нашим макетом и
неполон дважды: как макет и как офлайн-документ.

### Что из этого следует

1. **Немедленно (без кода):** магазину с ПРРО держать `receipt_source =
   'provider'`. Вариант `'local'` до доработки — не для фискальных чеков.
2. **Фаза «8а-відповідність»** (новая, до фазы 3): довести локальный макет до
   п. 2 — юр. реквизиты магазина (новые поля `pos_stores`: назва та адреса
   господарської одиниці, ПН/ІД; форма в настройках), «ФН ПРРО» из кэша,
   «ЧЕК №», «ФІСКАЛЬНИЙ ЧЕК» + виробник, отметка режима на каждом чеке, буквы
   ПДВ у позиций и рядок «ПДВ», «СУМА/ДО СПЛАТИ/РЕШТА», «ГОТІВКА/БЕЗГОТІВКОВА».
   Без этого печать «нашего» чека фискализирующему магазину предлагать нельзя.
3. **Фаза 3 (случай C):** по решению 2026-09-12 — облачный путь, печатаем
   всё, что есть; контрольное число и QR провайдера приходят после реплея и
   идут на допечатку/е-чек. Что обязан нести бумажный чек до синка — ждём
   ответ Checkbox; Kasa — запасной путь, отложен.

## Открытые вопросы

Закрыто документацией 2026-09-10: контрольное число и `mac` формирует
Checkbox в ответе `sell-offline` (формулы нет и не нужно); `go-offline`
обязателен перед любой офлайн-операцией; формат QR-ссылки ДПС
(`id, date, time, fn, sm, mac`) виден в примере; `previous_receipt_id` —
опциональный контроль последовательности, передаём предыдущий `id`.

Закрыто инвариантом «один регистратор = одна касса» (§3а): чужие
онлайн-транзакции во время офлайна невозможны, порядок `go_offline_date`
выполняется сам, смену держателя никто другой не закроет; `fiscal_date` в
закрытой смене — только наша дисциплина (§6).

**Вопрос 1 закрыт 2026-09-11** — ответом Checkbox плюс их же документацией.
Форма офлайн-продажи подтверждена: коды берутся заранее, в момент продажи
налоговую не спрашивают, чек печатается сразу с отметкой «ОФЛАЙН»,
синхронизация — потом. Но вывод «делаем свой чек и не зависим от провайдера»
верен лишь наполовину, и эта половина определяет фазу 3:

- **Макет чека — наш**, и это уже так: в офлайне `receipt_source='provider'`
  неисполним (текст чека негде взять), а касса выбирает макет по наличию
  `receipt_text`, которого у офлайн-документа нет.
- **QR мы собираем сами.** ~~Считалось, что без `mac` ссылка неполная.~~
  **Ошибка, исправлена в тот же день по реальному чеку магазина:**
  `https://cabinet.tax.gov.ua/cashregs/check?date=20260907&time=1840&id=…&sm=143.5&fn=4001118166`
  проверяется **без `mac`** — кабинет ДПС ищет документ по `fn` + `id` +
  дате/времени/сумме. Все пять полей касса знает офлайн: `id` — код из
  резерва, `date`/`time` — свои часы, `sm` — сумма корзины, `fn` — ФН ПРРО
  (константа регистратора, приходит в `registerState()` и с 2026-09-11
  кэшируется в `pos_fiscal_settings.register_fiscal_number`, миграция 029). `mac` у Checkbox — это
  `transaction.previous_hash`, приятное дополнение, а не обязательный
  параметр. Пока чек не доставлен, кабинет по такому QR его не найдёт — ровно
  так же ведёт себя офлайн-чек Checkbox Kasa.
- **Контрольное число — НЕ наше, и это исправление вчерашнего исправления
  (2026-09-12, по «Опису API Фіскального Сервера» ДПС, снимок в
  `dps-prro-api/`).** У ДПС оно — хвост фискального номера офлайн-документа
  (`<офлайн-сесія>.<номер в сесії>.<контрольне число>`, например
  `82563.25.6127`) и считается как CRC32 от строки, которая начинается с
  **«секретного числа»** — `OfflineSeed`, который Сервер выдаёт ПРРО вместе с
  номером офлайн-сессии, — и заканчивается **SHA-256 предыдущего документа
  сессии**. И то, и другое есть только у ПРРО, то есть у Checkbox. Поэтому
  `control_number` формирует Checkbox в ответе `sell-offline`, а одноимённое
  необязательное поле запроса — для того, кто сам ведёт сессию (их Kasa), не
  для нас. Вчерашнее «считаем сами и передаём» — ошибка, вызванная тем, что
  пояснения ДПС в прессе описывают хеш «над датой, временем и суммой», умалчивая
  про секретное число. Полный алгоритм — только в самом документе.

Итого, что касса может напечатать **сама, без связи**: номер (код из резерва),
дату и время, сумму, ФН ПРРО, отметку «ОФЛАЙН» и QR. Чего не может —
контрольное число: оно появится после `sell-offline` (для случая B) и
хранится в реестре, откуда идёт на карточку чека и допечатку.

**Вопрос «допустим ли бумажный офлайн-чек без контрольного числа» закрыт
2026-09-12 самим Положенням № 13** (снимок `dps-prro-api/polozhennya-13.md`,
розділ II п. 2): контрольне число (рядок 32) и `mac` в QR (рядок 29) —
обязательные реквизиты офлайн-чека ПРРО. Разбор построчно — в разделе
«Реквизиты чека ПРРО по Положенню № 13» выше. Спрашивать поддержку больше не
о чем: полный офлайн-чек в момент продажи печатает только локальный ПРРО
на кассе — Checkbox Kasa или свой.

Остаётся открытым (второстепенно, к поддержке):

2. `rejected` на реплее офлайн-чека: переотправить с новым кодом или ручной
   разбор (в дизайне — список внимания).

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
