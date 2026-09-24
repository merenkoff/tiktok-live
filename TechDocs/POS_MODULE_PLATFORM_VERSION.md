# POS module-remote — версия платформы (`PLATFORM_VERSION` ↔ `minHostPlatform`)

Roadmap [#12 трек 2](POS_MODULE_REMOTE_ROADMAP.md). Контракт между **хостом**
(веб-сайт POS или десктоп-касса) и **модулем-remote**, который грузится в него
в рантайме: как хост узнаёт, что модуль собран под более новую поверхность
`@pos/platform`, чем у него есть, — и отказывается его импортировать вместо
того, чтобы упасть.

Связано: [POS_MODULE_REMOTE_SIGNING.md](POS_MODULE_REMOTE_SIGNING.md) (манифест
и подпись) · [POS_API_VERSIONING.md](POS_API_VERSIONING.md) (версия `/api/pos` —
**другой** контракт, это не она).

---

## Проблема

Модуль-remote (`returns`, `tiktok-live`, `fiscal-checkbox`, …) собирается с
`react`/`zustand`/`@pos/platform` как **external** и линкуется с ними в хосте
при `import()`. Именованный импорт (`import { apiOrigin } from '@pos/platform'`)
на хосте, у которого этого экспорта нет, — это `SyntaxError` при линковке, **до**
исполнения хоть одной строки модуля. Пользователь видит пункт меню, который
ведёт в общий `RouteErrorBoundary` без объяснений.

На вебе хост и модуль обычно деплоятся вместе. На кассе хост заморожен неделями
(киоск обновляется редко), а модуль на jsdelivr — новый. `tiktok-live` защищался
вручную (`lib/hostPlatform.ts`: `import * as host` + `missingHostApi()`); у
`returns`/`customers` такой защиты нет, а с #13 B касса применяет их
string-override тем же кодом, что и объектные записи.

## Контракт

| Сторона | Что | Где |
|---|---|---|
| Хост | `PLATFORM_VERSION` — целое, версия поверхности `@pos/platform` + `@pos/platform/ui` | [`pos/src/platform/version.ts`](../pos/src/platform/version.ts), экспортируется из баррела |
| Модуль | `minHostPlatform` в подписанном `manifest.json` = `PLATFORM_VERSION` чекаута, из которого собран | [`pos/scripts/sign-remote.mjs`](../pos/scripts/sign-remote.mjs) через [`scripts/platform-version.mjs`](../pos/scripts/platform-version.mjs) |

Правило: **хост импортирует модуль только если `PLATFORM_VERSION ≥ minHostPlatform`.**
Манифест без поля (собран до 2026-09-09) — `0`, требований нет. `schema` манифеста
остаётся `1`: старые хосты поле игнорируют (TS — лишний ключ, Rust serde — тоже),
новые проверяют.

Дефолт «модуль требует ровно ту платформу, против которой собран» —
консервативный: после бампа `PLATFORM_VERSION` каждая **новая** сборка модуля
требует новый хост, даже если новых символов не использует. Для first-party
модулей, которые выпускаются намеренно (`module-release.yml`), это правильно.
Понижать требование вручную (сайдкар `pos/src/modules/<id>/remote.json`) —
возможное расширение, пока не строим.

## Три точки проверки

| Где | Что происходит | При провале |
|---|---|---|
| **Веб** — `verifyRemoteEntry` ([`remoteVerify.ts`](../pos/src/modules/remoteVerify.ts)) | после подписи и `moduleId`, **до** хэша entry | `RemoteVerifyError('host too old: needs platform N, this build is M')` → `remote_load_fallback`; bundled-модуль остаётся, online-only отсутствует |
| **Касса, сеть** — `sync_module_remote` ([`module_remotes.rs`](../pos/src-tauri/src/module_remotes.rs)) | JS передаёт `hostPlatform: PLATFORM_VERSION`; манифест с `minHostPlatform > host` **не скачивается**, кеш не трогается | `status: 'incompatible'`, `active` = установленная версия, если она сама совместима, `error: 'needs host platform N, this build has M'` |
| **Касса, кеш** — `cachedOnly` там же | `installed.json` хранит `minHostPlatform`; кеш отдаётся только если `≤ host` (кейс даунгрейда приложения) | `offline` + `active: null` → сеть → `incompatible` → плейсхолдер |

Плюс на кассе `applyModuleRemotes` **не синкает** string-override модуля, у
которого в bundled-дескрипторе нет `'cashier'` в `shells` (`stock`, `products`)
— качать их на каждую кассу незачем; телеметрия `remote_load_fallback`
`'web-only module, not synced on the cashier'`.

## Что видит пользователь

- **Веб, Settings → «Модулі магазину».** Кнопка «Перевірити джерело» читает
  подписанный манифест (`inspectRemoteManifest`) и, если
  `minHostPlatform > PLATFORM_VERSION`, пишет жёлтым: «потребує платформу N, тут
  M — сайт і касу треба оновити, доти лишиться вбудований модуль». Сохранение
  **не** блокируется — запись заработает после обновления приложений.
- **Касса, string-override несовместим.** Bundled остаётся; фоновый чек
  (`checkModuleRemoteUpdates`) получает `incompatible` → баннер «Потребує новішої
  версії застосунку: «Чеки та повернення»» с кнопкой «Оновити застосунок» →
  `/hardware` (там живёт обновление). Без reload — он ничего не изменит.
- **Касса, online-only модуль несовместим на холодном старте.** Плейсхолдер как
  обычно; «Спробувати зараз» показывает «Модуль потребує новішої версії
  застосунку каси» вместо «немає з'єднання».

## Когда бампить `PLATFORM_VERSION`

**Вручную, +1**, когда меняется поверхность так, что модуль может на это
опереться: экспорт добавлен или удалён из `@pos/platform` или `@pos/platform/ui`,
изменилась семантика сигнатуры. Внутренние правки без изменения поверхности —
не бампят. `POS_API_CLIENT_VERSION` для этого **не** трогать.

Страховка — [`pos/src/platform/surface.test.ts`](../pos/src/platform/surface.test.ts)
+ [`surface.snapshot.json`](../pos/src/platform/surface.snapshot.json): набор
runtime-экспортов обоих баррелов зафиксирован вместе с версией. Тест падает,
если набор разошёлся со снапшотом или версия в снапшоте не совпадает с
константой. Обновление — `npm run platform:snapshot`; скрипт **отказывается**
записать изменившийся набор без бампа версии.

Что снапшот **не** ловит: изменение типов и сигнатур при том же имени — это
работа ревьюера. Его честный скоуп — класс «не слинковалось», то есть ровно то,
что доходит до пользователя пустым экраном.

## Ограничения

- Хосты, собранные **до** этого механизма, поле не проверяют — на них
  по-прежнему защищает только паттерн `import * as host` (см. `tiktok-live`
  `lib/hostPlatform.ts`, он остаётся).
- Проверяется поверхность `@pos/platform`, не версия `react`/`zustand` —
  они закреплены import map'ом хоста и меняются только релизом приложения.
- Версия `/api/pos` — отдельный контракт (roadmap #1, вторая половина), здесь не
  затрагивается.

## Проверка

- Unit: `remoteVerify.test.ts` (больше/равно/отсутствует), `registry.remotes.test.ts`
  (web-only на кассе не синкается), `desktopRemotes.test.ts` (`incompatible` →
  `needsAppUpdate`), `surface.test.ts`; Rust — `usable_cache`, дефолт поля.
- **e2e на web-пути** — [`pos/e2e/remotes.spec.ts`](../pos/e2e/remotes.spec.ts):
  тест подписывает throwaway-remote dev-ключом прямо в Node и отдаёт его с
  фейкового CDN через `page.route`; совместимый → в nav «Продажі (remote)»,
  `minHostPlatform + 1` → bundled «Продажі». Для этого e2e-сборка идёт с
  `VITE_REMOTE_ALLOW_DEV_KEY=1` (`playwright.config.ts`).
- Tauri-путь в браузере не воспроизводится — ручной чек-лист в roadmap #12.

## Історія версій

| `PLATFORM_VERSION` | Дата | Что добавилось | Кому понадобилось |
|---|---|---|---|
| 1 | 2026-09-09 | базовая поверхность на момент введения контракта (снапшот) | — |
| 2 | 2026-09-09 | `useOfflineStatus`, `registerOfflineModules` (+ тип `ModuleOfflineHooks`) | `stocktake` — первый модуль со своими оффлайн-данными ([POS_MODULE_OFFLINE_DATA.md](POS_MODULE_OFFLINE_DATA.md)) |

Бамп 1 → 2 — первая живая проверка механизма: `npm run platform:snapshot`
отказался записать изменившийся набор экспортов без бампа, после бампа
`sign-remote.mjs` стал писать `minHostPlatform: 2` в манифесты, и модули,
собранные после этого, не загрузятся в хост с версией 1.

### 3 (2026-09-17) — вертикалі продажів

`@pos/platform` отримав `useVertical` (схема атрибутів і одиниці магазину),
`@pos/platform/ui` — `AttributeFields` (поля, побудовані з цієї схеми).
Потрібні модулям, які редагують товар або малюють екран продажу під свою
вертикаль. Див. TechDocs/POS_VERTICALS.md.

### 4 (2026-09-17) — слот екрана продажу

`useSalesCatalog` (перегляд каталогу: теги, папки, пошук, сканування) і
компоненти, з яких вертикаль будує свій екран: `ProductTile`, `TagFolderTile`,
`VariantPicker`, `CatalogTagBar`, `ScanWedge`. Каркас каси (кошик, оплата,
ПРРО, чек) у платформу **не** виноситься — він лишається в хості.

### 5–12 (2026-09-17 … 2026-09-18) — стіл флориста

`startOfflineRuntime`/`refusalText` (5), `addAssembled` + `setQty`/`remove` за
`uid` (6), `withLabour`/`priceOfComponents`/`customBouquetLabel` (7),
`buildPriceTags`/`PriceTagsPrintable`/`triggerPrint` (8), `api.writeOffShowcase`
(9), `api.uploadBouquetPhoto`/`setShowcasePhoto` (10), `api.saveBouquetRecipe`
(11), `api.getFlowerAnalytics` (12) — усе для `vertical-flowers`, див.
TechDocs/POS_FLORIST_BENCH.md і коментар до `PLATFORM_VERSION` у `version.ts`.

### 13 (2026-09-19) — модифікатори на касі

Для кафе (TechDocs/POS_CAFE.md §3, фаза К2). `useCartStore.addItem` отримав
третій аргумент — `{ modifiers, note }`, відповіді й кухонний коментар рядка,
а `CartLine` — поля `modifiers`/`note`. Це зміна **сенсу** сигнатури, яку
снапшот імен не бачить: модуль, зібраний проти 13, на хості 12 злінкується, а
третій аргумент буде мовчки проігноровано і кожен латте піде за ціною картки —
тому бамп. `@pos/platform` експортує дзеркала серверної арифметики
(`resolveLineModifiers`, `lineCaption`, `cartLineUid`, `defaultModifierIds`,
`needsModifierSheet`, `shiftCompareAt`, `groupsOf`…) з `lib/modifiers.ts`, щоб
модуль їх не копіював; `@pos/platform/ui` — `ModifierSheet` (усі питання про
товар на одному листі, ціна відповіді на кнопці); `ProductTile` — `onMore`,
кутова кнопка «⋯». `Coffee` — у `NAV_ICONS`. `VerticalPublicConfig` несе
`maxCompositionDepth`.

### 14 (2026-09-21) — передчек

`@pos/platform` експортує `printPrecheck` і типи `PrecheckData`/`PrecheckItem`
(`lib/printer.ts`) — обгортку над десятою Tauri-командою, `print_precheck`.
Потрібна модулю `tables`: гості просять рахунок, і те, що їм дають на руки, —
**не** розрахунковий документ (TechDocs/POS_TABLES.md §4.5). Команда лишається
хостовою навмисно: модуль, який сам дотягнувся б до `invoke`, привіз би другу
копію Tauri API і вийшов би з цього контракту зовсім. Хост 13 модуля столів,
зібраного проти 14, не завантажить — і це правильно: на ньому кнопка
«Передчек» не мала б чим друкувати, а позначку про друк ставить сервер.

### 15 (2026-09-22) — фасування

К5b ([POS_CAFE.md](POS_CAFE.md)). `@pos/platform` експортує `packOf` /
`packToBase` / `baseToPack` / `toBase` / `packHint` / `defaultPackMode` з
`lib/pack.ts` — скільки базових одиниць в одній пляшці і як екран, що
приймає кількість, перераховує набране **до** того, як воно піде на сервер.
Та сама арифметика потрібна трьом модулям (`products`, `stock`, `stocktake`),
тому її видано з платформи, а не скомпільовано в кожен.

### 16 (2026-09-23) — планшет як PWA

[POS_PWA.md](POS_PWA.md). `PosShell` отримав третє значення, `'tablet'`:
модуль, що перевіряє `shell === 'cashier'` у сенсі «є десктопною касою»
(друк, тримання ПРРО-регістру), лишається правильним; той, що перевіряв
`=== 'web'` у сенсі «не каса», — ні (`tables` тепер `mirrored: shell !==
'web'`). Це зміна **сенсу**, яку снапшот імен не бачить — тому бамп. Разом із
тим `@pos/platform` експортує `enableOfflineReads` / `isOfflineReadsEnabled` /
`offlineMode` поруч із `isOfflinePosEnabled` (планшет читає дзеркало, але
ніколи не ставить запис у чергу) і `OfflineWriteError` — те, що запис без
мережі там кидає. Хост 15 бандл, зібраний проти 16, не завантажить, і це
правильно: на ньому `runsInShell` ще нема, а бандл із `shells: ['web',
'cashier', 'tablet']` він і так читає як «обидві старі» — просто планшета там
не існує.

### 17 (2026-09-24) — гліфи замість lucide

Каса переходить на власний набір іконок у стилі Things (`design/README.md`):
`scripts/gen-icons.mjs` генерує `src/platform/glyphs.tsx` з `design/icons/`,
а `@pos/platform/ui` реекспортує всі гліфи — кольорові на сітці 24 px зі своїм
відтінком, службові на 20 px (для дрібних — окремий малюнок на 16 px) у
`currentColor` — плюс `Glyph` / `GlyphProps` / `COLOR_GLYPHS` / `UI_GLYPHS`.
Імена нових експортів — отже бамп. `NAV_ICONS` лишив **ті самі ключі** (їх
зберігають `nav_overrides` і `module_remotes`), але тепер веде на гліфи і
отримав `ChefHat`, `Table`, `ShieldCheck`, `UtensilsCrossed`; де ім'я належить
службовому гліфу (`Search`, `Camera`, `Printer`, `RefreshCw`, `MapPin`), ключ
веде на кольоровий із суфіксом (`SearchColor`…). Старий модуль, що малював
lucide, на цьому хості працює як і був — жоден його імпорт не зник; новий,
зібраний проти 17, на хості 16 не завантажиться, і це правильно: там нема
`@pos/platform/ui` з гліфами.

До випуску 17 у ту саму версію увійшли ще (вона не була опублікована, тож
окремого бампу нема): гліфи `ChevronLeft`, `Banknote`, `Split`; каркас екрана
власника в мові Things — `PageHeader` (заголовок із кольоровим гліфом, «назад»,
дії), `SectionHead` (синій заголовок секції над волосяною лінією) і `Segmented`
(сегменти) — щоб сторінка модуля виглядала як сторінка хоста без копіювання
розмітки; `ModifierSheet` віддає ще й `quantity` (крокер у шторці) і приймає
`withQuantity` / `notePlaceholder`. Класи `.sq-input`, `.sq-btn-quiet`,
`.sq-row`, `.sq-table` живуть у `styles/tokens.css` і приходять разом зі
сторінкою хоста.
