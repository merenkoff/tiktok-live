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
| **1. Capability, пул, держатель** | `FiscalOfflineOps` + `FiscalResult.controlNumber`, реализация в `providers/checkbox` (`sell-offline`, `go-offline/online`, `ask/get-offline-codes`, `info`), миграция 027 (`offline_mode`, `offline_codes_target`, `holder_*`, `handover_*`, `pos_fiscal_offline_codes`, `pos_fiscal_offline_sessions`, `pos_fiscal_receipts.mode/offline_session_id/offline_seq/control_number`), пул `offline/pool.ts` + крон `*/10` `refillAllStores`, держатель `offline/holder.ts` + роуты `register/{claim,release,handover/request|confirm|force}`, гейт в `preflight`, `X-POS-Device-ID` с кассы, `GET /fiscal/status` с `offline`/`holder`, `closeDueShifts` не трогает смену с живой сессией; песочный скрипт `npm run fiscal:sandbox:offline`; 5 новых тест-файлов | 4–5 дней | ✅ 2026-09-11 (ветка `feat/pos-fiscal-offline-phase1`) |
| **2. Серверная сессия (случай B)** | `preflight` → офлайн-выдача штампом, реестр `mode`, реплей сессии в кроне, `goOnline`; матрица отказов §8 родителя дополнена офлайн-строками | 3 дня | ⬜ |
| **3. Лизинг и касса (случай C)** | `/fiscal/offline/lease`, кеш аренды и смены в `cloth-pos-offline`, гейты, `completeSale` со штампом, `fiscal_offline` в outbox и в `POST /sales/complete`, печать «ОФЛАЙН» + QR, причины вместо одного `OfflineFiscalError` | 5–6 дней | ⬜ |
| **4. UI** | `fiscal-checkbox`: на `/fiscal` блок «Офлайн: N кодів, сесія з …, лишилось …», прогресс реплея; экраны держателя — «Каса зайнята… Запросити передачу», подтверждение у держателя, «Забрати примусово» у владельца; Settings — тумблер «Офлайн-режим» (только при `offline_capable`), размер запаса; `OfflineStatusBanner` — «Офлайн, чеки ПРРО з резерву (N)»; список внимания — `stuck`-сессии, отклонённые офлайн-документы, чеки принудительно снятой кассы | 4 дня | ⬜ |
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
- Строки `pos_fiscal_offline_sessions` никто не создаёт (только SELECT'ы и
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
2. **Сессия `replaying` → 503 `fiscal_replaying`** на новые продажи
   (секунды-минуты; следующий тик крона либо закроет сессию, либо, если
   провайдер снова упал, продолжит с того же места).
3. **Сессия открывается только при живой смене, открытой онлайн**
   (`getLiveShiftRow` есть в `pos_fiscal_shifts`) и **только если держатель не
   касса** (`holder_device_id IS NULL` — иначе это случай C, фаза 3). Нет
   смены → 503 `fiscal_unavailable`, как сегодня.
4. **Возвраты и служебные чеки при живой сессии → 503 `fiscal_offline_session`**.
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
  'shift_deadline' | 'fiscal_offline_session' }` (форма ответа не меняется —
  касса уже умеет 503 с `code`). Возврат/служебный чек при живой сессии → 503
  `fiscal_offline_session`.
- `FiscalErrorKind` + `replaying`, `offline_limit`, `shift_deadline`,
  `offline_session_open` (все терминальные, гейтовые, `mayExistAtProvider=false`).
- Тесты в `pos.fiscal.checkout.test.ts` (или новый `…offline.checkout.test.ts`):
  `queueError('unavailable')` + `offline_mode` + открытая смена → 201, в ответе
  `mode:'offline'`, `fiscal_number` = код из пула, `control_number:null`;
  сессия `open/server`; вторая продажа → `seq 2`, провайдер не дёргался
  (счётчик вызовов фейка); без смены → 503 `fiscal_unavailable`; держатель —
  касса → 503 как сегодня (не открываем серверную сессию); возврат при сессии →
  503 `fiscal_offline_session`; провайдер ожил, сессия `open` → всё ещё штамп;
  сессия `replaying` → 503 `fiscal_replaying`; 36h/24h гейты (с подменой
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
| Сессия `replaying` | **не создана** | 503 `fiscal_replaying` |
| Сессия старше 36 ч − 30 мин / смена старше 24 ч − 15 мин | **не создана**, сессия `stuck` | 503 `offline_limit` / `shift_deadline` |
| Возврат или служебный чек при живой сессии | **не создан** | 503 `fiscal_offline_session` |
| Реплей: `go-offline` отклонён (порядок дат) | документы остаются `pending` | сессия `stuck`, список внимания, ничего не отправлено |
| Реплей: офлайн-документ `rejected` | `completed`, реестр `abandoned` — **не отменяется** | список внимания; цепочка продолжается |
| Реплей: `unavailable`/таймаут посреди сессии | `done` до точки обрыва, остальное `pending` | сессия `replaying`, следующий тик продолжает |

- `POS_FISCAL_PRRO.md` «Что уже лежит в репозитории (фаза 8б, шаг 2)» — таблица
  файлов; этот док — строка фазы 2 в таблице фаз → ✅; `CLAUDE.md` — абзац про
  офлайн («Offline selling and replay (phases 2–3) are not built yet» → фаза 2
  есть, 3 нет).

### Файлы

Новые: `src/pos/fiscal/offline/{session,replay}.ts`, `migrations/028_pos_fiscal_offline_replay.sql`
(`pos_fiscal_offline_sessions.last_go_online_at`, `go_offline_tx_id` уже есть),
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

## Открытые вопросы (закрыть в фазе 0)

Закрыто документацией 2026-09-10: контрольное число и `mac` формирует
Checkbox в ответе `sell-offline` (формулы нет и не нужно); `go-offline`
обязателен перед любой офлайн-операцией; формат QR-ссылки ДПС
(`id, date, time, fn, sm, mac`) виден в примере; `previous_receipt_id` —
опциональный контроль последовательности, передаём предыдущий `id`.

Закрыто инвариантом «один регистратор = одна касса» (§3а): чужие
онлайн-транзакции во время офлайна невозможны, порядок `go_offline_date`
выполняется сам, смену держателя никто другой не закроет; `fiscal_date` в
закрытой смене — только наша дисциплина (§6).

Осталось — вопросы **к поддержке Checkbox / юристу**, не к докам:

1. **Допустимо ли для внешней системы выдать покупателю офлайн-чек без
   контрольного числа** и дослать его (е-чек/допечатка) после `sell-offline`?
   Документированный сценарий Checkbox (`fiscal_date` = время банковской
   транзакции, >5 мин) подразумевает постфактум-регистрацию, но про бумажный
   чек в момент продажи не сказано. От ответа зависит форма случаев B и C:
   бумажный чек сразу или только е-чек после реплея.
2. `rejected` на реплее офлайн-чека: переотправить с новым кодом или ручной
   разбор (второстепенно: в дизайне — список внимания).

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
