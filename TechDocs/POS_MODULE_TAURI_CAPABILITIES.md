# POS desktop — что достаёт модуль внутри кассы (Tauri capabilities)

Roadmap [#13](POS_MODULE_REMOTE_ROADMAP.md) **Part E**. Части A–D построили
доставку online-only feature-модулей в десктоп-кассу: модуль скачивается,
Ed25519-верифицируется и кешируется в Rust, а потом `import()`-ится из кеша
через `liveshopmodule://`. Этот документ отвечает на вопрос, который тогда не
задавали: **что такой модуль может сделать, оказавшись внутри кассы**, и что из
этого мы ограничиваем.

Короткий ответ: **почти всё, что может само приложение**. Единственный реальный
гейт — подпись. Механизм рассчитан на **first-party** модули; чужой код так
пускать нельзя.

Всё, что здесь утверждается, проверено на живой десктоп-кассе (macOS, Tauri
2.11.5) — таблица проб в конце.

---

## 1. Что модуль достаёт сегодня

Модуль исполняется в том же webview, том же origin и том же JS-realm, что и
оболочка (это следствие Part A: `@pos/platform`, React и вендоры — общие
внешние чанки, ровно чтобы стор и React были одним экземпляром).

| Поверхность | Что именно |
|---|---|
| **IPC** | `window.__TAURI_INTERNALS__.invoke(cmd, args)` — инжектится всегда. **`window.__TAURI__` не существует**: `withGlobalTauri` в `tauri.conf.json` не включён. Роадмап раньше писал «модуль видит `window.__TAURI__`» — искать в коде надо `__TAURI_INTERNALS__`. |
| **Наши команды** | Все 6 из `generate_handler!` ([`src-tauri/src/lib.rs`](../pos/src-tauri/src/lib.rs)): `list_hardware` (перечисление HID-устройств), `list_printers`, `print_receipt` (ESC/POS-байты в любой принтер ОС), `print_webview`, `check_for_update`, `sync_module_remote`. |
| **Данные оболочки** | Тот же origin ⇒ `localStorage['pos_auth']` (JWT сессии), IndexedDB офлайн-кассы: снапшот каталога/клиентов, очередь непроведённых продаж, PBKDF2-верификатор PIN. |
| **Сеть** | `fetch` к `/api/pos` с сессионным JWT — то есть весь API магазина под правами текущего кассира/владельца. CSP `connect-src` разрешает `https:` целиком. |
| **Синглтоны** | `useAuthStore` / `useCartStore` / offline-status / `PosShellContext` через `@pos/platform` — не копия, а тот самый инстанс. |
| **Кеш модулей** | `protocol` отдаёт `Access-Control-Allow-Origin: *`, так что байты любого закешированного модуля читаются `fetch`-ем (origin в webview ровно один, так что практического расширения это не даёт). |

## 2. Что гейтится ACL, а что нет — главная ловушка

В Tauri 2 capability-система (`src-tauri/capabilities/*.json`) распространяется
**только на команды плагинов**, включая встроенные `core:*`. **Команды самого
приложения — те, что перечислены в `tauri::generate_handler!` — через ACL не
проходят вообще.**

Практически это значит: сузить `capabilities/default.json` **не** мешает модулю
напечатать что угодно на чеке, перечислить HID-устройства или дёрнуть
`sync_module_remote`. Проверено: при полностью пустом `core:*`-наборе
`invoke('list_printers')` и `invoke('list_hardware')` отрабатывают, а
`core:path`/`core:app`/`core:event` отвечают `… not allowed`.

**Отсюда правило: каждая новая строка в `generate_handler!` — это расширение
поверхности, доступной модулю, а не только «фича для нашего UI».** См. чек-лист
в §7. За дрейфом следит `pos/scripts/check-tauri-capabilities.mjs`
(`npm run check:tauri-capabilities`, в CI).

## 3. Что реально держит границу

- **Подпись (roadmap #3).** `sync_module_remote` принимает `base_url` от JS, но
  ставит только манифест с Ed25519-подписью ключа из `TRUSTED_REMOTE_KEYS`
  ([`module_remotes.rs`](../pos/src-tauri/src/module_remotes.rs)), сверяет
  sha384 каждого файла и публикует директорию атомарно. Модуль **не может**
  подсунуть себе или другому модулю неподписанный код.
- **`is_safe_segment`** на id и именах файлов — ни traversal, ни разделителей
  ни в путях на диске, ни в `liveshopmodule://`.
- **CSP** (`tauri.conf.json`): `script-src 'self' liveshopmodule:
  http://liveshopmodule.localhost` — стороннего `<script>`/CDN-импорта нет;
  `frame-src 'none'` — iframe нет вовсе.
- **Кто включает.** `pos_stores.module_remotes` правится только владельцем
  магазина, бэкенд санитайзит форму (`sanitizeModuleRemotes`,
  [`src/pos/core/modules.ts`](../src/pos/core/modules.ts)).
- **Не системная схема.** `liveshopmodule://` зарегистрирована внутри нашего
  WKWebView/WebView2, а не в ОС.

Чего эти границы **не** дают: изоляции уже установленного модуля от кассы.
Подпись отвечает на «чей это код», а не на «что этому коду можно».

## 4. Текущий набор прав

[`pos/src-tauri/capabilities/default.json`](../pos/src-tauri/capabilities/default.json):

```json
"permissions": [
  {
    "identifier": "opener:allow-open-url",
    "allow": [{ "url": "https://github.com/merenkoff/tiktok-live/releases/*" }]
  }
]
```

Одно право, потому что фронт из всего Tauri-API использует ровно `invoke`
(не ACL-gated) и один `openUrl` на странице «Обладнання» — открыть страницу
релиза, которую вернул `check_for_update`.

`core:default` убран целиком. Что он давал зря:

| Из `core:default` | Почему не нужно |
|---|---|
| `core:image:allow-from-path` | Примитив «прочитать файл с диска в webview». JS его не вызывает. |
| `core:menu:*`, `core:tray:*` | Подменить меню приложения / завести трей. Касса ни того, ни другого не делает. |
| `core:webview:allow-internal-toggle-devtools` | JS-вызываемое открытие DevTools. (В release-сборке фича `devtools` и так не включена в `Cargo.toml`.) |
| `core:path`, `core:app`, `core:event`, `core:window`, `core:resources` | Ни один из них не импортируется фронтом (`@tauri-apps/api/{path,app,event,window}` в `pos/src` отсутствуют). |

`opener:default` давал `allow-open-url` + `allow-reveal-item-in-dir` +
`allow-default-urls` (весь `http`/`https`/`mailto`/`tel`) — то есть «открыть в
системе любой URL» и «показать файл в проводнике». Сузили до одного шаблона.

**Честная оценка эффекта:** это defense-in-depth, а не изоляция. Главные
опасные примитивы (печать, HID, sync) живут в наших командах и через ACL не
проходят (§2). Ценность сужения — убрать `image:from-path`, меню/трей и
«открыть любой URL» из досягаемости и зафиксировать явный, читаемый минимум.

**Если что-то сломается** — возвращать точечный `core:<sub>:default`, не
`core:default`, и дописывать сюда причину. Пока таких случаев нет.

## 5. Модель доверия

> **Feature-модуль доверен ровно настолько же, насколько само приложение кассы.**

Загруженный модуль может: печатать, читать и писать сессию/офлайн-очередь,
ходить в API от имени текущего пользователя, менять состояние корзины и вообще
подменять любой экран. Это осознанно: модули пишет наша команда, они наши
first-party фичи, просто доставляемые отдельно от релиза приложения.

Из этого следуют правила эксплуатации:

1. **Прод-ключ подписи — критичный секрет.** Кто им подписывает, тот выполняет
   код на всех кассах. Дев-ключ в репозитории детерминированный и не секретный;
   выкатывать с ним нельзя (см. [POS_MODULE_REMOTE_SIGNING.md](POS_MODULE_REMOTE_SIGNING.md)).
2. **Ревью модуля = ревью кода кассы**, с той же планкой.
3. **Чужой (третьесторонний) модуль в этой схеме недопустим** без работы из §6.

## 6. Если появятся третьесторонние модули

Сейчас не делаем — фиксируем варианты и их цену.

| Вариант | Что даёт | Что придётся сломать / сделать |
|---|---|---|
| **Отдельный webview со своим capability-набором** | Настоящая граница: свой origin, свой ACL, наши команды туда не регистрируем. | Модуль теряет общий React/сторы (весь смысл Part A) — нужен IPC-брокер: явный протокол «что модуль может попросить», сериализация, отдельный layout/окно. Самый честный и самый дорогой путь. |
| **iframe + `postMessage`-брокер** | Дешевле окна, изоляция по origin. | Ослабить CSP `frame-src 'none'`; тот же брокер; UX встраивания; `__TAURI_INTERNALS__` во фрейме не появится — команды придётся проксировать. |
| **Worker для не-DOM логики** | Изолирует вычисления модуля от DOM и стора. | Годится только для модулей без своего UI — а весь смысл feature-модуля именно в экране. Частичное решение. |
| **Tauri isolation pattern** | Штатный перехват IPC между фронтом и ядром. | Требует iframe (см. выше) и честно **не** защищает от кода, который сам формирует IPC-сообщение в главном realm. Против враждебного модуля в том же webview — не средство. |

Общий вывод: изоляция стоит не «включить флаг», а переписать контракт между
оболочкой и модулем на явный брокер. Пока модули свои — платить за это незачем.

## 7. Чек-лист перед новой Rust-командой

Команда в `generate_handler!` сразу доступна любому коду в webview, включая
модуль. Перед добавлением:

1. Что она делает с **чужими** аргументами? (`sync_module_remote` — образец:
   `base_url` берётся от JS, но результат гейтится подписью.)
2. Может ли она писать вне `appDataDir` / читать вне известных путей?
3. Даёт ли она сеть с произвольным URL? Что утекает через ответ (статус,
   таймінг)?
4. Нужны ли ей права железа (HID/принтер/камера) и можно ли сузить до
   конкретного устройства?
5. Обновить `EXPECTED_COMMANDS` в `pos/scripts/check-tauri-capabilities.mjs` и
   таблицу в §1 — иначе CI упадёт (и правильно сделает).

---

## Как это проверялось

Живой прогон на macOS, Tauri 2.11.5, с временным boot-пробником, который
складывал результаты в локальный коллектор. Пробник в репозиторий не попал;
воспроизводится по этой таблице.

| Проба | Результат |
|---|---|
| `typeof window.__TAURI__` | `undefined` |
| `typeof window.__TAURI_INTERNALS__` | `object` |
| `invoke('list_printers')` / `list_hardware` / `check_for_update` | OK **при пустом `core:*`** — подтверждает §2 |
| `__TAURI_INTERNALS__.invoke('list_printers')` напрямую, без `@tauri-apps/api` | OK |
| `path.appDataDir()` | `path.resolve_directory not allowed…` |
| `app.getVersion()` | `app.version not allowed…` |
| `event.emit()` | `event.emit not allowed…` |
| `openUrl('https://example.com')` | `Not allowed to open url https://example.com` |
| `openUrl('https://github.com/merenkoff/tiktok-live/releases/tag/pos-v1.0.6')` | открылось в браузере |
| `invoke('sync_module_remote', {id:'returns', baseUrl:'http://localhost:5001/remote-entry.js'})` | `{status:'updated', active:'1.0.6'}`, при перезапуске — `{status:'current'}` из кеша |
| `import('liveshopmodule://localhost/returns/remote-entry.js')` | `{ id:'returns', version:'1.0.6' }` |
| `fetch('liveshopmodule://localhost/returns/style.css')` | `200`, 6794 байт |
| `securitypolicyviolation` за сессию | ноль |

Последние три — **первая живая проверка Part B** (до этого механизм был только
собран и покрыт юнит-тестами): подписанный модуль скачивается, верифицируется в
Rust, кешируется и реально исполняется в кассе.

### Две ловушки, найденные этим прогоном

1. **В `tauri:dev` ремоут не импортируется** — `TypeError: Module name, 'react'
   does not resolve to a valid URL`. Import map (Part A) вставляет
   `scripts/assemble-cashier-dist.mjs` на **сборке**, а dev-сервер Vite отдаёт
   `cashier.html` без него, так что bare-специфайеры в чанке модуля не
   резолвятся. Не баг рантайма — но проверять загрузку модулей надо на
   собранном `dist-cashier`, а не в `tauri:dev`. Как это делалось: собрать
   `build:cashier`, отдать `dist-cashier` статикой и временно указать `devUrl`
   на неё.
2. **`build:cashier` молча падал локально**: `es-module-shims` есть в
   `devDependencies`, но не был установлен в `node_modules`, а
   `assemble-cashier-dist.mjs` на это отвечает `exit 1` — то есть `dist-cashier`
   оставался без import map. Лечится `npm install` в `pos/`; на CI не
   воспроизводится (`npm ci` ставит всё).
