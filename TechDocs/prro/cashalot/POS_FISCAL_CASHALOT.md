# ПРРО Cashalot — второй провайдер: дизайн и точка возобновления (трек CA)

Статус: **CA1 (документация и папка `TechDocs/prro/`) — сделано 2026-10-21.**
Следующая фаза — CA0 (доступ, за владельцем) и CA2 (gap-анализ контракта).

**Этот документ — точка возобновления трека.** Если сессия потеряна —
начинать с таблицы фаз в §0. Правило трека: каждая фаза получает **свой план
и одобрение владельца до кода**; после завершения фазы обновить таблицу здесь
и, если менялся контракт, таблицу фаз в [../POS_FISCAL_PRRO.md](../POS_FISCAL_PRRO.md).
Родитель — [../POS_FISCAL_PRRO.md](../POS_FISCAL_PRRO.md) (контракт
`FiscalProvider`, §7; таксономия ошибок; матрица отказов §8) и
[../POS_FISCAL_OFFLINE.md](../POS_FISCAL_OFFLINE.md) (офлайн-режим, построенный
на облачной модели Checkbox). Источники Cashalot — [sources/README.md](sources/README.md).

## §0. Фазы

| Фаза | Что | Зависит от | Сделано, когда | Статус |
|---|---|---|---|---|
| **CA0** Доступ | Владелец: кабинет `my.cashalot.org.ua` (первый месяц бесплатно), ГО + ПРРО, зарегистрированные в ДПС (20-ОПП, 1-ПРРО — как для прод-магазина Checkbox; песочницы у Cashalot нет, тестовые чеки идут на реальный ПРРО с `TESTING=true`), кассир (5-ПРРО) с КЕП, «Налаштування → Інтеграція з WEB API → Управління касирами» → `KeyGuid`/`KeyPin`; вопросы в поддержку (§3) | — | в `.env` (не в git) `CASHALOT_SANDBOX_KEY_GUID`, `CASHALOT_SANDBOX_KEY_PIN`, `CASHALOT_SANDBOX_NUM_FISCAL`; `curl` `ServerState` и `TransactionsRegistrarState` отвечают; ответы поддержки — в `sources/support-answers.md` | ⬜ |
| **CA1** Документация и папка | `TechDocs/prro/` с подпапками `dps/`, `checkbox/`, `cashalot/`; снимки Cashalot в `sources/`; правка ~70 файлов с путями; индексы | — | `grep` старых путей пуст, ссылки резолвятся, `typecheck`/`lint` зелёные | ✅ 2026-10-21 |
| **CA2** Gap-анализ и ревизия стандарта | §4 этого документа: карта методов контракта → команды Cashalot, решение по каждой гипотезе §2, список изменений контракта, что проверить в CA3 | CA1 | таблица решений одобрена владельцем; у каждой гипотезы «оставляем / меняем так-то / проверить в CA3» | ⬜ |
| **CA3** Пробы на живом ПРРО | `src/pos/fiscal/providers/cashalot/sandbox.ts` (по образцу `checkbox/sandbox-offline.ts`, `npm run fiscal:sandbox:cashalot`, только `TESTING=true`, ключи из `.env`), фикстуры `src/__tests__/fixtures/cashalot/` + README находок: коды ошибок, повтор `UID`, `KeyPin` для `RegisterCheck`, ширина текстовой визуализации, `Offline`, ставки | CA0, CA2 | фикстуры в git (ключи — заглушки), открытые вопросы CA2 закрыты | ⬜ |
| **CA4** Контракт v2 | Изменения из CA2/CA3 в `types.ts`, `errors.ts`, `fiscal.service.ts`, `ledger.ts`, `rateLimit.ts`, `mapping.ts` (налоги), фейк-провайдер, миграция (`mode` CHECK, ставки в настройках) — Checkbox не замечает | CA3 | все `pos.fiscal.*` зелёные без правок Checkbox-тестов; §7 `POS_FISCAL_PRRO.md` обновлён | ⬜ |
| **CA5** Адаптер `providers/cashalot/` | `client.ts` (один endpoint, `Command`, gzip опционально), `payload.ts` (`FiscalDoc` → `CHECK*`/`ZREP*`), `errors.ts`, `index.ts`, `BUILT_IN += cashalotProvider`, `FISCAL_PROVIDER_IDS += 'cashalot'`; тесты `pos.fiscal.cashalot.{client,errors,payload,provider}.test.ts` на фикстурах CA3 | CA4 | сквозной прогон sandbox-скрипта: смена → продажа → возврат → X → Z на тестовых документах | ⬜ |
| **CA6** UI-бандл `fiscal-cashalot` + хост | `pos/src/modules/fiscal-cashalot/` (manifest, remote-entry, secretSpecs, админ-страница на `SecretsForm` + список внимания, till-страница на `ShiftPanel`; `OfflinePanel`/`HolderPanel` молчат), `vite.fiscal-cashalot-remote.config.ts`, скрипты `build:/serve:/check:…-css-coverage`, `diagnostics.ts` параметризован, `receipt.ts` подпись производителя, `FiscalSettingsCard` PROVIDERS, `navGroups`, `module-release.yml` | CA5 | локальный прогон по рецепту ранбука Checkbox на demo-магазине; платформа не двигается, если баррель не менялся | ⬜ |
| **CA7** Обкатка и выпуск | ранбук `POS_FISCAL_CASHALOT_SETUP.md`, Module Release `fiscal-cashalot`, репоинт через `/super`; сайт: `productFacts.ts` (фича/тариф «Каса + Cashalot», ROADMAP → available, `SITE_PROMISES.md`), гайд «Крок 9. Фіскалізація» расширить, не заменять; `.github/releases/pos-vX.Y.Z.md` | CA6 | первый магазин на Cashalot пробил фискальный чек; на сайте Cashalot «available» | ⬜ |
| **CA8** Офлайн для Cashalot | «ПРРО: офлайн» на карточке чека для `provider_offline`, опрос доставки, QR; случай C (касса без сети) — скорее «невозможно на облачном WEB API» → зафиксировать ограничение, либо on-prem «Сервер API» Cashalot как конфиг базового URL | CA7 + ответ поддержки (§3 и) | решение записано в `../POS_FISCAL_OFFLINE.md` рядом с Checkbox-разделами | ⬜ |

Нумерация «CA», потому что `C` занято одеждой, `К` — кафе, `D` — размерами.

## §1. Что известно о Cashalot WEB API (прочитано 2026-10-21)

Источник истины — «Специфікація WEB API ПРРО Cashälot» **v2.1.0.8034 від
29.09.2026** ([sources/webapi-2.1.0.8034.md](sources/webapi-2.1.0.8034.md));
страница на сайте отдаёт PDF 2.1.0.7980 от 04.09.2026 (рядом).

| Факт | Значение |
|---|---|
| Транспорт | Облако: `https://fsapi.cashalot.org.ua/`, один endpoint, HTTPS POST, JSON, поле `Command` (RPC-стиль), TLS 1.2/1.3, опц. gzip/deflate |
| Команды (22) | `ServerState`, `Objects`, `Operators`, `TransactionsRegistrarState`, `OpenShift`, `CloseShift` (`ZRepAuto`), `RegisterCheck` (продажа, возврат, служебное внесение/выдача, сторно), `RegisterZRep`, `LastShiftTotals` (X-отчёт), `SetCashInHandPrevShift`, `Cleanup`, `GetCheck`, `GetZRep`, `Shifts`, `Documents`, `DocumentInfoByLocalNum`, `SetupRegistrar`, `RegistrarSettings`, `CertificateInfo`, `ContainerCertificates`, `ConvertDocument`, `SendCheckToConsumer` (SMS/Viber) |
| Аутентификация | **Без сессии/токена**: каждый запрос несёт либо КЕП (`Certificate` + `PrivateKey` base64 + `Password`, или `UseSmartId`), либо — при включённой в кабинете «Інтеграція з WEB API» — `KeyGuid` + `KeyPin` (ключ лежит у Cashalot). `NumFiscal` = ФН ПРРО в каждом запросе. `UID` запроса — опциональный идентификатор, идемпотентность не обещана |
| Документ | JSON 1:1 повторяет XML ДПС: `CHECKHEAD` (DOCTYPE/DOCSUBTYPE/UID/ORDERNUM/ORDERRETNUM/ORDERSTORNUM/TESTING/OFFLINE/ORDERTAXNUM/PREVDOCHASH…), `CHECKTOTAL`, `CHECKPAY[]` (PAYFORMCD, PAYSYS), `CHECKTAX[]` (TYPE/LETTER/PRC/TURNOVER/SUM — **считаем мы**), `CHECKBODY[]` (CODE/BARCODE/UKTZED/NAME/UNITCD/AMOUNT/PRICE/LETTERS/COST/DISCOUNT*/EXCISELABELS); Z-отчёт `ZREP*`. DOCSUBTYPE: CheckGoods 0, CheckReturn 1, ServiceDeposit 2, AdditionalDeposit 3, ServiceIssue 4, CheckStorno 5 |
| Ответ `RegisterCheck` | `NumFiscal`, `NumLocal`, `OrderDateTime`, `Offline` (bool), `QrCode` (base64 PNG), `Url` (кабинет ДПС), `Visualization` (text UTF-8 / HTML / PDF / PNG, base64, `VisWidth` ≤ 4096 px). Контрольного числа и `mac` в JSON **нет** |
| Возврат | `CheckReturn` + `CHECKHEAD.ORDERRETNUM` = фискальный номер оригинала; `CheckStorno` + `StornedCheck` — сторно последнего онлайн-документа (нам не нужно) |
| Смена | `OpenShift`; `CloseShift{ZRepAuto}`; `LastShiftTotals` — итоги + `CashInHand`; `SetupRegistrar.AutoCloseShift` HH:MM — настройка ПРРО, не смены |
| Офлайн | **Управляется самим Cashalot**: при недоступности ФСКО его сервер уходит в офлайн сам, документы получают `Offline: true`, досылаются автоматически; состояние — `TransactionsRegistrarState` (`OfflineSupported`, `OfflineSessionId`, `OfflineSeed`, `OfflineNextLocalNum`, `OfflineSessionDuration`, `OfflineSessionsMonthlyDuration`, `OfflineDocumentsPresent`, `OfflineDocumentsAutoRegState`). Команд вида `ask-offline-codes` / `sell-offline` / `go-online` **нет**; первый вызов для ПРРО обязан быть онлайн; `Cleanup` стирает неотправленные офлайн-документы |
| Доставка | `GetCheck` Type `Availability`: `ResultCode` 0 Ok, 1 OnlineDocumentAbsent, 2 OfflineNumberReserved (ещё не ушёл в ДПС), 3 OfflineNumberNotReserved, 4 TransactionsRegistrarNotRegistered |
| Тест | Песочницы нет. Тестовые документы — `CHECKHEAD.TESTING=true` на реальном ПРРО (ДПС: «ТЕСТОВИЙ НЕФІСКАЛЬНИЙ ДОКУМЕНТ», смена либо вся тестовая, либо вся фискальная — [../dps/fiscal-server-api.md](../dps/fiscal-server-api.md) «Тестові документи»). Первый месяц в кабинете бесплатный; «Модуль КАСА» 200 грн/мес (2400/год) за кассу |
| Чего в спеке нет | Таблицы `ErrorCode` (только `ErrorCode` + `ErrorMessage`), таймаутов, rate limit, правила повтора, endpoint'а ставок налогов, ширины текстовой визуализации, значений `OfflineDocumentsAutoRegState` (кроме «null = без ошибок»), констант `PAYFORMCD`/`UNITCD` (справочники ДПС) |
| Рядом | API кабинета ([sources/cabinet-api.md](sources/cabinet-api.md)) — чтение чеков/смен/отчётов для сверки, `SendReceipt`; COM/Bridge — Windows-путь через РМК, нам не нужен ([sources/other-specs.md](sources/other-specs.md)) |

Стратегический бонус: JSON Cashalot — это XML ДПС один в один, поэтому
маппинг `FiscalDoc → CHECK*` из CA5 почти целиком переиспользуется треком
«власний ПРРО» (ROADMAP сайта, 35 %).

## §2. Где золотой стандарт трещит — гипотезы для CA2

Каждая строка — вопрос, который CA2 закрывает решением, а CA3 проверяет на
живом ПРРО. Правило ревизии: **любое изменение контракта обратно совместимо
для Checkbox** — `pos.fiscal.checkbox.*` и фейк остаются зелёными без правок.

| Элемент контракта | Checkbox | Cashalot | Что, вероятно, меняется |
|---|---|---|---|
| `signIn`/`signOut`, `FiscalSession.token` | bearer-токен | сессии нет, креды в каждом запросе | `signIn` = валидация (`TransactionsRegistrarState`), `token: string \| null` или пустая сессия с `meta`; `runtime.ts` не должен требовать токен |
| `secretKeys` (плоский список) | `X-License-Key` + `pin_code` | два режима: `KeyGuid` + `KeyPin` **или** файл ключа + пароль / Smart ID | v1 — только `KeyGuid` + `KeyPin` + `NumFiscal` (ключ остаётся у Cashalot, мы не храним КЕП); файл-режим (`kind: 'file'` уже есть) — отдельная фаза, если понадобится |
| Идемпотентность / `mayExistAtProvider` | наш `requestId` = id чека → `duplicate` | `UID` запроса и `CHECKHEAD.UID` — поведение при повторе не описано | проба в CA3; путь восстановления после таймаута: `NextLocalNum` до вызова → `DocumentInfoByLocalNum` → `GetCheck(OriginalXml)` → сравнить `UID`; возможно, новый опциональный метод `recover(ctx, requestId, hint)` |
| `fetchRequisites().taxes` | `/tax` | endpoint'а ставок **нет**, `CHECKTAX` заполняет клиент | ставки — в настройках магазина (редактор в админке) или из кабинета ДПС; `mapping.ts` получает арифметику НДС по буквам (сейчас считал Checkbox) |
| Офлайн (`FiscalOfflineOps`, пул кодов, лизинг кассе, реплей) | облачная модель, коды у нас | офлайн делает сам провайдер; команд для клиентских офлайн-документов нет | capability `offline` **не реализуем** (контракт это уже допускает: `settings.service` отказывает `offline_mode` некапабельному провайдеру). Новое: результат с `Offline: true` → `pos_fiscal_receipts.mode` нужен третий вариант (`provider_offline`), статус `pending` до доставки (`GetCheck` Availability: `ResultCode` 2 → 0), опрос в `retryPendingFiscalDocs`; контрольное число — хвост офлайн-номера `<сесія>.<локальний>.<контрольне>` ([../dps/README.md](../dps/README.md), факт 2) → парсим из `NumFiscal` |
| `rateLimit.ts` 2/с | лимит Checkbox в общем коде | лимит неизвестен | лимит становится свойством провайдера (`limits?.perSecond`) |
| `renderReceipt`, `receipt_source='provider'` | текст 32/48 колонок | `Visualization` text/HTML/PDF/PNG, ширина текста неизвестна | v1 — `receipt_source='local'` (наш макет, фискальный блок у нас есть); `'provider'` — после пробы ширины |
| `openShift({autoCloseAt})` | per-shift | `SetupRegistrar.AutoCloseShift` HH:MM — настройка ПРРО | применяем через `SetupRegistrar` один раз при подключении; `closeShift` → `CloseShift{ZRepAuto:true}` |
| `xReport` | `/reports` | `LastShiftTotals` + `Visualization` | 1:1 |
| `registerService` | service in/out | `ServiceDeposit` / `ServiceIssue` с `CHECKTOTAL.SUM` | 1:1 |
| `registerRefund.relatedProviderDocId` | id чека | `ORDERRETNUM` = ФН оригинала | `providerDocId` для Cashalot = фискальный номер документа |
| Таксономия ошибок | структурные `code` | `ErrorCode` без таблицы | таблица собирается в CA3; правило «`rejected` только когда документа точно нет, иначе `unknown`» — без изменений |
| Конкуренция на одном ПРРО | holder по `X-POS-Device-ID` | «несколько устройств → рассинхрон → `Cleanup`» | один бэкенд-реплика + `runtime.ts` сериализуют; holder/лизинг неприменимы (нет offline) |
| Клиент | `fiscal-checkbox` | нужен `fiscal-cashalot` | `pos/src/modules/fiscal-core/lib/diagnostics.ts` жёстко шлёт `module: 'fiscal-checkbox'` из **общего** `fiscal-core`; `pos/src/lib/receipt.ts` подпись производителя; `FiscalSettingsCard` PROVIDERS; `pos/src/types.ts` и `FISCAL_PROVIDER_IDS` без `'cashalot'`; `navGroups.ts` |

## §3. Вопросы в поддержку Cashalot (CA0, Telegram `@cashalot_support_bot`)

а) есть ли демо/тестовый ПРРО для интеграторов, или только `TESTING=true` на
своём; б) таблица `ErrorCode`; в) лимиты запросов и таймауты; г) повторный
`RegisterCheck` с тем же `CHECKHEAD.UID` — тот же `NumFiscal`, ошибка или
второй чек; д) `KeyGuid`/`KeyPin` принимаются всеми командами, включая
`RegisterCheck`; е) ширина текстовой `Visualization` в символах, есть ли
32/48; ж) откуда брать ставки/буквы налогов и проверяет ли их кабинет; з) для
офлайн-документов `Url`/`QrCode` отдаются сразу; и) может ли клиент сам подать
офлайн-документ (`CHECKHEAD.OFFLINE=true` + `ORDERTAXNUM`) — случай C;
к) allowlist IP / клиентские сертификаты; л) какие форматы ключей
(.dat/.pfx/.jks, Smart ID). Ответы — в `sources/support-answers.md` с датой.

## §4. Gap-анализ и решения (CA2)

⬜ Пишется в фазе CA2.

## §5. Что этот трек не делает

Вчасно.Каса и Є-Чек (остаются в ROADMAP); «власний ПРРО» (но CA5 готовит
маппинг под него); COM/Bridge-путь через РМК Cashalot; оплата через NovaPay;
файл-режим КЕП в нашей БД (отдельная фаза при спросе).

## §6. Журнал решений

- **2026-10-21.** Папка — `TechDocs/prro/`; переезжает всё фискальное (три
  общих дизайн-дока в `prro/`, Checkbox в `prro/checkbox/`, ДПС в `prro/dps/`);
  из PDF Cashalot храним только спецификацию WEB API (0,6 МБ), остальные —
  ссылками с датой чтения. Первый источник — Google Doc спеки (на месяц новее
  PDF на сайте). «Cashbox» в постановке = Checkbox.
