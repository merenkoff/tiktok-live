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

- [ ] **2. CI-публикация remote-артефактов**
  - Workflow: собрать `dist-remotes/returns` и `dist-remotes/stock`, залить в
    CDN/бакет с иммутабельным путём по версии.
  - Манифест соответствия «версия модуля → URL».
  - Зависит от: п.1 (схема путей). Оценка: несколько дней.

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
  - **Только веб.** Tauri-касса `applyModuleRemotes` не вызывает, CSP
    `script-src 'self'`, оффлайн — настройка хранится, но игнорируется.
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

- [ ] **11. Разбор core-модулей (`register` / `returns`-в-регистре)**
  - Оценить, что мешает вынести cashier-root модули, завязанные на
    offline/Dexie.
  - Независимо (исследование). Оценка: несколько дней.

---

## Desktop / Tauri

- [-] **12. Desktop-паритет** — рекомендация PoC: **не делать**.
  - Если всё-таки: подписанные пакеты в `appDataDir`, `asset:`-протокол
    загрузчик, изменение CSP, offline-снапшот remote-модулей. ~3–6 недель
    поверх web. Оставить desktop на общем app-updater'е.

---

## Рекомендуемый порядок, если делать всерьёз

~~п.1~~ (seam) → п.2, ~~п.4~~ → ~~п.3~~, ~~п.6~~ → ~~п.7~~, ~~п.8~~, ~~п.5~~, ~~п.10~~ → ~~п.9~~ → п.11

Сделано: #1 (seam, не финал), #3, #4, #5, #6, #7, #8, #9, #10.
Механизм для in-tree модулей закрыт: per-store, подписан, self-styled. Осталось
только под раздачу из отдельного репо: **#2** (CI-публикация в иммутабельные
пути + манифест «версия→URL»), прод-ключ подписи, #1 (полноценный контракт
версий). #11 — исследование core/cashier-модулей — независимо.
