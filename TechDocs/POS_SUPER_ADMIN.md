# POS super admin — `/super`, все магазины по одному паролю

Кросс-магазинная админка внутри POS-веба: обзор всех магазинов и правка их
**модульной конфигурации** — `enabled_modules` и `module_remotes`. Появилась
вместо «скрипта массового обновления `module_remotes`» из
[POS_FISCAL_CHECKBOX_SETUP.md](prro/checkbox/POS_FISCAL_CHECKBOX_SETUP.md): URL релиза
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
  SHA-256. Rate limit входа: 5 неудач с одного IP → 60 с (429) — in-memory;
  API — одна реплика (том, `POS_SINGLE_INSTANCE.md`), так что счётчик корректен.
  Но без `trustProxy` `request.ip` — адрес прокси Railway, поэтому блокировка
  фактически **общая на всех**, а не «с одного IP» (`TRUST_PROXY_HOPS`, см. там же).
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
| Новый магазин | `POST /api/pos/super/stores {name, slug, template_store_id, owner_login, owner_password, owner_name?}` → 201 / 400 / 409 | кнопка «Новий магазин»: назва, код (підказка з назви), шаблон, власник, пароль; після — плашка «Передайте власнику» без пароля ([POS_ONBOARDING.md](POS_ONBOARDING.md)) |
| Лиды с сайта | `GET /api/pos/super/leads?status=&interest=&q=&limit=&offset=`, `GET /api/pos/super/leads/:id`, `PATCH /api/pos/super/leads/:id {status?, note?}` | вкладка «Ліди» (`/super/leads`): статус-чипи, фільтр за продуктом, пошук; картка з історією заявок, статусом і нотаткою ([CRM_LEADS.md](CRM_LEADS.md)) |

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

## Лиды с сайта (CRM_LEADS.md, 2026-10-24)

Супер-админ — **единственное** место, где лиды с `the-live.shop` можно прочитать. Старый
`GET /api/admin/leads` пускал любой LIVE-токен, а его выпускает `POST /api/pos/live/session-token`
любому сотруднику магазина с подключённым TikTok — то есть телефоны всех лидов платформы видел
любой кассир. Маршрут удалён. Это не данные магазина (нет `store_id`), поэтому «любые данные продаж»
в «Не в v1» к ним не относится. Правила и якоря — в [CRM_LEADS.md](CRM_LEADS.md).

## Что происходит после изменения

То же, что после правки владельцем: веб-касса при следующем `/me` покажет
баннер «Перезавантажити» (`module_remotes` разошлись с применённым на boot),
десктоп-касса подтянет новую версию фоновым синком и предложит перезагрузку
(roadmap #12 трек 1). Кассы, которые сейчас оффлайн, — при следующем выходе
в сеть.

## Новый магазин (POS_ONBOARDING.md, O1, 2026-10-26)

До этого реальный магазин нельзя было завести инструментом — только демо, миграциями.
`createStore` (одна транзакция) копирует из шаблона **только настройку** — `vertical`,
`enabled_modules`, `module_remotes`, `nav_overrides`, валюту и часовой пояс; каталог, персонал,
токен QR-меню, ПРРО и профиль заведения у клиента свои. Владелец — `role='owner'` с логином и
паролем, который вводит супер-админ (≥ 10 символов, только bcrypt-хэш, не логируется и не
возвращается); PIN владелец добавит сам. Код магазина — `^[a-z0-9][a-z0-9-]{2,40}$`, в нижнем
регистре, потому что `loginWithPin` сравнивает введённое в нижнем регистре; занятый (в любом
регистре) — 409. Если в шаблоне есть модуль `tables`, создаётся один пустой зал «Зала».

## Не в v1

Сброс пароля владельца, фискальные креды, любые данные
продаж, аудит в БД. Каждое — отдельная задача.

## Код

- Бэкенд: `src/pos/core/superAuth.ts` (пароль, токен, rate limit, `ensureSuper`),
  `src/pos/super.service.ts` (список, patch, repoint, `createStore`), `src/pos/routes/super.routes.ts`
  (core-группа в `pos.routes.ts`).
- Фронтенд: `pos/src/super/` (`superApi.ts`, `SuperAdminApp` — оболонка з вкладками «Магазини» `/super`
  і «Ліди» `/super/leads`, `StoresPage`, `LeadsPage`, `LeadCard`, `leadLabels.ts`,
  `StoreEditor`, `RepointPanel`, `NewStoreDialog` + `storeCode.ts`, `probe.ts`), роут `/super/*` в
  `pos/src/modules/renderRoutes.tsx` только для web-шелла, вне guard.
  Общие правила формы записи `module_remotes` — `pos/src/lib/moduleRemoteForm.ts`
  (их же использует Settings).
- Лиды: `src/crm/` (`leads.service.ts`, `journey.ts`, `sources.ts`, `limits.ts`), три маршрута
  `/super/leads*` в `super.routes.ts`, миграция `070_crm_leads.sql`.
- Тесты: `src/__tests__/pos.routes.super.test.ts`, `src/__tests__/pos.super.create-store.test.ts`, `pos/src/super/storeCode.test.ts`, `pos/src/lib/moduleRemoteForm.test.ts`,
  `pos/src/super/superApi.test.ts`, `pos/src/super/leadLabels.test.ts`, `pos/e2e/super.spec.ts`.

## Тип магазину (вертикаль)

Третє поле, яке править супер-адмін: `pos_stores.vertical` — що магазин продає
(«Одяг», «Квіти»). Воно задає схему атрибутів товару, дозволені одиниці виміру
та модуль `vertical-<id>`, який малює каталог на екрані продажу
(TechDocs/POS_VERTICALS.md).

Чому не власник: вертикаль визначає схему атрибутів каталогу, який власник уже
наповнив, і її зміна перебудовує підписи всіх варіантів магазину. Власницький
`PATCH /store` відповідає 400 на `vertical` у тілі, а колонки немає в
`STORE_PATCH_COLUMNS`, тож інакше її не записати. Власник бачить тип read-only
в «Налаштуваннях».

Валідація (та сама в обидва боки, у якому б порядку зміни не приходили):
не більше одного запису `vertical-*` у `module_remotes`, і він має збігатися з
колонкою — інакше 400. `vertical-clothing` вбудований і записом бути не може.
Магазин можна перевести на вертикаль, модуль якої ще не підключено: каса
продаватиме на загальному (вбудованому) каталозі, і редактор про це попереджає.
