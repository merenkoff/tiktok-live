# POS: вертикалі продажів (одяг / квіти / кафе)

Дизайн-документ і **точка відновлення роботи**. Таблиця фаз унизу — оновлюйте її,
коли фаза лягає.

## 1. Навіщо

POS будувався навколо одного способу продажу — магазин одягу: варіант товару має
розмір і колір, продається поштучно, екран каси показує плитки товарів і вибір
варіанта. Усе інше (оплата, чек, ПРРО, повернення, склад, аналітика) до цього
байдуже.

Продукт має обслуговувати й інші типи роздрібу. Найближчий — квітковий магазин
(орієнтир Posiflora: стебла, довжина, країна, згодом букети зі списанням
компонентів), далі — кафе (техкарти, модифікатори). Тому **вертикаль** стає
явним поняттям: вона задає схему атрибутів товару, дозволені одиниці виміру та
який модуль малює каталог на екрані продажу.

## 2. Модель

Одна колонка `pos_stores.vertical` (міграція `034`) — id вертикалі. Набір
вертикалей живе **в коді** (`src/pos/verticals/`), а не в CHECK-констрейнті:
нова вертикаль не має вимагати міграції, рівно як і новий провайдер ПРРО
(`isFiscalProviderId`). Значення, якого збірка не знає, деградує до `clothing`
на читанні (`verticalOrDefault` + `logger.warn`) — логін магазину не падає
ніколи.

```
VerticalDefinition {
  id, title,
  attributes: AttributeSpec[],   // key, label, type, options?, unitSuffix?, required?, inLabel?, inSearch?
  units,                         // units[0] — за замовчуванням
  labelOf(attrs) → string,       // правило підпису варіанта
  productKinds                   // ['simple'] зараз; 'composite' зарезервовано
}
```

`VerticalPublicConfig` — те, що їде на клієнт: схема й одиниці, **без функцій**.
Клієнт рендерить поля за схемою і читає готовий `label` із сервера; сам він
підписів не збирає (до цієї роботи таких композиторів було чотири, з трьома
різними роздільниками).

### Хто змінює

Тільки супер-адмін (`PATCH /api/pos/super/stores/:id`). Власник бачить тип
магазину read-only в «Налаштуваннях». Причина: вертикаль визначає схему
атрибутів каталогу, який власник уже наповнив; зміна перебудовує підписи всіх
варіантів (міграція `035` додає цей перерахунок у ту саму транзакцію, поруч із
`UPDATE`). Колонки свідомо немає в `STORE_PATCH_COLUMNS` — саме це робить її
недоступною власницькому `PATCH /store`, який до того ж відповідає 400 на
`vertical` у тілі.

### Модуль вертикалі

Клієнтський id — `vertical-<id>`. `vertical-clothing` **вбудований** у застосунок
(див. §3), решта приїжджає онлайн-модулем через `pos_stores.module_remotes`, як
`tiktok-live`. Правило `assertSingleVerticalRemote` (`src/pos/core/modules.ts`,
близнюк `assertSingleFiscalRemote`): не більше одного запису `vertical-*`, і він
має збігатися з колонкою. Інакше каса завантажила б модуль, якого екран продажу
ніколи не спитає. `vertical-clothing` заборонений як запис узагалі — це fallback,
і магазин не повинен мати способу його втратити.

## 3. Екран продажу — слот, а не маршрут

`/register` лишається за вбудованим core-модулем `catalog-checkout`. Його
сторінка — **каркас**: кошик, оплата, обробка відмов ПРРО, екран успіху, друк
чека, скасування щойно пробитого. Каталог (теги-папки, пошук, сканер, плитки,
вибір варіанта) постачає активна вертикаль через `ModuleDescriptor.sales.Catalog`
— за зразком `ModuleDescriptor.offline`: модуль сам себе не реєструє, він дані,
які читає хост.

Чому не «вертикаль володіє маршрутом `/register`»:

- `/register` зашито в хості тричі (`homePath`, редірект `Guard`, fallback
  індексу `/admin`);
- колізії root-маршрутів вирішуються мовчки порядком масиву — bundled завжди
  перемагає remote;
- **веб не рендерить заглушку** для невдалого online-only модуля: ні пункту меню,
  ні маршруту. Магазин, чий єдиний екран продажу — remote, при недоступному CDN
  лишився б без каси;
- оплату, чек і ПРРО довелося б експортувати з платформи.

Резолвер бере `vertical-<store.vertical>` серед `allModules()`; якщо його немає,
він ще не завантажений (`pending`) або впав при рендері — каталог береться з
`vertical-clothing`. Тобто каса продає завжди.

## 4. Атрибути й одиниці (фаза 2)

`pos_variants.size/color` → `attributes jsonb` + похідна збережена `label` +
`unit`. `label` перераховується сервісом на кожному записі варіанта, тому пошук,
`ORDER BY`, звіти складу й дедуп плейсхолдерів працюють по звичайній колонці.
Міграція `035` заповнює обидві точно сьогоднішнім правилом одягу
(`concat_ws(' / ', color, size)`), тож жоден наявний магазин не побачить іншого
підпису; `036` прибирає старі колонки вже після деплою.

`quantity` лишається INTEGER у базовій одиниці (250 г = 250). Це навмисно:
`quantityMilli` у ПРРО, `i64` у Rust-друку і виведення знижки в payload Checkbox
розраховані на цілі одиниці. Дробові кількості (NUMERIC) — окрема майбутня
робота, не потрібна ні квітам (стебла), ні першій ітерації кафе.

## 5. Готовність до наступних вертикалей

Квіти (букет = квіти + витратні, авто-списання при продажу) і кафе (техкарта з
інгредієнтів, модифікатори) потребують **одного й того самого** механізму —
складеного товару з компонентами, що списуються. Він не будується зараз, але
схема його не блокує: `pos_products.kind` (`'simple'` | `'composite'`, міграція
`035`), майбутня таблиця компонентів і `unit`, який робить компоненти
обчислюваними.

## 6. Як додати вертикаль

1. `src/pos/verticals/<id>.ts` — визначення; додати в `BUILT_IN`
   (`src/pos/verticals/index.ts`).
2. `pos/src/types.ts` `VerticalId` + `pos/src/lib/vertical.ts` `VERTICAL_OPTIONS`
   (паритет пінить `pos/src/lib/vertical.test.ts`).
3. Модуль `pos/src/modules/vertical-<id>/` з `sales.Catalog`, `remote-entry.ts`,
   `lib/hostPlatform.ts`; `pos/vite.vertical-<id>-remote.config.ts`; скрипти
   `build:`/`serve:`/`check:…-css-coverage` у `pos/package.json`.
4. Seed (`src/pos/seed.ts`, opt-in через env) і e2e за зразком
   `pos/e2e/stocktake.spec.ts`.
5. Супер-адмін: тип магазину + запис `vertical-<id>` у `module_remotes`.

## 7. Фази

| # | Фаза | Що постачає | Стан |
|---|---|---|---|
| 1 | Ідентичність вертикалі | `034`, реєстр `src/pos/verticals`, `assertSingleVerticalRemote`, ланцюг auth → каса, super PATCH `vertical`, read-only поле власника | **зроблено** |
| 2 | Атрибути / label / unit | `035`, наскрізна заміна `size`/`color`, `PLATFORM_VERSION` 3, API v2, `AttributeFields` | **зроблено** |
| 3 | Слот екрана продажу | `ModuleDescriptor.sales`, вбудований `vertical-clothing`, каркас + fallback, `useSalesCatalog` у платформі, `PLATFORM_VERSION` 4 | **зроблено** |
| 4 | Remote `vertical-flowers` | модуль, збірка, підпис, seed, e2e | **зроблено** (тонкий) |
| 5 | Прибирання | `036` (drop `size`/`color`), реліз 2.0.0, перепублікація remote-модулів | файл `036` готовий; чекає **наступного** деплою |
| 6 | Повні квіти | букети: `kind='composite'`, компоненти, авто-списання | не почато |
| 7 | Кафе | техкарти, напівфабрикати, модифікатори | не почато |

## 7a. Що вже лежить (фаза 2)

- `pos_variants`: `attributes jsonb` + похідна `label` + `unit`; `pos_sale_items.unit`
  (снапшот); `pos_stock_document_lines`: `placeholder_attributes/label/unit` і
  новий unique-індекс по `(document_id, lower(name), placeholder_attributes)`;
  `pos_products.kind` — резерв. Старі `size`/`color` ще на місці до `036`.
- Кожен запис варіанта йде через `normalizeVariant` (`src/pos/verticals/attributes.ts`):
  невідомий атрибут або чужа одиниця — 400, `label` завжди перераховується і
  ніколи не приходить від клієнта. Оновлення замінює bag **цілком** — інакше
  «очистити атрибут» не виражається.
- Пошук каталогу: `label` + атрибути з `inSearch` (`jsonb_each_text`), офлайн
  дзеркалить це через `filterCatalog(..., searchKeys)`; ключі передає екран
  продажу з `useVertical()`.
- Чотири клієнтські композитори підпису видалені: кошик, офлайн-чек, цінники і
  stocktake читають `label`.
- Зміна вертикалі супер-адміном перебудовує підписи всіх варіантів магазину в
  тій самій транзакції (`relabelStoreVariants`), не чіпаючи атрибути — тому
  повернення назад відновлює підписи байт-у-байт.
- Версії: `POS_API_VERSION`/`POS_API_CLIENT_VERSION` = 2, `PLATFORM_VERSION` = 3.

## 7b. Що вже лежить (фаза 3)

- `ModuleDescriptor.sales.Catalog` — аналог `offline`: модуль не реєструє себе,
  це дані, які читає хост. `SalesCatalogProps = { active, stockEpoch }`.
- `RegisterPage` тепер каркас (~500 рядків замість 744): кошик, оплата, відмови
  ПРРО, екран успіху, друк, скасування щойно пробитого. Каталог приходить з
  вертикалі.
- `useSalesCatalog` (теги, папки, пошук, сканування, `refresh`) і компоненти
  каталогу (`ProductTile`, `TagFolderTile`, `VariantPicker`, `CatalogTagBar`,
  `ScanWedge`) — у `@pos/platform` / `@pos/platform/ui`, `PLATFORM_VERSION` 4.
- `vertical-clothing` — вбудований core-модуль **без маршрутів і меню**
  (`registry.test.ts` це пінить): `/register` лишається за `catalog-checkout`.
  Статичний імпорт — lazy fallback міг би сам не доїхати.
- `resolveSalesCatalog` (`modules/verticals.ts`) + `CatalogBoundary`: `missing` /
  `pending` / `no_sales_slot` / `render_error` → вбудований каталог, подія
  телеметрії `vertical_catalog_fallback` (лише коли вертикаль не clothing).
- `active` віддає фокус сканера, коли зверху модалка оплати, мобільний кошик або
  екран успіху; `stockEpoch` інкрементується після продажу / kept-unfiscalised /
  скасування — каталог перечитує залишки, зберігаючи теги й пошук.
- У «Налаштуваннях» вертикалі не показуються у списку core-модулів: тип магазину
  обирає супер-адмін, а вимкнути fallback не можна.

## 7c. Що вже лежить (фаза 4)

`pos/src/modules/vertical-flowers/` — перша вертикаль, що приїжджає в магазин
модулем: `manifest.ts` (`alwaysEnabled`, `sales.Catalog`, маршрут `/flowers/*` +
пункт меню), `FlowersCatalog.tsx` (та сама сітка, але бейдж «N шт» стебел і
підпис `Червона · 60 см`), `pages/FlowersHomePage.tsx`, `lib/hostPlatform.ts`
(namespace-import + `REQUIRED_HOST_API`; несумісний хост кидає в
`CatalogBoundary`, і каса продає на вбудованому каталозі).

Збірка: `pos/vite.vertical-flowers-remote.config.ts` + `npm run
build:vertical-flowers-remote` (підпис) + `check:vertical-flowers-css-coverage`.
Камера (`html5-qrcode`, ~500 кБ) винесена в окремий чанк дин-імпортом **по
шляху файлу**, а не через barrel — barrel уже в статичному графі, і динамічний
імпорт його не ділить. Каталог: 15 кБ замість 524 кБ.

Seed: `POS_SEED_VERTICAL_FLOWERS=1 npm run pos:seed` створює **окремий** магазин
`demo-flowers` (owner `owner@flowers.shop`/`owner123`, PIN `1234`), 5 позицій
стебел через `createProductInTx` і запис `module_remotes['vertical-flowers']`
(URL з `POS_SEED_VERTICAL_FLOWERS_URL`, типово `http://localhost:5007`).

E2E `pos/e2e/vertical-flowers.spec.ts`: реально зібраний підписаний бандл із
фейкового CDN → `/register` малює каталог модуля → продаж проходить каркасом
хоста; і другий тест — CDN лежить, каса **все одно продає** на вбудованому
каталозі.

## 7d. Фаза 5 — що саме лишилося

`migrations/036_pos_drop_variant_size_color.sql` **написано, але свідомо не
додано до `POS_MIGRATIONS`** (`src/pos/migrations.ts`). Це не недогляд:

- міграції накочуються **до** того, як піднімається новий образ. У вікні між
  ними старий бекенд 1.x усе ще виконує `SELECT v.size, v.color` і пише їх при
  кожному редагуванні варіанта;
- саме тому `035` тільки додає колонки — щоб те вікно було нешкідливим. Якщо
  зареєструвати `036` у тому самому релізі, він впаде в те саме вікно і кожен
  запит каталогу поверне 500, поки новий образ не підніметься.

Порядок такий:
1. Задеплоїти поточну гілку (міграції `034`+`035`, бекенд і клієнт 2.0.0).
2. Переконатися, що прод працює на новому образі.
3. **Наступним** релізом: додати `'036_pos_drop_variant_size_color.sql'` у
   `POS_MIGRATIONS`, задеплоїти. Він повторює backfill (ловить рядки, які
   старий бекенд міг записати між кроками) і лише потім робить DROP.
4. Реліз `pos-release` з `bump: major` → 2.0.0; далі `module-release` для
   `stocktake`, `tiktok-live`, `fiscal-checkbox`, `vertical-flowers` і
   `POST /super/module-remotes/repoint` для кожного магазину — збірки 1.x
   читають `item.size` і показуватимуть самі назви товарів.

## 8. Ланцюг даних (де шукати при правках)

`pos_stores.vertical` → `core/auth.ts getAuthByToken` (явний SELECT) →
`PosAuthContext.vertical` → `auth.service.ts toAuthResponse` →
`AuthResponse.store.vertical` → `pos/src/types.ts` (optional: старий кеш) →
`offline/db.ts StaffUnlockRow.vertical` (неіндексоване — без Dexie-bump) →
`offline/auth-local.ts` (`saveStaffUnlock`, `updateStaffUnlockStoreFlags`,
`sessionFromUnlock` → `DEFAULT_VERTICAL`). Плюс `GET /store` через
`analytics.service.ts mapStore`.

Каса, якій змінили вертикаль, поки вона офлайн, продає на закешованій до
наступного онлайн-логіну; далі `useAuthStore` перерезолвить слот без
перезавантаження, а зміну `module_remotes` підхопить наявний банер
«Перезавантажити».

## 9. Тести

- `src/__tests__/pos.verticals.test.ts` — реєстр, деградація невідомого id,
  правила підпису (включно з «одяг байт-у-байт як було»), нормалізація
  атрибутів і одиниць.
- `src/__tests__/pos.modules.test.ts` — `assertSingleVerticalRemote`.
- `src/__tests__/pos.routes.super.test.ts` — PATCH `vertical`, конфлікти в обидва
  боки, спільний PATCH.
- `src/__tests__/pos.routes.store.test.ts` — власник не пише `vertical`; гвард
  `vertical-*` на власницькому роуті.
- `src/__tests__/pos.routes.auth.test.ts` — `/me` несе `store.vertical`.
- `pos/src/lib/vertical.test.ts` — паритет клієнтського дзеркала з бекендом.

## Пов'язане

- `TechDocs/POS_MODULE_REMOTE_ROADMAP.md` — #14
- `TechDocs/POS_MODULE_CORE_ANALYSIS.md` — вердикт «`catalog-checkout` — це
  платформа, не модуль» переглянуто у фазі 3: платформою лишається каркас,
  каталог стає слотом
- `TechDocs/POS_SUPER_ADMIN.md` — третє поле, яке править супер-адмін
- `TechDocs/POS_MODULE_PLATFORM_VERSION.md` — бамп до 3 у фазі 2
