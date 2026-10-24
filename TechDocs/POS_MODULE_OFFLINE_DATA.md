# POS module-remote — модуль со своими оффлайн-данными

Roadmap [#12 трек 3](POS_MODULE_REMOTE_ROADMAP.md). Как feature-модуль, который
доставляется отдельно от приложения (#13) и гейтится версией платформы
([POS_MODULE_PLATFORM_VERSION.md](POS_MODULE_PLATFORM_VERSION.md)), держит
**свои** данные на кассе без сети и отдаёт их на сервер, когда сеть появится.
Worked example — модуль **`stocktake`** («Інвентаризація»): продавец считает
товар на кассе сканером, лист уезжает на сервер черновиком документа
`inventory`, проводит его владелец на вебе.

Связано: [POS_DESKTOP.md](POS_DESKTOP.md) (оффлайн-слой оболочки) ·
[POS_POST_MVP.md](POS_POST_MVP.md) P4.

---

## Модель

Оболочка знает про модуль ровно две вещи: **сколько у него строк ждёт сервера**
и **как попросить его отправить очередь**. Всё остальное — схема, снапшот,
backoff, идемпотентность, dead-состояние — принадлежит модулю.

```ts
// pos/src/modules/types.ts
export interface ModuleOfflineHooks {
  pendingCount(): Promise<number>;   // → «Очікує синк: N» на кассе
  sync(): Promise<void>;             // после очереди оболочки, на её триггерах
}
ModuleDescriptor.offline?: ModuleOfflineHooks;   // и RemoteModuleDescriptor
```

| Сторона | Отвечает за |
|---|---|
| **Оболочка** (`pos/src/offline/`) | вызвать `sync()` каждого модуля **после** своих клиентов и продаж (`sync.ts` `runSync`) на тех же триггерах — `online`, интервал 30 с, после логина; сложить `pendingCount()` в `useOfflineStatus.pending` (`status.ts`, плюс `modulePending` по id); поймать `throw` из хука, показать в баннере, идти дальше |
| **Модуль** | своя IndexedDB (`new Dexie('cloth-pos-module-<id>')`, версионируется модулем); своя очередь и retry-policy; идемпотентность по `client_uuid`; терминальное состояние для строк, которые сервер никогда не примет; на веб-шелле (нет runtime) — вызвать `sync()` самому сразу после записи |

### Почему своя БД, а не таблицы в `cloth-pos-offline`

Dexie версионирует базу как одну схему. Модуль, выпускаемый на своей каденции,
не может участвовать в истории версий оболочки: любое его изменение стало бы
миграцией чужой БД. Отдельная база = отдельная история, и удаление модуля не
трогает очередь продаж.

### Регистрация без цикла импортов

`offline/sync.ts` и `offline/status.ts` собраны в чанк `@pos/platform` и **не
могут** импортировать реестр модулей (реестр → манифесты → страницы →
`@pos/platform`). Поэтому лист-сим `pos/src/offline/moduleHooks.ts` (без
импортов): `registerOfflineModules(descriptors)`, `syncOfflineModules(onError)`,
`modulePendingCounts()`. Хост регистрирует хуки загруженных дескрипторов после
`applyModuleRemotes()` — `cashier-main.tsx` и `main.tsx` — **через
`@pos/platform`** (`registerOfflineModules`): относительный импорт дал бы хосту
вторую копию реестра, которую цикл синка в платформенном чанке никогда не
прочтёт (`check-platform-boundary.mjs` это ловит). Модуль сам ничего не
регистрирует — он данные, хост его читает.

## Поверхность платформы

Этот трек — **первый бамп `PLATFORM_VERSION` → 2**: в `@pos/platform`
добавились `useOfflineStatus` (флаг `online` для честного UI) и
`registerOfflineModules` (только для хоста). Всё остальное, что нужно модулю, уже
было: `api`, `cashierApi.getCatalog` (каталог из кеша оболочки оффлайн),
`isOfflinePosEnabled`, `isNetworkError`, `isUnauthorized`, `useAuthStore`,
`BarcodeScanner` из `@pos/platform/ui`.

## Worked example: `stocktake`

`pos/src/modules/stocktake/`, собирается `vite.stocktake-remote.config.ts`
(`dexie` — external, как `react`/`zustand`: модуль работает на Dexie хоста),
подключается объектной записью в `module_remotes`:

```json
"stocktake": { "url": "…/stocktake/remote-entry.js", "title": "Інвентаризація",
  "routePath": "/stocktake", "nav": [{ "label": "Інвентаризація", "location": "cashier-primary", "order": 70 }],
  "icon": "ClipboardCheck" }
```

| Слой | Файл | Что |
|---|---|---|
| БД | `data/db.ts` | `sheets` (`id` = uuid = `client_uuid`, `storeId`, `status`: `counting → queued → synced` / `error` / `dead`, `attempts`, `lastError`, `serverDocNumber`) и `lines` (`[sheetId+variantId]`, `countedQty`, `label`, `barcode`) |
| Репозиторий | `data/repository.ts` | `startSheet`, `addCount` (скан = +1), `setCount`, `removeLine`, `finishSheet` (→ `queued`, пустой лист отказ), `discardSheet` (не для `synced`); `lookupByBarcode` — точное совпадение, `searchCatalog` |
| Очередь | `data/sync.ts`, `data/policy.ts` | `pendingCount` = `queued + error`; `syncSheets`: сеть → без сжигания попытки; 4xx → `dead/rejected`; 5xx → `error` с backoff `[2,5,15,30,60] с`, `MAX_ATTEMPTS = 8` → `dead/attempts_exhausted`; 401 → прервать проход. Копия чисел из `offline/outboxPolicy.ts` — policy не на поверхности платформы |
| UI | `pages/StocktakePage.tsx`, `pages/CountSheetPage.tsx` | список листов; лист: ввод/сканер (USB-сканер как клавиатура, камера — `BarcodeScanner`), поиск, ±/ввод количества, «Завершити і відправити». Статусы отражают очередь, оффлайн-подсказка через `useOfflineStatus` |
| Манифест | `manifest.ts` | `offline: { pendingCount, sync: syncSheets }` |

### Бэкенд: одна идемпотентная сдача

`POST /api/pos/stock/counts` `{ client_uuid, note?, lines: [{ variant_id,
counted_qty }] }` — `stock.routes.ts`, гейт **`ensureModule(…, 'stock')` без
owner**: любой сотрудник магазина, но только там, где включён `stock` (владельцу
нужно где-то проводить). `submitCount` в `stock-documents.service.ts`: одна
транзакция, повтор по `client_uuid` возвращает тот же документ (200 vs 201),
гонка двух повторов упирается в частичный уникальный индекс
(`migrations/025_pos_stock_document_client_uuid.sql`) и тоже возвращает
победителя. Строки получают `system_qty` на момент сдачи и `counted_qty` из
листа. **Остатки не трогаются** — документ `draft`, проводит владелец на вебе
(`StockInventoryPage`, там же `refresh-system-qty`).

## Второй модуль: `debts` («Борги», Г3 PR3)

`pos/src/modules/debts/data/` — очередь выдач «під запис», записанных десктопной
кассой без сети, и **зеркало** кредита покупателей, по которому касса без сети
судит лимит (решения — `TechDocs/grocery/G3_DEBTS.md` §6). Отличия от
`stocktake`, которые стоит знать следующему модулю:

| Что | Как |
|---|---|
| БД | `cloth-pos-module-debts`: `issues` (`id` = `client_uuid`, `queued → error → dead`; отправленная строка удаляется в одной транзакции с записью ответа в зеркало), `credit` (`[storeId+customerId]`, слово сервера), `meta` (`filledAt:<storeId>` — касса хоть раз получила список) |
| Неизвестный исход онлайн | запрос без ответа (тайм-аут) тоже ложится в очередь **под тем же ключом**: если он дошёл, отправка из очереди — повтор (`replay: true`), не второй долг |
| Зеркало | у хуков нет «оболочка обновила снапшот», поэтому `sync()` после очереди читает `GET /debts?all=1` (всегда после отправки, иначе не чаще раза в минуту); каждая онлайн-отдача кредита пишет строку сама (`publishCredit`). Строка, записанная после начала чтения списка, новее ответа и остаётся; полная страница (500) никого не удаляет |
| Магазин | `pendingCount()` и `sync()` берут только строки магазина текущей сессии (`api.loadAuth()`): чужие строки этот токен не подаст |
| Политика | как у `stocktake`, плюс 408 и 429 — не отказ, а повтор |
| Экран | «мёртвая» строка не исчезает сама: «Борги» показывают её со словами сервера, «Надіслати ще раз» / «Прибрати» (после предупреждения); список и выписка перечитываются, когда строка ушла из очереди — иначе при возврате сети страница читает сервер раньше, чем очередь успевает отправить |
| Бэкенд | `POST /api/pos/debts/issue` с `offline_at`: записывает, не судит (лимит, блок, архив, стоп-лист), датирует временем кассы (не в будущем, не старше 90 дней), помечает `offline_received_at` (миграция `074`) |

Тесты — `debts/data/sync.test.ts` (`fake-indexeddb/auto`), `*.desktop.test.tsx`
(мок `isOfflinePosEnabled: () => true`).

## Чек-лист: следующий модуль с оффлайн-данными

1. Своя Dexie-БД `cloth-pos-module-<id>`; ключ идемпотентности генерируется
   на клиенте и хранится в строке.
2. Бэкенд: один идемпотентный endpoint под этот ключ (`client_uuid` + частичный
   уникальный индекс `(store_id, client_uuid)`), гейт по роли/модулю осознанно.
3. `pendingCount()` считает только то, что ещё может уехать (не `dead`).
4. `sync()`: сеть — не попытка; 4xx — терминально; 5xx — backoff и потолок;
   401 — прервать проход; никогда не `throw`.
5. На веб-шелле после записи вызвать `sync()` самому.
6. `offline: { pendingCount, sync }` в манифесте — и всё, регистрирует хост.
7. Если модулю нужно из `@pos/platform` что-то новое — это бамп
   `PLATFORM_VERSION` и `npm run platform:snapshot`.
8. Тесты данных — `fake-indexeddb/auto` (см. `stocktake/data/*.test.ts`).

## Что не сделано осознанно

- **Снапшот-хук** (`onSnapshot`) — `stocktake` читает каталог из кеша оболочки,
  а `debts` обновляет своё зеркало в конце `sync()` (единственный момент, когда
  сеть точно есть). Если появится третий модуль со своим снапшотом — добавить
  `snapshot?(): Promise<void>` в хуки и вызов из `refreshSnapshot`.
- Проводка документа с кассы; слияние листов с нескольких касс (лист = документ).
- Общий outbox/policy на поверхности платформы — два потребителя (`stocktake`,
  `debts`) держат свою копию чисел; поднимать на поверхность — бамп платформы.
- Модуль не уменьшает остатки в каталоге кассы (у модулей нет такого API): товар,
  выданный «під запис» без сети, остаётся в локальном остатке до синка, после
  которого снапшот оболочки приносит цифры сервера.

## Проверка

- pos: `moduleHooks.test.ts`, `stocktake/data/{repository,sync}.test.ts`,
  `surface.test.ts` (v2); root: `pos.stock-documents.test.ts` (`submitCount`),
  `pos.routes.stock.test.ts` (`/stock/counts`: seller 201/200, 400, 404).
- e2e `pos/e2e/stocktake.spec.ts`: настоящий подписанный бандл с фейкового CDN
  в веб-шелле — скан, ±, «Завершити», один `POST /stock/counts` с `client_uuid`.
- Живой прогон на `dist-cashier` — чек-лист в плане трека (оффлайн-лист → «В
  черзі» → сеть → «Надіслано», повтор не создаёт второй документ).
