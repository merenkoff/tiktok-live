# POS super admin — `/super`, все магазины по одному паролю

Кросс-магазинная админка внутри POS-веба: обзор всех магазинов и правка их
**модульной конфигурации** — `enabled_modules` и `module_remotes`. Появилась
вместо «скрипта массового обновления `module_remotes`» из
[POS_FISCAL_CHECKBOX_SETUP.md](POS_FISCAL_CHECKBOX_SETUP.md): URL релиза
модуля пинит версию, и каждый выпуск `tiktok-live` / `fiscal-checkbox` /
`stocktake` означал бы правку каждого магазина руками.

## Доступ

- **Пароль — `POS_SUPER_PASSWORD`** в окружении API-сервиса (Railway →
  Variables), рядом с `POS_SECRETS_KEY` и ключом подписи модулей. Минимум 12
  символов; короче — как не задан (503 `super_not_configured` на входе, UI это
  говорит прямо).
- Модель доверия: **кто знает пароль, тот правит модули всех магазинов.** Нет
  ролей, нет пользователя в БД, нет аудита в таблице — только `logger.info`
  (`pos super: …`, с IP и id магазина). Ротация = сменить переменную + redeploy;
  все выданные токены мгновенно перестают работать.
- Вход: `POST /api/pos/super/login {password}` → stateless-токен
  `<expMs>.<hmac>` (12 ч; HMAC-ключ = `sha256(AUTH_SECRET|пароль)`), который
  клиент шлёт в заголовке **`X-POS-Super-Token`** — не в `Authorization`, чтобы
  никогда не быть принятым за стор-сессию. Токен живёт в `sessionStorage`
  (закрыли вкладку — вход заново). Сравнение пароля — `timingSafeEqual` над
  SHA-256. Rate limit входа: 5 неудач с одного IP → 60 с (429) — in-memory,
  для одного инстанса; при масштабировании перенести счётчик в Redis.
- Супер-роуты не читают `pos_sessions` и не выдают стор-токенов: из `/super`
  нельзя «войти как владелец» в кассу.
- CORS: заголовок `X-POS-Super-Token` внесён в `allowedHeaders` в `src/api.ts` —
  без этого при раздельных доменах POS-веба и API логин проходит (заголовка
  ещё нет), а следующий же запрос падает preflight'ом как «Немає зв’язку з
  сервером». Тестовое приложение (`buildPosTestApp`) CORS не поднимает, так что
  это проверяется только на живом стенде.

## Что можно

| Действие | Роут | UI |
|---|---|---|
| Обзор | `GET /api/pos/super/stores` — id, название, slug, `enabled_modules` (эффективный набор), `module_remotes`, TikTok-ник, ПРРО (вкл/провайдер), активные сотрудники, последняя продажа | таблица; remote-модули показаны как `id версия`, если URL — релиз `module-release.yml`, иначе id + короткий URL |
| Правка одного магазина | `PATCH /api/pos/super/stores/:id {enabled_modules?, module_remotes?}` | «Редагувати» в строке: чекбоксы модулей, override-URL для вбудованих, онлайн-модули (URL, «Перевірити джерело», добавить/убрать) |
| Перенацелить модуль | `POST /api/pos/super/module-remotes/repoint {module_id, url, store_ids?}` | панель «Перенацілити модуль»: id, новый URL (версия из URL, проба манифеста), чекбоксы магазинов; отчёт `updated / skipped / failed` |

**Валидация та же, что у владельца** (`sanitizeEnabledModules`,
`sanitizeModuleRemotes`, `assertSingleFiscalRemote` с провайдером магазина):
супер-админ не может сохранить то, что не мог бы владелец. Repoint меняет
только `url`; у объектной записи название/маршрут/меню остаются. Магазин без
этого модуля пропускается — добавить новый онлайн-модуль нужно в редакторе
магазина, где есть title/nav.

Подпись манифеста бэкенд **не** проверяет (ключей доверия у сервера нет и не
должно быть) — «Перевірити джерело» делает это в браузере тем же
`inspectRemoteManifest`, что и Settings владельца, включая предупреждение о
`minHostPlatform` ([POS_MODULE_PLATFORM_VERSION.md](POS_MODULE_PLATFORM_VERSION.md)).

## Что происходит после изменения

То же, что после правки владельцем: веб-касса при следующем `/me` покажет
баннер «Перезавантажити» (`module_remotes` разошлись с применённым на boot),
десктоп-касса подтянет новую версию фоновым синком и предложит перезагрузку
(roadmap #12 трек 1). Кассы, которые сейчас оффлайн, — при следующем выходе
в сеть.

## Не в v1

Создание магазинов, сброс пароля владельца, фискальные креды, любые данные
продаж, аудит в БД. Каждое — отдельная задача.

## Код

- Бэкенд: `src/pos/core/superAuth.ts` (пароль, токен, rate limit, `ensureSuper`),
  `src/pos/super.service.ts` (список, patch, repoint), `src/pos/routes/super.routes.ts`
  (core-группа в `pos.routes.ts`).
- Фронтенд: `pos/src/super/` (`superApi.ts`, `SuperAdminApp`, `StoresPage`,
  `StoreEditor`, `RepointPanel`, `probe.ts`), роут `/super/*` в
  `pos/src/modules/renderRoutes.tsx` только для web-шелла, вне guard.
  Общие правила формы записи `module_remotes` — `pos/src/lib/moduleRemoteForm.ts`
  (их же использует Settings).
- Тесты: `src/__tests__/pos.routes.super.test.ts`, `pos/src/lib/moduleRemoteForm.test.ts`,
  `pos/src/super/superApi.test.ts`, `pos/e2e/super.spec.ts`.
