# `tiktok-live` — первый реальный online-only модуль POS

Экран «Прямий ефір» внутри POS: лента комментариев TikTok LIVE, счётчики и
кнопки старт/стоп трансляции. Первая настоящая фича, построенная на механизме
module-remotes ([POS_MODULE_REMOTE_ROADMAP.md](POS_MODULE_REMOTE_ROADMAP.md) #13,
части C и D) — POS-оболочка **не везёт под неё кода**.

До этого то же самое жило в отдельной SPA `admin/`. Она никуда не делась;
модуль — второй потребитель того же LIVE-API, живущий в кассе.

---

## Что где лежит

| | |
|---|---|
| Код модуля | `pos/src/modules/tiktok-live/**` |
| Сборка | `pos/vite.tiktok-live-remote.config.ts` → `pos/dist-remotes/tiktok-live/` |
| Скрипты | `npm run build:tiktok-live-remote` / `serve:tiktok-live-remote` (:5004) / `check:tiktok-live-css-coverage` |
| Мост авторизации | `src/pos/routes/live.routes.ts` → `POST /api/pos/live/session-token` |
| Схема | `migrations/017_pos_live_link.sql` — `pos_stores.live_tiktok_username` |
| Настройка | Адмінка → Налаштування → «TikTok LIVE» (owner-only, `PATCH /api/pos/store`) |
| Регистрация модуля | `pos_stores.module_remotes['tiktok-live']` (объектная форма) |

Внутри модуля: `lib/liveSocket.ts` (порт `admin/src/services/websocket.ts`),
`lib/liveClient.ts` (токен + `/api/sessions/*`), `lib/wsUrl.ts`,
`hooks/useLiveAuth|useLiveLogs|useLiveSession.ts` (порт `admin/src/hooks/useLogs.ts`
и react-query-шного `useSession`), `components/LiveLogs|SessionControl.tsx`,
`pages/LiveDeskPage.tsx` (порт `admin/src/pages/SessionPage.tsx` без `<Header>`).

---

## Мост авторизации POS → LIVE

Оператор логинится **один раз**, в POS. У LIVE-подсистемы своя авторизация
(`src/core/auth.ts`, HMAC-токен на 7 дней). Мост меняет одно на другое:

```
POST /api/pos/live/session-token        (Bearer — POS-сессия любого сотрудника)
  → ensurePosAuth
  → SELECT live_tiktok_username FROM pos_stores WHERE id = <storeId>
  → нет ника  → 409 { error: 'live_not_configured' }
  → есть      → loginUser(nickname) → 200 { token, user, expiresAt }
```

Дальше модуль ходит в `/api/sessions/*` и в WebSocket `/api/sessions/logs/stream`
уже LIVE-токеном.

**Слоение.** POS-плагин в LIVE-ядро больше нигде не лезет; `live.routes.ts` —
единственное намеренное исключение, и его вся поверхность — один именованный
импорт `loginUser`. Оба дерева роутов регистрируются в один Fastify-инстанс
(`src/api.ts`), делят `AUTH_SECRET` и `pool`, поэтому это внутрипроцессный
вызов. Если POS-бэкенд когда-нибудь выделят в отдельный сервис — этот хендлер
станет HTTP-вызовом LIVE-сервисного `POST /api/auth/login`, и больше ничего не
поменяется.

**Уровень доступа.** Мост — для **любого** авторизованного сотрудника, не
owner-only: эфир ведёт продавец. Чувствительное действие — привязка магазина к
TikTok-аккаунту — остаётся owner-only в `PATCH /api/pos/store`. Роут
зарегистрирован как core-группа (`moduleId: null` в `POS_ROUTE_GROUPS`): модуль
опт-инится через `module_remotes`, а не через `enabled_modules`, так что
`ensureModule` тут нечего проверять; гейт — `ensurePosAuth` + 409.

**Кеш токена.** `loginUser` идемпотентен (`createOrGetUser` +
`ensureDefaultSettings`), серверного стора токенов нет (`verifyToken` —
stateless HMAC), поэтому минт дешёвый. Клиент (`lib/liveClient.ts`) держит
токен в памяти и в `localStorage['live_token']`, ре-минтит превентивно, когда до
`expiresAt` меньше суток, и ровно один раз по 401 — второй 401 это ошибка, а не
повод зациклиться.

---

## Как модуль попадает в магазин

Объектная запись в `pos_stores.module_remotes` (валидируется бэкендовым
`sanitizeModuleRemotes`, `src/pos/core/modules.ts`):

```json
{ "tiktok-live": {
    "url": "http://localhost:5004/remote-entry.js",
    "title": "Прямий ефір",
    "routePath": "/live",
    "icon": "Video",
    "nav": [ { "label": "Ефір", "location": "cashier-primary", "order": 85,
               "icon": "Video", "match": "/live" } ]
} }
```

`id` обязан быть ровно `tiktok-live` — и в `manifest.ts`, и в ключе JSON: иначе
`applyModuleRemotes` отклонит скачанный дескриптор. `icon` держать в синхроне с
`manifest.ts`: до скачивания nav рисует плейсхолдер по этому JSON, после —
по манифесту, и разъезд будет виден глазом.

Запись `admin-sidebar` живёт только в собранном `manifest.ts` — плейсхолдеру
до скачивания нужна лишь `cashier-primary`.

Быстрый способ для демо-стора:

```bash
POS_SEED_TIKTOK_LIVE=1 npm run pos:seed
```

(по умолчанию выключено: запись, чей хост не поднят, на десктоп-кассе рисует
серый «не скачан» пункт в рейле). Переменные `POS_SEED_TIKTOK_LIVE_URL` и
`POS_SEED_TIKTOK_LIVE_USERNAME` переопределяют дефолты
`http://localhost:5004/remote-entry.js` и `demo_live`.

Или SQL:

```sql
UPDATE pos_stores
SET live_tiktok_username = 'demo_live',
    module_remotes = COALESCE(module_remotes,'{}'::jsonb) || jsonb_build_object(
      'tiktok-live', jsonb_build_object(
        'url','http://localhost:5004/remote-entry.js','title','Прямий ефір',
        'routePath','/live','icon','Video',
        'nav', jsonb_build_array(jsonb_build_object(
          'label','Ефір','location','cashier-primary','order',85,
          'icon','Video','match','/live'))))
WHERE slug = 'demo';
```

---

## Проверка end-to-end

Предусловия: задан `AUTH_SECRET`, накатаны миграции (`npm run pos:migrate`
— включает `017`), бэкенд на `:3000`.

### Веб

```bash
cd pos && npm run build:tiktok-live-remote && npm run serve:tiktok-live-remote   # :5004
cd pos && npm run dev                                                            # :3002
```

1. Логин владельцем в `demo` (`owner@demo.shop` / `owner123`).
2. **Перезагрузить вкладку один раз** — `applyModuleRemotes()` бежит до маунта
   React по уже закешированному `pos_auth`, а на самом первом логине записи там
   ещё нет.
3. Ожидать «Ефір» в кассовом рейле и «Прямий ефір» в сайдбаре `/admin`.
4. Network: `POST /api/pos/live/session-token` → 200, `GET /api/sessions/current`,
   WS `ws://localhost:3000/api/sessions/logs/stream?token=…`.
5. «Почати ефір» → статус «Активна», тикает таймер; входящий лог → новая цветная
   строка с автоскроллом; «Зупинити ефір» → `/api/sessions/stop`.
6. `npm run check:tiktok-live-css-coverage`, `check:platform-boundary`,
   `check:tauri-capabilities` — зелёные.

### Десктоп

`cd pos && npm run tauri:build` (или `tauri:dev`).

1. Первый запуск офлайн → пункт `/live` серый (`indicator: 'pending'`), экран
   `RemoteModuleUnavailablePage` с кнопкой «Спробувати зараз».
2. Онлайн + retry → Rust `sync_module_remote` качает `:5004`, проверяет
   Ed25519-подпись и отдаёт из `liveshopmodule://localhost/tiktok-live/…`.

> Дев-цикл вести на web (`npm run dev`, :3002): в браузерном `dev:cashier` без
> Tauri команда `sync_module_remote` недоступна, поэтому там всегда плейсхолдер.

---

## Оговорки

1. **Один LIVE-пользователь на магазин ⇒ одна общая сессия.** Все сотрудники
   минтят токен для одного `live_tiktok_username`, а `sessionManager` ключуется
   по LIVE `user_id`. Значит два оператора делят одну трансляцию, и «Стоп»
   любого останавливает эфир для всех. Это намеренная store-level модель, а не
   недосмотр.
2. **На вебе недоступный remote-хост деградирует тихо.** `applyModuleRemotes`
   логирует `remote_load_fallback`, и nav «Ефір» с роутом `/live` просто не
   существуют — без экрана ошибки. На десктопе в том же случае остаётся серый
   плейсхолдер. Разница в том, что `syncRemote` есть только на кассе.
3. **Первый вход требует одной перезагрузки** — см. шаг 2 проверки выше.
4. **LIVE-токен уезжает в query-string WebSocket-URL** и может осесть в логах
   прокси (валиден 7 дней). Унаследовано от `admin/`: браузерный `WebSocket` не
   даёт заголовков. Приемлемо, но знать стоит.
5. **CSP десктопа.** `connect-src` в `pos/src-tauri/tauri.conf.json` расширен на
   `wss:` + `ws://localhost:*` + `ws://127.0.0.1:*` — `https:` не покрывает
   `wss:` надёжно в WKWebView/WebKitGTK, а WebSocket управляется именно
   `connect-src`. Права Tauri (capabilities) при этом не менялись.
6. **CORS.** В dev `src/api.ts` пускает любой localhost-порт, так что `:3002`
   ходит и в `/api/sessions/*`, и в WS. Для прод-деплоя POS на отдельном домене
   этот origin нужно добавить в `CORS_ORIGINS`; при same-origin деплое делать
   ничего не надо.
7. **Пустая лента при остановленной сессии — норма.** `getLogs` вернёт `[]`,
   `/api/sessions/current` — `null`; ни то, ни другое не ошибка.
8. **Async-чанк `LiveDeskPage` не покрыт подписью.** `remoteVerify.ts` хеширует
   только `remote-entry.js` и `style.css` — как и у `returns`/`stock`/`products`
   (см. [POS_MODULE_REMOTE_SIGNING.md](POS_MODULE_REMOTE_SIGNING.md)). На
   десктопе всю папку целиком качает и проверяет Rust.
9. **`loginUser` не чистый ридер** — при первом мосте создаёт LIVE-запись
   пользователя и `user_settings`. Идемпотентно.
10. **`live_tiktok_username` нет в `AuthResponse.store`** и добавлять не надо:
    мост резолвит ник сам по `posAuth.storeId`, а экран настроек читает его
    через `GET /api/pos/store`.

---

## Тесты

- `src/__tests__/pos-live-session-token.test.ts` — мост: 401 без сессии, 409 без
  привязки, минт, который принимает `verifyToken`, идемпотентность, создание
  `user_settings`. Требует LIVE-схему поверх POS-овской (`applyLiveMigrations()`
  в `src/__tests__/helpers/pos-fixtures.ts`).
- `pos/src/modules/tiktok-live/**/*.test.ts(x)` — диспатч WS-фреймов, счётчик
  минтов в `liveClient` (кеш, один ре-минт по 401, отсутствие цикла), реконнект
  `useLiveLogs` с ре-минтом, поллинг `useLiveSession`, контракт манифеста
  (id / `alwaysEnabled` / имена иконок / формы роутов) и рендер экрана.
