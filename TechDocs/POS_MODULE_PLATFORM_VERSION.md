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
