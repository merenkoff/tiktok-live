# POS module-remote — roadmap of independent follow-ups

Derived from `TechDocs/POS_MODULE_REMOTE_POC.md` ("Still open" items). Each
section below is an independent unit of work — do them in any order unless a
dependency is called out. Nothing here is committed to; this is the menu if
independent *delivery* of POS modules ever becomes real.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` won't do

---

## Web-only, до продакшн-готовности

- [~] **1. Версионирование `/api/pos`** — seam сделан, negotiation не финальный.
  - Сделано: `X-POS-API-Version` заголовок на каждом запросе/ответе, по одной
    константе на сторону (`src/pos/version.ts`, `pos/src/platform/version.ts`),
    `GET /api/pos/version`, дремлющий `POS_API_STRICT_VERSION=1` → `409`.
    Пока **advisory** — mismatch логируется, не отклоняется; версия всегда `1`.
    Подробно: [POS_API_VERSIONING.md](POS_API_VERSIONING.md).
  - Осталось (до реальной отдачи модуля на независимый апгрейд): решить контракт
    breaking-изменений, `min_supported` / окно совместимости, включить strict,
    опционально URL-префикс `/api/pos/v1`.
  - **Вторая половина #1 — версия поверхности `@pos/platform` — сделана**
    (2026-09-09, #12 трек 2): `PLATFORM_VERSION` в хосте, `minHostPlatform` в
    подписанном манифесте, проверка на вебе / в Rust / в кеше, снапшот-тест
    поверхности. [POS_MODULE_PLATFORM_VERSION.md](POS_MODULE_PLATFORM_VERSION.md).

- [x] **2. CI-публикация remote-артефактов** — сделано.
  - `.github/workflows/module-release.yml`: тег `module-<id>-v<version>` (или
    ручной запуск) → сборка + подпись **прод**-ключом (job падает, если
    подписано dev-ключом) → файлы `dist-remotes/<id>/*` коммитятся в ветку
    `module-builds`, тег переставляется на этот коммит → иммутабельный URL
    `https://cdn.jsdelivr.net/gh/<owner>/<repo>@module-<id>-v<version>/<id>/remote-entry.js`.
  - «Версия модуля → URL» = тег; версия модуля пока равна `pos/package.json`
    (независимой нумерации нет — это остаток п.1). Регистрация URL в
    `module_remotes` магазина — отдельный ручной шаг.

- [x] **3. SRI + подпись артефактов** — сделано.
  - `scripts/sign-remote.mjs` после `build:<id>-remote` пишет
    `dist-remotes/<id>/manifest.json` (`sha384` каждого файла) + `.sig`
    (Ed25519 detached над байтами манифеста).
  - Загрузчик `src/modules/remoteVerify.ts` перед `import()` проверяет:
    подпись против allowlist ключей (`remoteSigningKeys.ts`), `sha384`
    `remote-entry.js`, `moduleId`/`entry`. Провал → bundled-fallback
    (`remote_verify_error` + `remote_load_fallback`).
  - Ключ: детерминированный **dev**-ключ (сид в скрипте, ничего секретного в
    репо, локальные сборки грузятся из коробки); прод-ключ из
    `POS_REMOTE_SIGNING_KEY` (CI secret). Подробно:
    [POS_MODULE_REMOTE_SIGNING.md](POS_MODULE_REMOTE_SIGNING.md).
  - Escape hatch: `VITE_MODULE_REMOTES` + `VITE_MODULE_REMOTES_INSECURE=1`
    пропускает проверку (только env-override; per-store путь всегда проверяется).
  - **Осталось (осознанно вне итерации):** саб-чанки не хэшируются на загрузке
    (только через content-hash имена из подписанного манифеста); TOCTOU между
    `fetch` и `import()`; `crypto.subtle` Ed25519 — не во всех браузерах
    (fail-closed). Из #7: `sha384` SRI для vendor/`@pos/platform` в
    `importmap.integrity` — уже был.

- [x] **4. Извлечение Tailwind CSS для модуля** — сделано.
  - `src/styles/tokens.css` — рукописный слой (`.sq-*` / `.pos-*` классы,
    `:root` токены, `@media print`) вынесен из `src/index.css` в отдельный
    framework-agnostic файл (импортится обоими entry рядом с `index.css`); можно
    вендорить для модуля вне репо.
  - Каждый `vite.<id>-remote.config.ts` через `scripts/module-tailwind.mjs`
    гоняет Tailwind по исходникам **только своего** модуля (`presets:[base]` для
    темы, `preflight:false`) → `dist-remotes/<id>/style.css` — только используемые
    утилиты, без reset/globals.
  - `sign-remote.mjs` хэширует `.css` тоже; `remoteVerify.ts` сверяет `sha384`
    `style.css` с подписанным манифестом и возвращает текст; `registry.ts`
    `injectModuleStyle()` вставляет `<style data-module-remote=id>` до рендера.
  - `check:<id>-css-coverage` перенацелен на `dist-remotes/<id>/style.css`
    (+ folds in `tokens.css`) — теперь это реальный контракт, не растяжка.

- [x] **5. Error boundary / retry / телеметрия вокруг динамического `import()`** — сделано.
  - `pos/src/modules/lazyWithRetry.ts` — `import()` с экспоненциальным backoff
    (2 ретрая) для боот-свопа дескриптора (`registry.ts`) и для lazy-страниц
    (`returns`/`stock`/`products` манифесты).
  - `pos/src/components/RouteErrorBoundary.tsx` — первый ErrorBoundary в
    приложении; оборачивает каждый lazy-роут в `renderRoutes.tsx`. Fallback:
    «Повторити» (мягкий remount), после 2-го провала — «Перезавантажити
    застосунок», + «На головну». Больше нет белого экрана при 404 чанка.
  - `pos/src/modules/telemetry.ts` — `reportModuleEvent` (структурные события
    `remote_load_ok|error|fallback`, `route_render_error`) + `onModuleEvent` /
    `getModuleEventLog`. Сетевого стока нет — это seam под п.6.
  - **Прим. из п.7:** vendor- и `@pos/platform`-чанки same-origin same-deploy —
    их отказ = отказ entry-чанка (принятый риск, вне этого пункта).

- [x] **6. Телеметрия версий в рантайме** — сделано.
  - Каждый модуль (bundled или remote) несёт `version` — build-версию из
    `package.json`, застампленную через Vite `define` (`__POS_APP_VERSION__` →
    `POS_APP_VERSION` в `pos/src/platform/version.ts`, `pos/scripts/pkg-version.mjs`).
    Отдельно собранный remote (`vite.*-remote.config.ts` + `remote-entry.ts`)
    сообщает **свою** версию сборки, а не хостовую.
  - На boot — один событие `session_manifest` в `pos/src/modules/telemetry.ts`
    (`{ appVersion, apiClientVersion, modules: [{ id, version, source, url }] }`),
    из `applyModuleRemotes()` на web и `reportSessionManifest()` из
    `cashier-main.tsx` на Tauri.
  - Скью версии `/api/pos` больше не одинокий `console.warn`: тот же
    `services/api.ts` шлёт `api_version_skew` в тот же seam.
  - Сеть: `pos/src/modules/telemetryBeacon.ts` → `POST /api/pos/client-telemetry`
    (`src/pos/routes/telemetry.routes.ts`, без auth, без БД, только `logger.info`).
    **Выключено по умолчанию** — `VITE_POS_TELEMETRY_BEACON=1` или
    `localStorage['pos_telemetry_beacon']='1'` (симметрия с
    `POS_API_STRICT_VERSION`). Без флага — только `console` + debug-handle
    `window.__POS_TELEMETRY__`.

---

## Инфраструктура механизма

- [x] **7. `@pos/platform` как реально внешний чанк в основном билде** — сделано.
  - `npm run build` (`vite.config.ts` → `dist/`) теперь externalize
    react/react-dom/react-dom·client/react·jsx-runtime/react-router-dom/zustand/
    `@pos/platform` и грузится через `<script type="importmap">`, все shared-
    чанки self-hosted из `dist/assets/{vendor,platform}/`. `npm run dev` и
    `build:cashier` (Tauri) не тронуты.
  - Новое: `scripts/build-vendor.mjs` + `scripts/vendor-stubs/*`,
    `scripts/assemble-web-dist.mjs`, `scripts/check-platform-boundary.mjs`
    (+ `npm run check:platform-boundary`, в CI). Подробности —
    POS_MODULE_REMOTE_POC.md, раздел от 2026-09-05.

- [x] **8. Пиннинг вендоров без esm.sh** — сделано вместе с п.7.
  - `scripts/build-vendor.mjs` перепаковывает установленные копии из
    `node_modules` в ESM-чанки (без сети), `assemble-web-dist.mjs` их хеширует
    и кладёт в `dist/assets/vendor/` + SRI в import map. `esm.sh` больше нигде
    в рантайме нет (в т.ч. e2e гоняется без сетевого доступа).

- [x] **9. Регистрация remote из настроек стора** — сделано.
  - `pos_stores.module_remotes jsonb` (`{ moduleId: url }`, миграция `016`),
    едет в `AuthResponse.store` / `StoreConfig` рядом с `enabled_modules`.
    Валидация на бэке (`sanitizeModuleRemotes`, `isAllowedRemoteUrl`): только
    known non-core id и URL `https://` / `/…` / `http://localhost|127.0.0.1`.
  - Фронт: `applyModuleRemotes()` больше не читает только env —
    `resolveModuleRemotes()` берёт `VITE_MODULE_REMOTES` (override, выигрывает),
    иначе `store.module_remotes` из кэшированного `pos_auth`. Применяется на
    boot; `importWithRetry` + `RouteErrorBoundary` + `remote_load_fallback`
    (#5) закрывают битый URL.
  - UI: поле URL под каждым включённым toggleable-модулем в
    Settings → «Модулі магазину». После сохранения — плашка «Перезавантажити»
    (и app-wide баннер, если `store.module_remotes` разъехался с применённым
    на boot — `moduleRemotesStale` в `useAuth`).
  - ~~Только веб.~~ С #13 B касса тоже вызывает `applyModuleRemotes` (через
    Rust-кеш), и string-форма на ней **применяется тем же кодом** — но без
    контракта версий хост↔модуль это не объявлено фичей. См. #12 / трек 2.
  - Зависело от: #1, #5 (+ #6 для видимости в `session_manifest`).

---

## Расширение на другие модули

- [x] **10. Третий модуль через тот же паттерн** — `products`.
  - `src/pages/admin/ProductsPage.tsx` (935 строк) → `src/modules/products/pages/`,
    `TagColorSwatches` → `src/modules/products/components/`.
  - Новые shared-шимы в `@pos/platform`: `urls.ts` (`assetUrl`),
    `tag-colors.ts` (токены). `ProductPhotoField` (в `@pos/platform/ui`)
    переведён на `@pos/platform` для `api`/`assetUrl` — иначе тянул второй axios
    в remote-чанк.
  - `vite.products-remote.config.ts` + скрипты `build/serve:products-remote`
    (порт 5003), `check:products-css-coverage`. `registry.ts` — без изменений.
  - Проверил барел: в products-remote чанке нет `html5-qrcode`
    (`BarcodeScanner` отсеян `sideEffects:false`) и нет второго `axios`.

- [x] **11. Разбор core-модулей** — сделано (исследование).
  [POS_MODULE_CORE_ANALYSIS.md](POS_MODULE_CORE_ANALYSIS.md).
  - Runtime-remote для cashier-модулей невозможен (оффлайн + CSP `script-src
    'self'` = #12). #11 = только про организацию кода bundled-модулей.
  - Дешёвые: `qr-payment`, `live-selling` (нет кода), `customers` (нужен один
    re-export `cashierApi` в `@pos/platform`). ~0.5–1 день.
  - Оставить platform-core: `catalog-checkout` (это и есть cashier-платформа),
    `hardware` (неотделимо Tauri-native), `settings` (рулит тогглами).
  - Вывод: механизм модуль-ремоутов — инструмент доставки **web/admin**-фич, не
    кассы. Касса остаётся единым оффлайн-бандлом — это правильный дизайн.

---

## Desktop / Tauri

- [~] **12. Полный desktop-паритет** — пересмотрен 2026-09-09, разложен на три трека.
  - Оценка «3–6 недель» была сделана до #13; его механика (подписанный кеш в
    `appDataDir`, `liveshopmodule://`, CSP, оффлайн-исполнение, плейсхолдер,
    CI-публикация) закрыла всю *механику* #12. Осталось:
  - **[x] Трек 1 — пробелы паритета в #13** (сделано 2026-09-09):
    - `module_remotes` теперь хранится отдельно от `pos_auth`
      (`localStorage['pos_module_remotes']`, пишет `api.saveAuth` только для
      серверных auth; `clearAuth` не трогает) и кешируется в `staffUnlock` —
      раньше logout или оффлайн-PIN-вход стирали список, и online-only модули
      пропадали из nav до следующего онлайн-входа **и** рестарта.
    - Баннер «перезавантажити» есть и на кассе (`remotesChanged` больше не
      `false` для кассы; `ModuleRemotesReloadBanner` общий для обоих шеллов).
    - Boot **из кеша** (`sync_module_remote(…, cachedOnly)`), сеть — фоном после
      рендера (`modules/desktopRemotes.ts`: сразу, на `online`, раз в час);
      скачанное обновление / первая загрузка плейсхолдера → тот же баннер.
      Раньше киоск без рестарта не получал новых версий, а boot ждал сеть до
      10 с на модуль.
    - `source_url` входит в проверку «current» — тот же id+версия с другого
      URL перекачивается.
    - Dev-ключ подписи только в debug-сборках / при
      `POS_REMOTE_ALLOW_DEV_KEY=1` (Rust) и `VITE_REMOTE_ALLOW_DEV_KEY=1` (TS);
      прод-инсталлер и Railway доверяют только прод-ключу.
    - `prune_module_remotes(keep)` после boot убирает кеш модулей, которых
      больше нет в `module_remotes`.
  - **[x] Трек 2 — «#12-lite»: string-override bundled-модулей на кассе**
    (сделано 2026-09-09). Работало случайно (см. #9); теперь официально, под
    контрактом версий хост↔модуль —
    [POS_MODULE_PLATFORM_VERSION.md](POS_MODULE_PLATFORM_VERSION.md):
    - `PLATFORM_VERSION` (целое) в `@pos/platform`; `sign-remote.mjs` пишет в
      манифест `minHostPlatform` = версия чекаута; `schema` остаётся `1`.
    - Проверка в трёх точках: `verifyRemoteEntry` (веб, до хэша entry),
      `sync_module_remote` (Rust — несовместимое **не скачивается**,
      `status: 'incompatible'`), `cachedOnly` (кеш с `minHostPlatform > host`
      не отдаётся). `installed.json` хранит `minHostPlatform`.
    - Касса не синкает string-override web-only модулей (`stock`, `products`).
    - UI: проба в Settings предупреждает «потребує платформу N»; на кассе
      баннер «Потребує новішої версії застосунку» → `/hardware`; плейсхолдер
      online-only модуля объясняет «оновіть застосунок».
    - Страховка от забытого бампа: `src/platform/surface.test.ts` +
      `surface.snapshot.json`, `npm run platform:snapshot` отказывается
      записать изменившийся набор экспортов без бампа.
    - e2e `pos/e2e/remotes.spec.ts` — подписанный в тесте remote с фейкового
      CDN: совместимый подменяет bundled, `minHostPlatform+1` — нет. Tauri-путь
      — юнит-тесты Rust + ручной чек-лист (в плане трека).
  - **[ ] Трек 3 — модули с собственными оффлайн-данными.** Контракт
    `offline?: { snapshot(), sync(), pendingCount() }`, своя Dexie-БД на модуль
    (`cloth-pos-module-<id>`), порядок синка, агрегация `pending`. ~1.5–3 недели.
    **Кандидата нет** (`tiktok-live` онлайн по природе, `fiscal-checkbox`
    online-only по дизайну, склад-документы оффлайн вне скоупа) — план
    начинается с выбора модуля. **Отдельный план перед стартом.**

- [x] **13. Online-only модули в десктоп-кассе** (A–E сделаны)
  - **Цель:** десктоп-приложение (не только его веб-часть) — платформа, под
    которой крутятся полноценные **online-only** feature-модули: свой главный
    экран, свои nav/иконка, ходят в нашу БД только через `/api/pos`. Платформа
    подключает их не зная заранее числа — список в `store.module_remotes` (#9).
  - **Вводные:** бэкенд — только наш API (модуль дергает существующие/новые
    роуты `/api/pos`); пишет наша команда (Tauri-sandbox — позже); модуль виден
    и оффлайн (кеш на диске), «нужен интернет» показывает сам экран; хостинг
    артефактов — Git сейчас, свой сайт потом.
  - **Что переиспользуется:** контракт `ModuleDescriptor`/`NavItem`,
    per-store реестр (#9), подпись+verify (#3), свой CSS (#4), телеметрия (#6),
    `api` из `@pos/platform`.
  - **Что строить:**
    - **[x] A. Externalize `@pos/platform` + vendors в cashier-сборке + import
      map в `cashier.html`** («#7 для кассы»; таргеты import map — внутри
      инсталлятора, не CDN). Сделано — PR #38. `dexie` тоже общий vendor.
    - **[x] B. Rust: кастомный URI-протокол `liveshopmodule://` + менеджер
      download/verify/cache** в `appDataDir/modules/<id>/<version>/` +
      `installed.json`. Команда `sync_module_remote`: fetch manifest+sig →
      Ed25519-verify (тот же ключ, что #3) → если версия новее и кеш цел,
      скачать `files`, проверить `sha384`, атомарно опубликовать. Оффлайн →
      отдаём из кеша. Handler `protocol` отдаёт кешированные байты по
      `liveshopmodule://localhost/<id>/<file>` (Windows:
      `http://liveshopmodule.localhost/...`); seam
      `applyModuleRemotes({ syncRemote })` + вызов из `cashier-main.tsx`. CSP:
      `script-src 'self' liveshopmodule: http://liveshopmodule.localhost` —
      CDN не ослабляем. Это НЕ системная схема (живёт только в нашем webview).
    - **[x] C. Плейсхолдер «объявлен, но не скачан», из `store.module_remotes`.**
      Значение `module_remotes[id]` теперь `string | { url, title, routePath,
      nav[], icon? }`: строка — оверрайд bundled-модуля (#9), объект — **новый
      online-only модуль** (произвольный id, самоописателен). `sanitizeModule­Remotes`
      валидирует обе формы. Не скачан (холодный оффлайн) → серый пункт в nav →
      экран `RemoteModuleUnavailablePage` c кнопкой «Спробувати зараз»
      (`sync_module_remote`). `remoteModules` + `allModules()` в реестре;
      `selectNav`/`renderRoutes` идут по `allModules()`, `alwaysEnabled`
      обходит `enabled_modules`. **Апдейт приложения для нового модуля не нужен**
      — метаданные показа приходят данными с бэкенда. `manifest`-presentation
      отложена (почти не покрывает; вернуться при каталоге/сторонних модулях).
    - **[x] D. `NavItem.icon` принимает строку-имя** (`'PackageCheck'`) —
      сделано. `platform/icons.ts` (в барреле `@pos/platform`): `NAV_ICONS` —
      рукописный allowlist ~48 lucide-экспортов, `resolveNavIcon` (компонент →
      сам, известное имя → компонент, неизвестное → `Puzzle`, пусто →
      `undefined`); не `import * as icons` — файл тянется эагерно из `Nav`.
      Все bundled-манифесты переведены на строки, `lucide-react` из манифестов
      ушёл: в `build:returns-remote` эагерный entry 4.20 КБ → 1.32 КБ.
      `placeholderDescriptor` больше не хардкодит `CloudOff` — pending-модуль
      несёт **свою** иконку (`nav[].icon` → `icon` → `CloudOff`). В контракт
      `ModuleRemoteEntry` добавлен `nav[].icon` (entry-level `icon` = дефолт);
      бэкенд валидирует только форму имени — каталог иконок знает клиент.
    - **[x] E. Обзор Tauri capabilities** — сделано:
      [POS_MODULE_TAURI_CAPABILITIES.md](POS_MODULE_TAURI_CAPABILITIES.md).
      Уточнение к формулировке выше: `window.__TAURI__` нет (`withGlobalTauri`
      выключен), есть `__TAURI_INTERNALS__.invoke`. Главное: **команды
      приложения через ACL не проходят** — capabilities режут только `core:*`
      и плагины, так что печать/HID/sync модулю доступны в любом случае;
      модуль доверен как само приложение, гейт — подпись (#3), схема
      first-party-only. `capabilities/default.json` сужен с
      `core:default` + `opener:default` до одного
      `opener:allow-open-url` со скоупом на страницу релиза;
      `scripts/check-tauri-capabilities.mjs` (CI) ловит дрейф прав и списка
      команд. Изоляция (отдельный webview / iframe / worker / isolation
      pattern) описана с ценой, но не строится — третьесторонних модулей нет.
  - **Не надо:** бэкенд-фреймворк модулей, оффлайн-слой для модуля (он
    online-only), отдельная авторизация.
  - Оценка: **~3–4 недели** до первого модуля. Дальше новый модуль = собрать
    (`vite.<id>-remote.config.ts`), подписать, положить папку на хостинг,
    добавить `{ id: url }` в настройку стора.
  - **[x] Первый реальный online-only модуль отгружен — `tiktok-live`**
    («Прямий ефір»): лента комментариев TikTok LIVE и старт/стоп сессии внутри
    POS-оболочки. Шелл не везёт под него кода: `pos/src/modules/tiktok-live/**`
    собирается `vite.tiktok-live-remote.config.ts` в `dist-remotes/tiktok-live`,
    подписывается и объявляется объектной записью в `pos_stores.module_remotes`
    (`{url,title,routePath:'/live',nav,icon:'Video'}`). Проверено, что механизм
    C+D работает на настоящей фиче, а не на PoC: `alwaysEnabled` вместо
    `enabled_modules`, иконка именем, плейсхолдер до скачивания, свой
    `style.css` (`check:tiktok-live-css-coverage`), только `@pos/platform` через
    границу. Единственное, чего не хватало механизму, — авторизация к чужой
    (LIVE) подсистеме: добавлен мост `POST /api/pos/live/session-token`
    (`src/pos/routes/live.routes.ts`), меняющий POS-сессию на LIVE-токен по
    `pos_stores.live_tiktok_username` (миграция `017`), — второго логина у
    оператора нет. Архитектура и оговорки:
    [POS_LIVE_SELLING_MODULE.md](POS_LIVE_SELLING_MODULE.md).

---

## Рекомендуемый порядок, если делать всерьёз

~~п.1~~ (seam) → п.2, ~~п.4~~ → ~~п.3~~, ~~п.6~~ → ~~п.7~~, ~~п.8~~, ~~п.5~~, ~~п.10~~ → ~~п.9~~ → ~~п.11~~

Сделано: #1 (seam, не финал), #3, #4, #5, #6, #7, #8, #9, #10, #11,
#13 A–E — **закрыт целиком** (десктоп: externalize + `liveshopmodule://`
download/verify/cache + плейсхолдер online-only модуля из `store.module_remotes`
+ иконки строкой + обзор Tauri capabilities). Механизм проверен на живой кассе:
подписанный модуль скачивается, верифицируется в Rust и исполняется из кеша.
Первый **реальный** online-only модуль на нём — `tiktok-live`
([POS_LIVE_SELLING_MODULE.md](POS_LIVE_SELLING_MODULE.md)).
Механизм для in-tree модулей закрыт: per-store, подписан, self-styled. #11
показал: касса неотделима (оффлайн+CSP), механизм — под web/admin-фичи.
Сделано и #2 (CI-публикация в `module-builds` + jsdelivr, прод-ключ). #12
пересмотрен 2026-09-09: трек 1 (пробелы паритета #13) и трек 2 (string-override
на кассе + `PLATFORM_VERSION`/`minHostPlatform`) закрыты; трек 3 ждёт своего
плана и модуля-кандидата. От #1 осталась только API-половина (strict-режим
`/api/pos`, окно совместимости).
