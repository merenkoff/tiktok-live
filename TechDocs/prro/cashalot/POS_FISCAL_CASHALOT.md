# ПРРО Cashalot — второй провайдер: дизайн и точка возобновления (трек CA)

Статус: **CA1 (документация и папка `TechDocs/prro/`) и CA2 (gap-анализ
контракта, §4) — сделано 2026-10-21; ответы разработки Cashalot на все
вопросы §3 получены 2026-10-24 (§1a), §4 по ним пересмотрен.** Следующая
фаза — остаток CA0 (кабинет, ПРРО, ключи — за владельцем), за ней CA3 (пробы
§4.5 на живом ПРРО).

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
| **CA0** Доступ | Владелец: кабинет `my.cashalot.org.ua` (первый месяц бесплатно), ГО + ПРРО, зарегистрированные в ДПС (20-ОПП, 1-ПРРО — как для прод-магазина Checkbox; демо-кассы для интеграторов нет, тестовые чеки идут на свой ПРРО с `TESTING=true`), кассир (5-ПРРО) с КЕП, «Налаштування → Інтеграція з WEB API → Управління касирами» → `KeyGuid`/`KeyPin`; вопросы в поддержку (§3) | — | в `.env` (не в git) `CASHALOT_SANDBOX_KEY_GUID`, `CASHALOT_SANDBOX_KEY_PIN`, `CASHALOT_SANDBOX_NUM_FISCAL`; `curl` `ServerState` и `TransactionsRegistrarState` отвечают; ответы поддержки — в `sources/support-answers.md` | 🟡 ответы разработки — 2026-10-24 ([sources/support-answers.md](sources/support-answers.md)); кабинет, ПРРО и ключи — за владельцем |
| **CA1** Документация и папка | `TechDocs/prro/` с подпапками `dps/`, `checkbox/`, `cashalot/`; снимки Cashalot в `sources/`; правка ~70 файлов с путями; индексы | — | `grep` старых путей пуст, ссылки резолвятся, `typecheck`/`lint` зелёные | ✅ 2026-10-21 |
| **CA2** Gap-анализ и ревизия стандарта | §4 этого документа: карта методов контракта → команды Cashalot, решение по каждой гипотезе §2, список изменений контракта, что проверить в CA3 | CA1 | таблица решений одобрена владельцем; у каждой гипотезы «оставляем / меняем так-то / проверить в CA3» | ✅ 2026-10-21 — §4; примеры документов ДПС сняты в `../dps/examples/` |
| **CA3** Пробы на живом ПРРО | `src/pos/fiscal/providers/cashalot/sandbox.ts` (по образцу `checkbox/sandbox-offline.ts`, `npm run fiscal:sandbox:cashalot`, только `TESTING=true`, ключи из `.env`), фикстуры `src/__tests__/fixtures/cashalot/` + README находок: девять проб §4.5 — главные из них повтор `UID` и поиск номера (4), арифметика `CHECKTAX` (3, 5) и вызов из прода (9) | CA0, CA2 | фикстуры в git (ключи — заглушки); у каждой пробы §4.5 есть ответ; поиск номера по повтору `UID` работает на живом ПРРО | 🟡 2026-10-24: транспорт `providers/cashalot/client.ts` и скрипт `npm run fiscal:sandbox:cashalot` готовы (CA4, PR 3), прогнаны против локальной заглушки — живой прогон после CA0 |
| **CA4** Контракт v2 | Список §4.3: `normalizeConfig` с состоянием смены, `FiscalResult.mode` + миграция расширения CHECK, `FiscalDocLine.unit`, JSDoc; общий модуль `src/pos/fiscal/dps/` (налоги, единицы) — Checkbox не замечает. `findByRequestId` выпал (ответ г). Делается **до** CA3 по решению владельца 2026-10-24: ответы разработки подтвердили эти добавки, а если пробы CA3 покажут другое округление налога или форму `UNITCD`, правится `dps/`, а не контракт | — (CA3 после) | все `pos.fiscal.*` зелёные без правок Checkbox-тестов; §7 `POS_FISCAL_PRRO.md` обновлён | 🟡 2026-10-24: контракт v2 (§4.3 пп. 1–5) — PR 1 из 3; модуль `src/pos/fiscal/dps/` (сборка чека, налоги, единицы, оплаты, имена ошибок, заокругление; тесты по числам примеров ДПС) — PR 2; транспорт и скрипт CA3 — PR 3 |
| **CA5** Адаптер `providers/cashalot/` | `client.ts` (один endpoint, `Command`, gzip опционально), `payload.ts` (`FiscalDoc` → `CHECK*`/`ZREP*`), `errors.ts`, `index.ts`, `BUILT_IN += cashalotProvider`, `FISCAL_PROVIDER_IDS += 'cashalot'`; тесты `pos.fiscal.cashalot.{client,errors,payload,provider}.test.ts` на фикстурах CA3 | CA4 | сквозной прогон sandbox-скрипта: смена → продажа → возврат → X → Z на тестовых документах | ⬜ |
| **CA6** UI-бандл `fiscal-cashalot` + хост | `pos/src/modules/fiscal-cashalot/` (manifest, remote-entry, secretSpecs, админ-страница на `SecretsForm` + список внимания, till-страница на `ShiftPanel`; `OfflinePanel`/`HolderPanel` молчат), `vite.fiscal-cashalot-remote.config.ts`, скрипты `build:/serve:/check:…-css-coverage`, `diagnostics.ts` параметризован, `receipt.ts` подпись производителя, `FiscalSettingsCard` PROVIDERS, `navGroups`, `module-release.yml` | CA5 | локальный прогон по рецепту ранбука Checkbox на demo-магазине; платформа не двигается, если баррель не менялся | ⬜ |
| **CA7** Обкатка и выпуск | ранбук `POS_FISCAL_CASHALOT_SETUP.md`, Module Release `fiscal-cashalot`, репоинт через `/super`; сайт: `productFacts.ts` (фича/тариф «Каса + Cashalot», ROADMAP → available, `SITE_PROMISES.md`), гайд «Крок 9. Фіскалізація» расширить, не заменять; `.github/releases/pos-vX.Y.Z.md` | CA6 | первый магазин на Cashalot пробил фискальный чек; на сайте Cashalot «available» | ⬜ |
| **CA8** Офлайн для Cashalot | «ПРРО: офлайн» на карточке чека для `provider_offline`, опрос доставки, внимание по `OfflineDocumentsAutoRegState`. Касса без интернета (случай C): ответ и) — на облачном WEB API офлайн работает только пока доступен сервер Cashalot, поэтому для Cashalot `offline_mode` недоступен и это ограничение записывается в доки и на сайт; единственный путь к случаю C — FS API, развёрнутый на своём сервере или рабочем компьютере, — отдельное решение владельца (цена, кто ставит, адаптер на кассе) | CA7 | ограничение записано в `../POS_FISCAL_OFFLINE.md` рядом с Checkbox-разделами; по FS API на своём сервере — решение «да / нет / позже» | ⬜ |

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
| Чего в спеке нет | Таблицы `ErrorCode` (только `ErrorCode` + `ErrorMessage`), таймаутов, rate limit, правила повтора, endpoint'а ставок налогов, ширины текстовой визуализации, значений `OfflineDocumentsAutoRegState` (кроме «null = без ошибок»), констант `PAYFORMCD`/`UNITCD` (справочники ДПС; что из них известно по примерам ДПС — [../dps/document-structures.md](../dps/document-structures.md)) |
| Рядом | API кабинета ([sources/cabinet-api.md](sources/cabinet-api.md)) — чтение чеков/смен/отчётов для сверки, `SendReceipt`; COM/Bridge — Windows-путь через РМК, нам не нужен ([sources/other-specs.md](sources/other-specs.md)) |

Стратегический бонус: JSON Cashalot — это XML ДПС один в один, поэтому
маппинг `FiscalDoc → CHECK*` из CA5 почти целиком переиспользуется треком
«власний ПРРО» (ROADMAP сайта, 35 %).

## §1a. Ответы разработки Cashalot (2026-10-24)

Дословно — [sources/support-answers.md](sources/support-answers.md) (через
партнёра, «Відповідь надана розробкою ПРРО Кашалот»). Что из них следует:

| Вопрос §3 | Ответ | Что меняется в §4 |
|---|---|---|
| а) тестовый ПРРО | Демо-кассы нет; тестировать на своём ПРРО с `TESTING = true` | ничего — так и планировали |
| м) тестовая смена | `OpenShift` принимает `"TESTING": true` в корне запроса | п. 8: виртуальная смена не нужна |
| д) `KeyGuid` + `KeyPin` | Хватает всем командам; `GetCheck` кредов не требует вовсе — только `RegistrarNumFiscal` и `NumFiscal` чека | п. 2 подтверждён |
| к) доступ | Ни IP-allowlist, ни клиентского TLS; IP из стран под ограничениями могут блокироваться | проба 9: вызов из региона Railway |
| л) форматы ключей | `.dat`, `.pfx`, `.jks`, Smart ID — все | вне v1, как решено |
| б), п) коды ошибок | Полного перечня нет; `ErrorCode` — строка-имя (`DocumentValidationError`, `ShiftAlreadyOpened`, `ZRepAlreadyRegistered`, `UndefinedRegistrarState`), текст — в `ErrorMessage` | п. 11 переписан по именам, без числовых синонимов |
| в) лимиты | Лимитов нет; `RegisterCheck` занимает 400–800 мс | п. 6 подтверждён |
| г) повтор `UID` | HTTP 400, «Код помилки: 13 DuplicatedRequestUid», второго чека нет; `UID` — в **корне** запроса, а не в `CHECKHEAD` | п. 3: Cashalot идемпотентен сам, `findByRequestId` выпадает из контракта |
| ж) налоги | Буквы только кириллицей; буквы никто не сверяет, но ФСКО отклонит документ при расхождении сумм `CHECKTAX` с позициями; букву не менять в открытой смене и не давать одну букву двум налогам | п. 4: проверки в `normalizeConfig`, арифметика должна совпасть с ФСКО |
| н) единицы и оплата | `UNITCD` и `UNITNM` необязательны, но рекомендованы, и только парой; г 0303, кг 0301, мл 0144 (ДК 011-96); безналичный перевод по QR — `PAYFORMCD 306` «Переказ за QR-кодом (IBAN)» | пп. 13, 14 |
| е) ширина текста | Только в пикселях, по умолчанию 440 px | п. 7: `renderReceipt` для текста не делаем |
| з), о) офлайн-номер | `<сесія>.<локальний>.<контрольне>`, локальный номер с 1; `Url` и `QrCode` приходят сразу; один ПРРО — не с нескольких устройств одновременно | п. 5 подтверждён |
| и) касса без интернета | Офлайн на WEB API работает, только пока доступен сервер Cashalot; иначе — FS API, развёрнутый на своём сервере или рабочем компьютере | CA8: случай C на облачном API невозможен |

## §2. Где золотой стандарт трещит — гипотезы для CA2

Решение по каждой строке — в §4.2; таблица оставлена как запись исходных
гипотез.

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
(.dat/.pfx/.jks, Smart ID); м) как открыть **тестовую** смену через WEB API —
`OpenShift` флага `TESTING` не имеет; н) обязательны ли `UNITCD`/`UNITNM`, коды
единиц для `г`, `кг`, `мл` и какой `PAYFORMCD` ставить за безналичный перевод по
QR (IBAN); о) формат `NumFiscal` офлайн-документа и есть ли у него `Url` сразу;
п) `ErrorCode` — строка-имя или число, полный перечень своих кодов сверх ДПС
(как `InconsistentRegistrarState`). Ответы — в `sources/support-answers.md` с
датой.

**Ответы получены 2026-10-24** на все вопросы — [sources/support-answers.md](sources/support-answers.md),
сводка и следствия — §1a. Вопросы ушли партнёру по-украински 14 пунктами:
1 — а, 2 — м, 3 — д, 4 — к, 5 — л, 6 — б и п, 7 — в, 8 — г, 9 — ж, 10 и 11 — н,
12 — е, 13 — з и о, 14 — и. Что осталось проверить руками — пробы §4.5.

## §4. Gap-анализ и решения (CA2 — 2026-10-21; пересмотр по ответам Cashalot — 2026-10-24)

Каждая гипотеза §2 получила решение. Правило ревизии прежнее: контракт меняется
только обратно совместимо — `pos.fiscal.checkbox.*` и фейк
`src/__tests__/helpers/fake-fiscal-provider.ts` зелёные без правок. Решения
владельца: креды v1 — только `KeyGuid` + `KeyPin`; среди первых магазинов есть
плательщики ПДВ, поэтому таблица ставок и `CHECKTAX` нужны с первого релиза.
Источники: спека ([sources/webapi-2.1.0.8034.md](sources/webapi-2.1.0.8034.md)),
ответы разработки ([sources/support-answers.md](sources/support-answers.md), §1a),
примеры документов ДПС ([../dps/examples/](../dps/examples/README.md), разбор —
[../dps/document-structures.md](../dps/document-structures.md)) и код.

### 4.1. Что генерический слой на самом деле требует от адаптера

Это верно для любого следующего провайдера, не только для Cashalot.

- `session.token` и `meta` генерический слой не читает; читается только `expiresAt` (`runtime.ts:74`), `signOut` не вызывается нигде. Ошибка в `signIn` случается до `transmitted = true` (`fiscal.service.ts:500-509`), и чекаут отвечает 503 «ничего не записано»; та же ошибка из `register*`, кроме `rejected`, продажу **оставляет** (`mayExistAtProvider`, `:381-393`).
- Восстановление после таймаута — это крон `retryOne` (`:1402`), который **переотправляет тот же payload** с тем же `requestId`. Спасает только ответ `duplicate` с `existingProviderDocId` → `resolveDuplicate` → `fetchDocument` (`:607-628`); без id строка паркуется как `duplicate_unresolved`. Поиска по `requestId` в генерическом слое нет.
- `auth_expired` — единственный восстанавливаемый вид, который пересоздаёт сессию: генерический слой сбрасывает её (`recover`, `:636-639`), следующий `buildCallCtx` вызывает `signIn`, и документ уходит ещё раз; `mayExistAtProvider` для него — «нет».
- `FiscalRequisites.taxes` бэкенд не читает; касса печатает одну строку ПДВ по ставке по умолчанию (`pos/src/lib/receipt.ts:58-80`, `total × rate / (100 + rate)`). `default_tax_code` — только ASCII `/^[A-Za-z0-9_-]{1,16}$/` (`settings.service.ts:41`); `vat_cents` только пишется.
- `secretKeys` бэкенд не использует (форма в бандле статическая); секрет ≤ 4096 символов, `config` ≤ 8192 байт; ключ регистратора — `config.cashRegisterKey` (`shifts.service.ts:72`).
- Срок смены наш: 23,5 ч (`shifts.service.ts:283`), крон `closeDueShifts` закрывает сам. «Нет смены» при закрытии обязано приходить как `shift_closed`, иначе крон повторяет закрытие каждые 5 минут (`:324-335`).
- `renderReceipt` вызывается только с `'text'` и шириной 32/48, best-effort (`:568-597`); адаптер без `renderReceipt` — и касса печатает наш макет даже при `receipt_source = 'provider'`. QR на бумаге строится из `tax_url`, `qr_payload` не печатается. Без `fiscalCode` касса не печатает фискальный блок вовсе.
- `pos_fiscal_receipts.mode` — CHECK `('online','offline')` (027:117); `claimDueDocuments` берёт только `mode = 'online'`. `provider_request_id` — UUID (024:100), то есть уже в формате GUID.
- Бандл обязан называться `fiscal-<provider>` (`src/pos/core/modules.ts:273-291`); `module-release.yml` требует `remote-entry.ts`, `build:<id>-remote` и `check:<id>-css-coverage`.

### 4.2. Решения

| # | Элемент | Решение | Где меняется (фаза) | Проверить в CA3 |
|---|---|---|---|---|
| 1 | Сессия | **Контракт не меняется.** `signIn` = `TransactionsRegistrarState`: проверяет KeyGuid/PIN/ФН до первой отправки, поэтому неверный PIN даёт 503 без записи, а не запаркованную продажу; заодно выполняет требование спеки и ответа б) «сначала получить состояние ПРРО». Возвращает `{ token: '', expiresAt: null, meta: { numFiscal } }`; `signOut` — пустой | JSDoc у `FiscalSession.token` (CA4) | — |
| 2 | Креды | `secretKeys` = `keyGuid` (text), `keyPin` (password), `numFiscal` (text) — всё в шифрованном мешке, форма не меняется. Админ-страница бандла тем же PATCH пишет `config: { cashRegisterKey: numFiscal, testing, taxes }`. Ответ д): этих полей хватает всем командам, `GetCheck` идёт вообще без кредов. Файловый КЕП и Smart ID (ответ л: поддерживаются все форматы) — вне v1 | адаптер, `fiscal-cashalot/secretSpecs.ts` (CA5/CA6) | — |
| 3 | Идемпотентность | Ответ г): повтор с тем же `UID` Cashalot отклоняет — HTTP 400, «Код помилки: 13 DuplicatedRequestUid», второго чека нет; `UID` — в **корне** запроса рядом с `Command` (гипотеза ставила его в `CHECKHEAD`). Значит Cashalot идемпотентен, как Checkbox, и **контракт не меняется**: наш `requestId` уходит в корневой `UID`, адаптер маппит `DuplicatedRequestUid` в `duplicate`. Разница одна: Checkbox называет существующий чек (это наш же `requestId`), Cashalot — нет, а `resolveDuplicate` без `existingProviderDocId` паркует строку. Поэтому адаптер, получив дубль, **сам находит номер** и кладёт его в `existingProviderDocId`: `TransactionsRegistrarState` → `DocumentInfoByLocalNum` назад от `NextLocalNum − 1`, до 10 документов текущей смены → `GetCheck(OriginalXml)` → совпадение `CHECKHEAD.UID` с нашим `requestId` (копию кладём и туда, если Cashalot её не перезапишет), иначе — сумма и время документа. Дальше обычный `resolveDuplicate` → `fetchDocument` (= `GetCheck`); не нашёл — строка паркуется для владельца, как у Checkbox. `providerDocId` = `NumFiscal` документа | адаптер (CA5) | форма ответа-дубля (JSON `ErrorCode` или текст «Код помилки: …»); доходит ли наш `CHECKHEAD.UID` до `OriginalXml`; считается ли дублем повтор `UID` после ответа-ошибки |
| 4 | Ставки | **Таблица в `config.taxes`**, её вводит владелец на `/admin/fiscal`, перенося названия и буквы из кабинета Cashalot (так советует разработка, ответ ж): `[{ letter: 'А', name: 'ПДВ', type: 0, rate: 20 }]`. Буквы — **только кириллицей** (ответ ж). `fetchRequisites()` отдаёт таблицу как `FiscalRequisites.taxes`: `symbol` = буква, `code` = её латинская транслитерация (`А→A`, `Б→B`, `В→V`, `Г→G`, `Д→D`, `Е→E`, `Є→YE`, `Ж→ZH`, `З→Z`, `И→Y`, `І→I`, `Ї→YI`, `Й→J`, `К→K`) — `default_tax_code` принимает только ASCII. `FiscalDocLine.taxCode` → `LETTERS`. `CHECKTAX` считаем мы по правилу примера ДПС «Знижки»: на букву `TURNOVER = Σ COST` (до скидки), `SOURCESUM = Σ (COST − DISCOUNTSUM)` (база после скидки), `SUM = SOURCESUM − round(SOURCESUM × 100 / (100 + PRC))` для налога, включённого в цену (`SIGN: false`) — «база минус нетто»: так сходятся все пять чисел примеров ДПС, а прямая `round(SOURCESUM × PRC / (100 + PRC))` на ничьей 12,57 при 20 % даёт 2,10 вместо 2,09 из примера «Заокруглення» (разбор — `../dps/document-structures.md`); `vatCents = Σ SUM` по `TYPE 0`. С заокруглением готівки `CHECKTOTAL.SUM` — сумма к оплате, `NORNDSUM` — товары, `RNDSUM` = −`rounding_cents`, а `CHECKTAX` — от товаров. Буквы никто не сверяет, но ФСКО **отклонит документ**, если суммы `CHECKTAX` разойдутся с позициями (ответ ж) — значит арифметика должна совпасть с ФСКО копейка в копейку. `normalizeConfig` отказывает в двух случаях, о которых предупредила разработка: одна буква у двух налогов — всегда; правка `config.taxes` — пока смена открыта. Одна буква на строку; акциз (`TYPE 1`, меняет базу ПДВ — пример «Два податки») и налог сверх цены — вне v1. Пустая таблица — чек без `CHECKTAX` и `LETTERS` (ФОП без ПДВ). Арифметика — в общем модуле `src/pos/fiscal/dps/taxes.ts`, его же возьмёт «власний ПРРО» | `dps/taxes.ts` (сделано), `normalizeConfig` (CA5); форма таблицы (CA6); разбивка ПДВ по буквам на нашем макете чека и та же формула, что в `dps/` (CA6 — сейчас одна строка прямой формулой, на ничьей расходится на копейку) | чек со скидкой и двумя ставками и чек на 12,57 при 20 % (ничья) должны пройти; роль `TURNOVERDISCOUNT`; принимает ли Cashalot наши `RNDSUM`/`NORNDSUM` или считает заокругление сам |
| 5 | Офлайн | `offline` **не реализуем**: гейты уже не пускают такого провайдера к пулу, держателю и реплею. Новое: опциональное `FiscalResult.mode?: 'online' \| 'provider_offline'` (Checkbox его не задаёт — значит online) → `ledger.markDone` пишет `mode`; CHECK `pos_fiscal_receipts.mode` расширяется новой миграцией; `FiscalDocMode` на сервере и в `pos/src/types.ts`; касса печатает «ОФЛАЙН» и для `provider_offline`. Ответ з/о подтвердил формат офлайн-номера `<сесія>.<локальний>.<контрольне>` → `controlNumber` = его хвост, и то, что `Url` и `QrCode` приходят **сразу** → `taxUrl` = `Url`, офлайн-чек печатается с QR немедленно. Опрос доставки (`GetCheck Availability`, `ResultCode` 2 → 0) и внимание по `OfflineDocumentsAutoRegState` — CA8. Касса без интернета (случай C) на облачном WEB API невозможна (ответ и) — тоже CA8 | `types.ts`, `ledger.ts`, миграция, `receipt.ts` (CA4/CA6) | офлайн-документ в тестовой смене, если удастся вызвать (ФСКО недоступен) |
| 6 | Rate limit | Ответ в): лимитов нет, `RegisterCheck` — 400–800 мс. Наш лимитер 2 запроса/с на регистратор оставляем: он выше потребности одной кассы и не мешает | — | латентность серии чеков |
| 7 | Печать | Ответ е): ширина визуализации — только в пикселях (по умолчанию 440 px), символьной ширины 32/48 нет. Поэтому `renderReceipt` для `'text'` **не реализуем**: без него генерический слой сам печатает наш макет даже при `receipt_source = 'provider'`. В бандле Cashalot переключатель источника печати не показываем | адаптер (CA5), бандл (CA6) | — |
| 8 | Смены | `getShift` = `TransactionsRegistrarState` (`ShiftState = 1` → `{ providerShiftId: String(ShiftId), status: 'open' }`, иначе `null`); `openShift` = `OpenShift` с `"TESTING": config.testing` в корне — так тестовая смена открывается обычной командой (ответ м), виртуальная смена из гипотезы не нужна; `openedAt = OrderDateTime`, `autoCloseAt` = наш (крон закрывает сам). `ShiftAlreadyOpened` → перечитать состояние и вернуть открытую смену; если её `Testing` не совпадает с `config.testing` — `rejected` «Відкрита зміна має інший режим (тестова чи фіскальна) — закрийте її в кабінеті Cashalot», иначе каждый чек получит `DocumentValidationError` (пример ответа б); переключать `config.testing` при открытой смене `normalizeConfig` не даёт. `closeShift` = `CloseShift{ ZRepAuto: true, Visualization: true }`; `ShiftNotOpened` и `ZRepAlreadyRegistered` (так отвечает закрытие уже закрытой смены, ответ б) → перечитать состояние: смены нет → `shift_closed`, смена есть → ещё раз `CloseShift{ ZRepAuto: false }`. `xReport` = `LastShiftTotals{ Visualization: true }`. `SetupRegistrar` не трогаем | адаптер (CA5) | `Shifts` показывает `Testing: true`; фискальный чек в тестовую смену даёт `DocumentValidationError` |
| 9 | Служебные | `RegisterCheck` с `DOCSUBTYPE` `ServiceDeposit` / `ServiceIssue` и только `CHECKTOTAL.SUM` (пример ДПС «Службове внесення» — то же, без `CHECKBODY`) | адаптер | — |
| 10 | Возврат | `DOCSUBTYPE: CheckReturn`, `CHECKHEAD.ORDERRETNUM = relatedProviderDocId` (ФН оригинала, пример ДПС «Повернення»); строки и `CHECKTAX` по тем же правилам, `CHECKPAY` по методу возврата | адаптер | возврат по офлайн-номеру оригинала |
| 11 | Ошибки | Новых `FiscalErrorKind` нет. Ответ б): полного перечня нет, `ErrorCode` — **строка-имя**, текст — в `ErrorMessage`. На числа не опираемся: в ответе г «13» — это `DuplicatedRequestUid`, а в перечне ДПС 13 — `NoContent`. Таблица по именам: `DuplicatedRequestUid` → `duplicate` + поиск номера (п. 3); `ShiftNotOpened` → `shift_closed`; `ShiftAlreadyOpened` → успех в `openShift` (п. 8); `ZRepAlreadyRegistered` → по п. 8; `DocumentValidationError`, `InvalidQueryParameter`, `InvalidTin` → `rejected` (документ не создан; `ErrorMessage` уходит в текст отказа); `UndefinedRegistrarState` → `auth_expired` — это путь «пересоздать сессию» (§4.1): следующий `signIn` выполнит `TransactionsRegistrarState`, как требует текст ошибки, и документ уйдёт ещё раз; `mayExistAtProvider` для него — «нет», и это верно: при неопределённом состоянии чек не регистрировался. `TransactionsRegistrarAbsent`, `OperatorAccessToTransactionsRegistrarNotGranted`, `CryptographyError`, HTTP 401/403/404 → `auth_rejected`; `InconsistentRegistrarState`, `CheckLocalNumberInvalid` → `unknown` с `providerCode` (владельцу нужен `Cleanup` в кабинете, строка попадёт в список внимания); HTTP ≥ 500 и таймауты → `unavailable`; прочее → `unknown`. Тело ошибки двух форм — JSON `ErrorCode`/`ErrorMessage` и текст ДПС «Код помилки: <число> <Имя>\r\n<опис>» (так описан дубль), клиент читает обе. `providerCode` ≤ 64 символов. Непонятную ошибку разработка разбирает по телу запроса и ответа без чувствительных данных — фикстуры CA3 пишем так, чтобы их можно было переслать как есть | `providers/cashalot/errors.ts`, база в `dps/errors.ts` (CA5) | форма и текст ответов на неверный PIN, чужой ФН, сумму ≠ Σ строк, ошибку `CHECKTAX` в копейку |
| 12 | Конкуренция | Без изменений: одна реплика API и `runtime.ts` сериализуют обращения к ПРРО — ровно то, о чём просит разработка (ответ з/о: одну кассу — не с нескольких устройств одновременно) | — | — |
| 13 | Единицы | Новое опциональное `FiscalDocLine.unit?: string` из `pos_sale_items.unit` (Checkbox игнорирует). Ответ н): `UNITCD` и `UNITNM` необязательны, но рекомендованы, и передаются **только парой**. Коды ДК 011-96 из ответа и примеров: шт 2009, г 0303, кг 0301, мл 0144, л 0138 — это покрывает всё, чем торгуют вертикали (`шт`, `г`, `мл`). Шлём пару всегда; для единицы вне таблицы — ни одного из двух полей | `types.ts`, `mapping.ts`, `fiscal.service.ts` (CA4); `dps/units.ts` (CA5) | принимается ли `UNITCD` числом (`303`): в C#-структуре он `int`, в ответе записан с нулём (`0303`) |
| 14 | Деньги и оплата | Гривны с двумя знаками (`cents / 100`), `AMOUNT = quantityMilli / 1000` (три знака). `PRICE` — цена до скидки, `COST = PRICE × AMOUNT` **до скидки**, при скидке `DISCOUNTTYPE: 0` (сумова) и `DISCOUNTSUM = COST − lineTotalCents`; `CHECKTOTAL.SUM` = итог документа, `CHECKTOTAL.DISCOUNTSUM` = Σ скидок строк (пример ДПС «Знижки»; та же формула, что у Checkbox, `payload.ts:53-73`; скидку корзины `mapping.ts` уже разнёс по строкам). `CHECKPAY`: `cash` → `PAYFORMCD 0` «ГОТІВКА» (`PROVIDED`/`REMAINS` не шлём — сдачу мы не храним); `card` → `1` «КАРТКА»; `qr` → `306` «Переказ за QR-кодом (IBAN)» — код, который использует сам Cashalot (ответ н; в схеме есть ещё `100000` «Безготівковий платіжний інструмент») | `dps/check.ts` (CA5) | чек с оплатой `306` проходит; арифметика скидки — как в п. 4 |
| 15 | Шапка и реквизиты | `UID` запроса — в корне (п. 3). В `CHECKHEAD` — `DOCTYPE`/`DOCSUBTYPE` именами (`"SaleGoods"`, `"CheckGoods"`, так в примерах Cashalot), `CASHIER`, `ORDERRETNUM`, `TESTING` и копия `UID` для поиска; `TIN`, `ORGNM`, `POINTNM`, `ORDERDATE`/`ORDERTIME`, `ORDERNUM`, `CASHREGISTERNUM` Cashalot ставит сам — в его примерах их нет. `fetchRequisites` = `TransactionsRegistrarState{ IncludeTaxObject: true }`: `organization { name: OrgName, edrpou: Tin, tax_number: Ipn ?? Tin, is_vat: Boolean(Ipn) }`, `point { Name, Address }`, `register { fiscal_number: numFiscal, title: из Objects, address: null }`, `taxes` из `config` | адаптер (CA5) | действительно ли шапку заполняет Cashalot; состав `TaxObject` |
| 16 | Probe | `TransactionsRegistrarState` → `{ ok, cashierName: Name (ПІБ того, кто открыл смену; без смены — null), cashRegister: 'ПРРО <ФН>', shiftOpen: ShiftState === 1, message: срок лицензии из LicenseExpiration }` | адаптер | — |
| 17 | Клиент | Контракт не меняется. CA6: `pos/src/modules/fiscal-cashalot/` (manifest `id: 'fiscal-cashalot'`, `secretSpecs.ts` с тестом паритета против адаптера, админ-страница = `SecretsForm` + форма `config.taxes`/`testing` + список внимания, без переключателя источника печати; till-страница = `ShiftPanel`), `vite.fiscal-cashalot-remote.config.ts`, скрипты `build:`/`serve:` (порт 5010)/`check:`. Хост: `FiscalProviderId` (`pos/src/types.ts`), `PROVIDERS`/`PROVIDER_LABEL` (`FiscalSettingsCard.tsx`), подпись производителя через карту `{ checkbox: 'ПРРО Checkbox', cashalot: 'ПРРО Cashalot' }` (`receipt.ts:93-97`), `navGroups.ts`, id модуля в `fiscal-core/lib/diagnostics.ts:114` — через `define` вайт-конфига бандла | CA5/CA6 | — |
| 18 | Доступ по IP | Ответ к): allowlist и клиентских сертификатов нет, но IP из стран под ограничениями могут блокироваться. Прод обращается к Cashalot из региона Railway, а пробы CA3 — с машины разработчика, поэтому один вызов из прода обязателен | — | проба 9 |

### 4.3. Изменения контракта v2 (CA4, все обратно совместимы) — поставлены 2026-10-24

1. `FiscalProvider.normalizeConfig?(next, ctx: { previous, shiftOpen }): Record<string, unknown>` — `updateFiscalSettings` зовёт его после своей проверки размера, `shiftOpen` берёт из живой строки `pos_fiscal_shifts`; ошибка → `FiscalSettingsValidationError`. Cashalot отказывает в дубле буквы и в правке `taxes`/`testing` при открытой смене.
2. `FiscalResult.mode?: 'online' | 'provider_offline'`; `FiscalDocMode` += `'provider_offline'` (`ledger.ts:44`, `pos/src/types.ts`); миграция `0NN_pos_fiscal_receipts_provider_offline.sql` (следующий свободный номер; заняты до 070) расширяет CHECK; `markDone` пишет `mode`; `toView`/`fiscalViewFromRow` отдают; касса печатает «ОФЛАЙН».
3. `FiscalDocLine.unit?: string` из `pos_sale_items.unit` (`mapping.ts` `SaleItemInput.unit`, `getSale` его уже отдаёт).
4. JSDoc: `FiscalSession.token` — «пустая строка: провайдер без сессии»; `requestId` — «у ДПС-провайдеров это `UID` в корне запроса, по которому провайдер отклоняет повтор».
5. Фейк-провайдер получает `normalizeConfig`/`mode` только в новых тестах; существующие тесты не трогаются.

Сделано так, как записано выше, с одной поправкой: миграция — `072` (колонка `mode` была `VARCHAR(8)`, её пришлось расширить до 16 символов), и тот же CHECK — в `027`, который идёт первым на каждом старте. Тесты: `pos.fiscal.mapping`, `pos.fiscal.ledger` (режим пишется, перечитанная продажа его не теряет, наш `offline` не перетирается), `pos.fiscal.settings` (хук), `receipt.test.ts` и `FiscalBadge.test.tsx` на кассе.

Выпало после ответов: `findByRequestId` — Cashalot сам отклоняет повтор `UID`
(ответ г), а номер уже зарегистрированного чека находит адаптер (п. 3).

### 4.4. Дизайн адаптера (кодируется в CA5)

Модуль `dps/` есть с 2026-10-24 (CA4, PR 2): `types`, `money`, `units`, `payments`, `taxes`, `check`, `errors`, тесты — `src/__tests__/pos.fiscal.dps.test.ts`. Адаптер ниже — CA5.

```
src/pos/fiscal/dps/            провайдер-нейтральная модель документа ДПС (её же возьмёт «власний ПРРО»)
  check.ts     FiscalSaleDoc/RefundDoc/ServiceDoc + TaxTable + testing → { CHECKHEAD, CHECKTOTAL, CHECKPAY[], CHECKTAX[], CHECKBODY[] }
  taxes.ts     TaxTable (config.taxes), буква ↔ ASCII-код, расчёт CHECKTAX (§4.2 п. 4), vatCents, проверки normalizeConfig
  units.ts     unit → { UNITCD, UNITNM } парой или ничего (§4.2 п. 13)
  errors.ts    имена ошибок ДПС → FiscalErrorKind
src/pos/fiscal/providers/cashalot/
  client.ts    POST https://fsapi.cashalot.org.ua/ { Command, UID, KeyGuid, KeyPin, NumFiscal, … }; GetCheck без кредов; signal из ctx; ошибка — JSON ErrorCode/ErrorMessage или текст «Код помилки: N Имя» → CashalotApiError { httpStatus, errorCode, errorMessage, body }
  errors.ts    classifyCashalotError = dps/errors + свои (DuplicatedRequestUid, UndefinedRegistrarState, InconsistentRegistrarState, HTTP)
  lookup.ts    найти номер уже зарегистрированного чека по нашему UID (§4.2 п. 3) — для existingProviderDocId
  payload.ts   FiscalDoc → RegisterCheck через dps/check; ответ → FiscalResult (providerDocId = fiscalCode = NumFiscal, fiscalDate = OrderDateTime, taxUrl = qrPayload = Url, mode, controlNumber из хвоста офлайн-номера)
  index.ts     cashalotProvider: id 'cashalot', title 'Cashalot', secretKeys, normalizeConfig, probe, signIn, fetchRequisites, getShift/openShift/closeShift, xReport, register*, fetchDocument; без renderReceipt и без offline
  sandbox.ts   npm run fiscal:sandbox:cashalot (CA3): только TESTING=true, ключи из .env, фикстуры в src/__tests__/fixtures/cashalot/runs/<timestamp>/
```

### 4.5. Пробы CA3 (реальный ПРРО, `TESTING=true`)

1. `ServerState`; `TransactionsRegistrarState` с KeyGuid/PIN/NumFiscal — валидность кредов, состав `TaxObject`, `OfflineSupported`, `LicenseExpiration`.
2. Тестовая смена: `OpenShift{ TESTING: true }`; `Shifts` за день показывает `Testing: true`; фискальный чек в эту смену → `DocumentValidationError` (фикстура).
3. Продажа: строка с ПДВ 20 % и нашим `CHECKTAX`, вторая со ставкой «Б» и скидкой, оплаты `1` и `306`, единицы `шт`/`г`/`мл` с `UNITCD` числом → `NumFiscal`, `Url`, `QrCode`.
4. **Повтор с тем же `UID`** → форма ответа `DuplicatedRequestUid`; затем `DocumentInfoByLocalNum` + `GetCheck(OriginalXml)` — доходит ли наш `CHECKHEAD.UID` (путь поиска номера); повтор `UID` после ответа-ошибки — тоже дубль или нет.
5. Ошибки: неверный PIN, чужой ФН, сумма ≠ Σ строк, `CHECKTAX` с расхождением в копейку — форма и текст каждой.
6. Возврат (`CheckReturn` + `ORDERRETNUM`), службове внесення и видача, `LastShiftTotals`, `CloseShift{ ZRepAuto }`, повторный `CloseShift` → `ZRepAlreadyRegistered`.
7. `GetCheck Availability` без кредов — по настоящему номеру (`ResultCode 0`) и по выдуманному (`1`).
8. Пять чеков подряд — латентность (разработка называет 400–800 мс).
9. Один `ServerState` из прода (`railway ssh`, регион сервиса) — не режет ли запрос гео-ограничение (ответ к).

Каждый прогон кладёт ответы, вывод консоли и `run.json` в `src/__tests__/fixtures/cashalot/runs/<timestamp>/`, как прогоны Checkbox; ключи в фикстурах — заглушки.

Запуск (скрипт `src/pos/fiscal/providers/cashalot/sandbox.ts`, ключи — `CASHALOT_SANDBOX_*` в `.env`):

```bash
npm run fiscal:sandbox:cashalot                 # пробы 1, 7 — только чтение
npm run fiscal:sandbox:cashalot -- --shift      # + 2: тестовая смена
npm run fiscal:sandbox:cashalot -- --sell       # + 3, 4, 5, 8
npm run fiscal:sandbox:cashalot -- --return     # + 6
npm run fiscal:sandbox:cashalot -- --all
```

Скрипт сохраняет запрос рядом с каждым ответом (ключи — `****`), ничего не пишет при открытой фискальной смене и шлёт каждый документ с `TESTING`. Проба 3 дополнительно проверяет ничью ПДВ (12,57 × 20 %) и `UNITCD` числом и строкой с нулём; проба 9 — команда в `src/__tests__/fixtures/cashalot/README.md`. `CASHALOT_SANDBOX_BASE_URL` направляет скрипт на локальную заглушку или свой FS API.

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
- **2026-10-21 (CA2).** Креды v1 — только `KeyGuid` + `KeyPin` (ключ КЕП
  остаётся у Cashalot, в нашей БД его нет). Среди первых магазинов есть
  плательщики ПДВ, поэтому таблица ставок в `config.taxes` и расчёт `CHECKTAX`
  нужны с первого релиза, а не отдельной фазой. `COST` строки — сумма до
  скидки, скидка — отдельным `DISCOUNTSUM`: так в примере ДПС «Знижки», а не
  «`COST` = итог строки», как предполагала гипотеза. Поиск документа по `UID`,
  если понадобится, — только в кроне перед повторной отправкой; живой путь
  после таймаута остаётся как у Checkbox. Примеры документов ДПС сняты с
  `github.com/p2p-sys/OpenPRRO` (MIT): `tax.gov.ua` отвечает 403 и браузеру, и
  `curl`.
- **2026-10-24 (ответы разработки Cashalot, §1a).** Cashalot сам отклоняет
  повтор `UID` (`DuplicatedRequestUid`), поэтому `findByRequestId` из контракта
  выпадает: номер уже зарегистрированного чека находит адаптер и отдаёт его
  через `existingProviderDocId`. `UID` — в корне запроса, не в `CHECKHEAD`.
  Тестовая смена открывается `OpenShift{ TESTING: true }` — виртуальная смена
  не нужна. `renderReceipt` для текста не делаем: ширина только в пикселях.
  `UndefinedRegistrarState` идёт путём `auth_expired` (пересоздать сессию =
  `TransactionsRegistrarState`). Коды единиц — ДК 011-96 (шт 2009, г 0303,
  кг 0301, мл 0144, л 0138), оплата по QR — `PAYFORMCD 306`. Буквы налогов —
  только кириллицей, их не меняют в открытой смене. Касса без интернета на
  облачном WEB API невозможна — ограничение для CA8.
