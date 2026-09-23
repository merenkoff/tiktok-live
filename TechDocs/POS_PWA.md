# POS: планшет офіціанта як PWA

Дизайн-док **і точка відновлення** для PWA-треку — того, що
[POS_TABLES.md](POS_TABLES.md) §4.12 відклав «окремою роботою після К4».
Таблиця фаз у §8; оновлюйте її, коли фаза сідає.

К4 дав ресторану планшет офіціанта — той самий веб-деплой, що й кабінет
власника, — і чесно сказав, що без мережі він не працює зовсім: офлайновий
рантайм вмикався єдиним викликом з `cashier-main.tsx`, у `pos/` не було ні
service worker, ні webmanifest, а remote-бандл модуля тягнувся з CDN щосесії.
Три посібники так і обіцяли людям. Цей трек — «про оболонку цілком, а не про
рахунки»: service worker, кеш remote-бандлів, оновлення версій, і рівно той
офлайн, який у зали є сенс мати.

Рішення власника (AskUserQuestion, 2026-09-23):

| питання | відповідь |
|---|---|
| наскільки офлайновим має бути планшет | **читати офлайн, писати онлайн** — як каса після К4j |
| кому вмикати офлайн-рантайм на вебі | **окремий entry `tablet`** зі своїм shell, не кабінету власника |
| як застосовувати нову версію хост-бандла | **банер + при наступному запуску**, ніколи посеред рахунку |

---

## 1. Що планшет є і чим не є

Планшет — **третій shell**, `'tablet'` поруч із `'web'` і `'cashier'`
(`pos/src/shell.tsx`). Той самий деплой і origin, що й `web`
(`pos.the-live.shop`), під префіксом `/tablet/`: власник у своїй вкладці
`/admin` нічого не помічає, а офіціант, що додав `/tablet/` на початковий
екран, отримує застосунок, який відкривається без мережі.

Екрани — касові: `/register`, `/orders`, `/customers`, `/sales`, `/fiscal`,
`/stocktake`, `/tables`, `/kitchen`, `/live`, `/flowers`. **Немає** `/admin`
і `/super` (вони `'web'`-only у `renderRoutes.tsx`) і немає `hardware`
(`'cashier'`-only). Власник, що увійшов на планшеті, потрапляє на касу.

Чим планшет **не є** — касою. Три речі, які легко переплутати:

- він **не шле `X-POS-Device-ID`**: сервер трактує будь-який валідний id як
  касу, здатну тримати ПРРО-регістр (`src/pos/routes/_shared.ts`,
  `src/pos/fiscal/offline/holder.ts`), а планшет ні чеків не друкує, ні
  документів не відтворює. Гарантія проста: `api.setDeviceId` кличеться в
  одному місці, `offline/sync.ts`, і лише в режимі `full`;
- він **нічого не ставить у чергу**: ні продажу, ні клієнта, ні листа
  інвентаризації. Раунд, відправлений «офлайн», нікого на кухні не розбудить
  (§4.10 столів), а продаж, придуманий планшетом, — чек без ПРРО;
- він **не друкує**: `printPrecheck`, кухонний тікет, чек — усе Tauri-команди
  каси, і `shell === 'cashier'` у `BillPage`/`HolderPanel` лишається саме
  таким — «є десктопною касою».

## 2. Режим офлайну `reads`

`pos/src/offline/enabled.ts` перестав бути булевим прапорцем і став режимом:

| режим | хто | читання | записи | device id | outbox / резерв кодів |
|---|---|---|---|---|---|
| `off` | `web` | сервер | сервер | — | — |
| `full` | `cashier` | дзеркало | черга | так | так |
| `reads` | `tablet` | дзеркало | сервер, або відмова одразу | **ні** | **ні** |

Два предикати замість одного: `isOfflinePosEnabled()` — **лише `full`**, і
на ньому й далі висить усе, чого планшет не має (outbox, `lease.ts`,
`getDeviceId`, черга `stocktake`); `isOfflineReadsEnabled()` — `full` або
`reads`, і на ньому: локальний вхід (`auth-local.ts`, збереження unlock після
онлайн-входу, fallback на мережевій помилці, bootstrap за офлайн-токеном),
снімок каталогу/теґів/клієнтів у Dexie, дзеркало залу й рахунків модуля
`tables` (`mirrored: shell !== 'web'`).

`cashierApi` ділиться навпіл: читання (`getCatalog`, `getTags`,
`refreshCatalog`, `listCustomers`, `listSales`, `getSale`) — у репозиторій,
коли є будь-яке дзеркало; записи (`completeSale`, `createCustomer`,
`updateCustomer`, `refundSale`) — у чергу лише на `full`, інакше на сервер, а
без мережі — `OfflineWriteError` («Потрібна мережа — без звʼязку це не
зберегти») **до** того, як запит вийде: чекати таймаут axios із гостем поруч
нема сенсу, відповідь відома. `classifyCheckoutError` мапить її на наявний
`offline_blocked`.

Рантайм `reads` (`startReadsRuntime` у `sync.ts`): слухачі `online`/`offline`
(без них `useOfflineStatus.online` на вебі був статичним — сідав раз із
`navigator.onLine` і не рухався, тож карта залу не відрізняла зниклий Wi-Fi
від повільного) і `refreshSnapshot()` на «мережа повернулась», на
`visibilitychange` і при вході. **Без** 30-секундного циклу каси: `runSync`
тягне весь каталог і всіх клієнтів щотику, що каса на дроті собі дозволяє, а
планшет на Wi-Fi зали — ні; `ensureSnapshot` і так перечитує снімок, старший
за дві хвилини, на кожному читанні каталогу.

Банер (`OfflineStatusBanner`) у `reads` каже одне: «Без мережі — лише
перегляд». Лічильника черги нема, бо черги нема.

### Знахідка: друга копія прапорця на десктопі

`offline/enabled.ts` компілюється у зовнішній чанк `@pos/platform`
(`platform/offline.ts`), і всі його читачі — `cashierApi`, `sync`, `status`,
`useAuth` — живуть у чанку. А `cashier-main.tsx` вмикав офлайн через
**відносний** імпорт `./offline/enabled`, тобто у збірці `build:cashier` — через
другу копію, якої чанк не читав: у хост-чанку лежав свій `var Hf=!1;function
zf(){Hf=!0}`, а `isOfflinePosEnabled` чанка відповідав `false`. Релізна каса
свій офлайн-рантайм не запускала; під `tauri:dev` (alias, один бандл) цього не
видно. `check-platform-boundary.mjs` пропускав: файл нічого не імпортує, тож
ніколи не «досягав» `STATE_OWNERS`. Закрито тут: сеттери йдуть через барел, а
`enabled.ts` названо у `STATE_OWNERS`.

Той самий клас — `instanceof` у `lib/checkoutError.ts` проти класів з
`offline/errors.ts`: на зібраній оболонці це два різні обʼєкти класу, і
`FiscalSaleUnknownError` каси читалась як `rejected` — без «Перевірити ще
раз». Тепер збіг за `.name`, який виживає межу чанка.

І третя, за другою: `assemble-{web,cashier}-dist.mjs` перейменовують entry
платформи в `platform-<hash>.js`, а її ліниві сусідні чанки копіюють як є.
Чанк `offline-*.js` (за `import('../offline')` у `useAuth`, який веб ніколи не
виконував, а планшет у `reads` виконує при вході) імпортує entry за іменем
`./platform.js` — 404, і кожен вхід на планшеті падав «Не вдалося увійти».
На релізній касі той самий шлях був мертвий через першу знахідку, і сам фікс
прапорця вивів би її на цей 404. Тепер сусіди копіюються з переписаним
посиланням на хешоване імʼя, в обох скриптах.

## 3. Entry, збірка, роздача

- `pos/tablet.html` + `pos/src/tablet-main.tsx` + `pos/src/TabletApp.tsx`.
  Entry — дзеркало `main.tsx`: `enableOfflineReads()` **з `@pos/platform`**,
  `applyModuleRemotes()` веб-шляхом (verify + `import()`),
  `PosShellContext value="tablet"`, `BrowserRouter basename="/tablet"`.
  `TabletApp` = `App` + `startOfflineRuntime()` + реєстрація SW + банер
  оновлення. У `tablet.html` **нема Google Fonts**: `<link>` на стиль, що
  без мережі зависає, тримає перший рендер, а `--pos-font` падає на
  `system-ui`.
- `vite.config.ts`: multi-page (`index` + `tablet`), `build.manifest: true`
  (для precache-списку), плагін `tabletUnderPrefix` — `/tablet/*` →
  `tablet.html` і `/tablet` → `/tablet/` у `vite dev` **і** `vite preview`.
  У всіх `vite.*-remote.config.ts` і `vite.cashier.config.ts` —
  `publicDir: false`: `public/` тепер існує (маніфест, іконки) і Vite копіював
  би його в кожен remote-бандл і в `dist-cashier`.
- `scripts/assemble-web-dist.mjs`: import map тепер і в `tablet.html`;
  потім `dist/tablet-sw.js` із шаблону `sw/tablet-sw.js` (§4) і копія
  `serve.json` у `dist/`.
- Роздача (`pos/serve.json`, serve-handler) — три пастки, кожна перевірена в
  джерелах `serve@14`:
  1. `serve -s` **додає** `** → /index.html` *попереду* правил із
     `serve.json`, а `applyRewrites` бере перше, що збіглося, — `/tablet/*`
     ніколи не дійшло б до `tablet.html`. Тому в `Dockerfile` і `railway.json`
     `-s` нема, а SPA-fallback — **останнє** правило `rewrites`.
  2. `cleanUrls` за замовчуванням `true`: `/tablet.html` відповідав би 301 на
     `/tablet`, а Chromium відмовляється віддавати з precache redirected-
     відповідь на навігацію. `cleanUrls: false`, і precache тримає `/tablet/`
     (ціль rewrite, 200), а не `/tablet.html`.
  3. Scope `/tablet/` не контролює `/tablet` без слеша — `redirects`
     `/tablet → /tablet/`, а `start_url`/`scope`/`id` маніфесту — `/tablet/`.
  Заголовки: `immutable` на `/assets/**`, `no-cache` на `/tablet-sw.js`,
  обидва html і `/tablet/`.
  Rewrite застосовується лише коли файлу нема (шлях із розширенням спершу
  `stat`иться), тож `/assets/*` він не зачепить.

## 4. Service worker

`pos/sw/tablet-sw.js` — рукописний шаблон без workbox: precache-список і так
робить наш assemble-скрипт, а залежність заради одного файлу репо не бере.
Реєструється лише з `TabletApp` (`hooks/useAppUpdate.ts`), scope
`/tablet/`, і **після першого входу**, не при завантаженні: перший запуск і так
потребує мережі для логіна й снімка, тож кеш оболонки після них нічого не
втрачає, а відвідувач, що не входив, його не качає. Друга причина — тестова,
і вона визначила порядок: POST зі сторінки під контролем воркера (чи такої,
яку він захопив на льоту) Playwright маршрутизувати не вміє, GET — вміє;
логін, що наздогнав `clients.claim()`, мок-API e2e не бачив. Сторінка під
контролем SW пропускає через нього **всі** свої fetch незалежно від URL —
scope вибирає лише сторінки, тож вкладки власника на тому ж origin не
контролюються ніколи.

Що і як:

| запит | стратегія |
|---|---|
| навігація під `/tablet/` | cache-first `/tablet/` — кіоск має відкриватись миттєво; шлях оновлення — банер |
| same-origin (`/assets/**`, маніфест, іконки) | cache-first із precache |
| remote-модуль: `manifest.json`, `.sig`, `remote-entry.js`, `style.css` | network-first (3 с) → кеш `pos-tablet-remotes` |
| remote-модуль: хешовані саб-чанки | cache-first |
| `/api/**`, `/pos-uploads/**` | **не чіпає** — це Dexie-дзеркала й `offline/photos.ts` |

Онлайн верифікація (`remoteVerify.ts`, `cache: 'no-store'` — обходить
HTTP-кеш, але проходить через SW) завжди йде проти свіжих байтів; офлайн
хост дістає останню перевірену пару й верифікує її так само. Після успішного
`manifest.json` SW **прогріває всі ключі його підписаної `files`-мапи** —
сторінка модуля, яку офіціант онлайн не відкривав, офлайн усе одно
відкриється. Це дешева половина того, чого хоче
[POS_MODULE_REMOTE_SIGNING.md](POS_MODULE_REMOTE_SIGNING.md) («верифікуючий
SW»); перевірку хешів саб-чанків цей трек не робить.

Precache (`scripts/precache.mjs`, чиста функція, `src/lib/precache.test.ts`):
замикання `tablet.html` у `dist/.vite/manifest.json` (свій чанк, статичні й
динамічні імпорти, css) + усе під `assets/vendor/**` і `assets/platform/**`
(чанки import map **і** ліниві сторінкові чанки платформи, які копіюються як
є та хост-маніфесту невидимі) + `/tablet/`, `tablet.webmanifest`, `icons/`.
`index.html` і його чанки — ні: адмінка SW не має. `BUILD_ID` — sha256 цього
списку; кеш `pos-tablet-shell-<id>`, на `activate` старі видаляються.

## 5. Оновлення версій

`hooks/useAppUpdate.ts`. SW **не** кличе `skipWaiting()` при install —
новий білд встановлюється й **чекає**. `registration.update()` на
`visibilitychange` і щогодини; `updatefound` → worker у стані `installed`
**за наявності** `navigator.serviceWorker.controller` (інакше це перший
install, і пропонувати нема чого) → `ready`. `TabletApp` показує наявний
`ModuleRemotesReloadBanner`: «Доступна нова версія застосунку» — «Оновити»
(`postMessage('SKIP_WAITING')` → `controllerchange` → `reload()`) або
«Пізніше». Відкладене застосується, коли всі вкладки закриються — для
встановленого PWA це наступний запуск. Пріоритет банера як на касі: зміна
списку модулів магазину (`moduleRemotesStale`) перша.

Наслідок, який треба знати: застосунок, відкритий днями без тапу, нову
версію не отримає. Це ціна за «ніколи посеред рахунку».

## 6. Встановлення

`public/tablet.webmanifest` (`display: standalone`, іконки 192/512 `any` +
512 `maskable`, `theme_color` з токенів). Іконки — `scripts/gen-pwa-icons.mjs`
растеризує один inline-SVG тим Chromium, що Playwright і так ставить для
e2e; результат **закомічено** в `public/icons/`, бо Docker-збірка робить
`npm ci` без браузера. `npm run pwa:icons` (з `PW_CHROMIUM=/шлях/до/chrome`,
якщо Playwright новіший за встановлені браузери).

`lib/installPrompt.ts` ловить `beforeinstallprompt` при старті й тримає для
кнопки «Встановити на планшет» на `LoginPage` (лише `shell === 'tablet'` і не
в standalone). iOS такої події не має — підказка «Поділитися → На Початковий
екран», і ризик: невстановлений сайт Safari може стерти сховище за 7 днів
без відвідин.

## 7. Тести

- Unit: `offline/enabled.test.ts` (три режими), `cashierApi.test.ts`
  (планшет: читання в дзеркало, записи на сервер, без мережі —
  `OfflineWriteError` без жодного виклику), `modules/shells.test.ts`
  (`runsInShell`, зокрема правило для старих бандлів),
  `renderRoutes.test.ts`, `lib/precache.test.ts`, `lib/checkoutError.test.ts`
  (збіг за іменем через межу чанка).
- e2e `pos/e2e/tablet.spec.ts`: `/tablet` — окремий entry без адмінки, з
  маніфестом і SW у своєму scope; без мережі відкривається, показує
  бачене меню і відмовляє продати; карта залу читається з дзеркала модуля
  `tables` (справжній підписаний бандл із фейкового CDN). Усі роути — на
  **контексті**: під контролем SW fetch сторінки стають запитами воркера,
  які бачить лише `context.route`, і лише з
  `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` — його ставить
  `npm run test:e2e`. `mockPosApi` тому приймає і `Page`, і `BrowserContext`.

`runsInShell` (`modules/shells.ts`): бандл, опублікований до планшета, несе
`shells: ['web','cashier']` у собі (`remote-entry.ts` віддає маніфест як є),
і голе `includes('tablet')` зробило б кожен такий модуль невидимим на
планшеті до перезбирання CDN — кавʼярня тихо відкотилась би на каталог одягу.
Тож модуль, що працює в **обох** старих оболонках, працює й на планшеті;
web-only (адмінка) і cashier-only (hardware) — ні. У bundled-маніфестах
`'tablet'` усе одно названо явно.

## 8. Фази

| фаза | що | стан |
|---|---|---|
| P0 | shell `'tablet'`, `runsInShell`, режим `reads`, платформа 15, фікс другої копії `enabled.ts` | зроблено 2026-09-23 |
| P1 | `tablet.html`/`tablet-main.tsx`/`TabletApp`, multi-page Vite, `assemble-web-dist`, `serve.json`, Dockerfile без `-s` | зроблено 2026-09-23 |
| P2 | webmanifest, іконки, `sw/tablet-sw.js`, `useAppUpdate` + банер, «Встановити на планшет» | зроблено 2026-09-23 |
| P3 | unit + e2e, документація, посібники | зроблено 2026-09-23 |

Залежність деплою: бандл `tables` (і решту remote-модулів) треба перезібрати
й опублікувати проти платформи 15, щоб `mirrored: shell !== 'web'` дійшов до
планшета; до того `runsInShell` тримає модуль видимим, але дзеркало пише лише
новий бандл.

## 9. Чого свідомо немає

- **Офлайнових записів** на планшеті — черги, локальних «К17», резерву кодів
  ПРРО. Планшет не каса (§1).
- **Друку** з планшета.
- **Офлайну для кабінету власника** в браузері — `index.html` без SW.
- **Верифікації хешів саб-чанків** remote-модулів у SW — прогрів є, перевірки
  нема; окремий крок, якщо знадобиться.
- **Автоматичного застосування** нової версії — §5.
