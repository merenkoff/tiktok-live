# Ліцензування й захист від несанкціонованих копій

Дизайн-док і **точка відновлення**. Тут записано, що й чому робимо, межі, стан кожної фази й
першоджерела, щоб повертатися до роботи без нового аналізу. Документ оновлюється в кожному коміті,
що закриває фазу.

Почато 2026-11-06 на `main` `ea2480d`. Шляхи — від кореня репозиторію. Рішення власника: **обидві
фази, поетапно** (2026-11-05, Л1 нижче).

## Навіщо

Код відкритий (source-available за **OwnNet Source License 1.1**, `LICENSE`). Власник побоюється, що
хтось підніме несанкціоновану копію бекенда на своєму сервері. Три цілі:
- **ослабити клоновану копію** без інфраструктури автора;
- **знати, коли копія працює** — рахувати справжніх клієнтів і бачити несанкціоновані;
- мати **юридичний і технічний важіль**.

Чесно про межу можливого: вихідний код публічний, тож рішуча копія, що **перезбирає shell із
джерел**, може ввімкнути dev-ключ підпису й самостійно хостити все (`pos/src/modules/remoteSigningKeys.ts:40-45`,
`pos/src-tauri/src/module_remotes.rs:70-72`). Зробити source-available код незапускним неможливо. Мета —
підняти вартість клону, зберегти довіру до **офіційних** білдів/сервісів автора й дати **виявлення +
юридичний важіль**, а не ідеальний DRM.

## Межі: чого ми НЕ робимо (і чому — це вимога нашої ж ліцензії)

OwnNet 1.1 сама забороняє «Closed System» (`LICENSE:129-143`, §5.3 `LICENSE:239-245`). Тому цей трек
**ніколи**:
- **не ховає нічого** — жоден коміт не розмазує фічу, щоб обійти рев'ю, не ховає її в наявних таблицях і
  не замовчує в документації. Кожен коміт і PR прямо каже, що робить;
- **не робить kill switch**, що вимикає копію, яку оператор запускає **законно** (§1.12(a): заборонено
  «remote kill switch … without the user's consent and without a documented, self-serviceable
  alternative»);
- **не шле прихований маяк активності користувача** (§1.12(d): заборонено передавати активність «without
  prior explicit, informed, and independently revocable consent»).

Що ліцензія **дозволяє** і в чому ми лишаємося (`LICENSE:145-150`): «ordinary account authentication for
a network service the user chooses to use», «product analytics for which a clear, effective opt-out is
offered and honored», і — найважливіше — «**license-compliance checks that do not disable software the
user already lawfully runs**». Тобто автор може ґейтити **власні** онлайн-сервіси (CDN модулів,
оновлення) на дійсну ліцензію і робити **розкритий** ping перевірки ліцензії без даних користувача —
але локальна копія працює далі в будь-якому разі.

## Що вже захищає нас (наявний moat)

Найцінніше — те, що клон не може відтворити — вже існує. Активи, згруповано:

| Актив | Де | Що втрачає клон |
|---|---|---|
| **Приватний ключ підпису модулів** `POS_REMOTE_SIGNING_KEY` (Ed25519) | лише як секрет CI — `pos/scripts/sign-remote.mjs:28-32,93-102`, `.github/workflows/module-release.yml:194`; довірений keyId `2a73632c13044371` — `pos/src/modules/remoteSigningKeys.ts:20-25` | не може підписати модуль, якому довіряє **офіційний** білд. Онлайн-модулі `tiktok-live`, `fiscal-checkbox`, `fiscal-cashalot` взагалі **не містять коду** в shell (`pos/src/modules/*/manifest.ts`) — на клоні вони не завантажаться (сіра заглушка) |
| **Ключ шифрування секретів** `POS_SECRETS_KEY` (AES-256-GCM + AAD) | `src/pos/core/secrets.ts:65-84,101-103` | дамп БД **марний**: ПРРО-креденшали чужого стора не розшифрувати без ключа автора (пінить `src/__tests__/pos.secrets.test.ts`) |
| **Пароль супер-адміна** `POS_SUPER_PASSWORD` | `src/pos/routes/super.routes.ts:7-8,33-35` | немає доступу до `/super` (огляд усіх сторів, редагування `module_remotes`, ліди) |
| **Канал релізів** jsdelivr `module-builds` + бекенд `the-live.shop` | `.github/workflows/module-release.yml:31-37,249`; `pos/vite.cashier.config.ts:9` (дефолтний API-origin касира) | офіційний касир без `VITE_API_BASE` ходить на прод автора; клон не керує каналом оновлень |

**Чесне застереження (щоб інвентар не вводив в оману):** довіра до dev-ключа — це compile-time прапор у
джерелах, які клон контролює (`remoteSigningKeys.ts:40-45`, `module_remotes.rs:70-72`). Клон, що
**перезбирає shell із джерел**, може ввімкнути dev-ключ і самохостити всі модулі. Чого він **не** може —
змусити **вже роздані офіційні** бінарники автора завантажити щось непідписане прод-ключем, і
розшифрувати прод-секрети автора.

## Фаза 1 — зроблено (ця гілка)

Нічого не ламає для легітимних користувачів; тільки підсилює custody наявного moat і документує його.

### 1A. Цей документ
Інвентар активів вище + межі + план фази 2 нижче.

### 1B. Гвардія «офіційний білд не довіряє dev-ключу» — `pos/scripts/check-prod-no-dev-key.mjs`
Реліз уже перевіряє, що **модуль** підписано прод-ключем (`module-release.yml` крок «Verify it was
signed with the PROD key»). Але ніщо не перевіряло, що **сам host-shell** не зібрано з
`VITE_REMOTE_ALLOW_DEV_KEY=1` / `POS_REMOTE_ALLOW_DEV_KEY=1` — а такий офіційний білд довіряв би
dev-ключу, яким може підписати будь-хто, і завантажив би чужий модуль. Гвардія це закриває, у стилі
`check-tauri-capabilities.mjs` («пін набору, падіння на дрейфі»):
1. **Скан виконавців білда** — лише файли, що реально керують білдом (обидва `package.json`,
   CI-воркфлоу, `Dockerfile*`, e2e-харнес `pos/playwright.config.ts`) можуть зробити білд довірливим до
   dev-ключа. У цьому наборі прапор `*_ALLOW_DEV_KEY=1` дозволено лише dev/test-входам з `APPROVED` у
   скрипті (`build:local`, e2e). Прапор у релізному воркфлоу, Dockerfile чи в `build`/`build:cashier`
   валить гвардію. (Документи й код, що лише **читає** прапор, згадують його ім'я постійно — вони не
   задають його для білда, тож поза скопом.)
2. **Скан виходу** — якщо є зібраний host-bundle (`dist/`, `dist-cashier/`), dev-keyId `a5dae462a776005d`
   має бути tree-shaken'уто з нього; його присутність = бандл довіряє dev-ключу. Пропускається, якщо
   білда нема.

Запуск: `npm run check:prod-no-dev-key` (у `pos/`); у CI — `.github/workflows/pos-tests.yml` поряд із
рештою `check:*`. Щоб додати виняток — редагуй `APPROVED` у скрипті **і** цей розділ; ніколи не додавай
шлях, щоб «пройшов» офіційний білд — натомість прибери з нього прапор.

### 1C. Ротація ключа підпису модулів (runbook)
Allowlist `PROD_REMOTE_KEYS` у `pos/src/modules/remoteSigningKeys.ts:20-25` (і дзеркало в
`pos/src-tauri/src/module_remotes.rs`) приймає **кілька** keyId — тож ключ можна замінити без поломки
роздач:
1. Згенерувати нову пару: `node pos/scripts/sign-remote.mjs --gen-prod` → записати приватну половину в
   секрет CI `POS_REMOTE_SIGNING_KEY` (новий), **не видаляючи старий** одразу.
2. Додати **новий** keyId→pubkey у `PROD_REMOTE_KEYS` і в Rust-дзеркало; оновити `PROD_KEY_ID` у
   `module-release.yml`. Випустити host-реліз (касир/веб), щоб роздані білди довіряли обом ключам.
3. Перепідписати й перевипустити кожен онлайн-модуль новим ключем (Module Release), перепризначити
   `module_remotes` (супер-адмін).
4. Коли всі тили оновилися й усі модулі перепідписані — прибрати **старий** keyId з обох allowlist'ів і
   старий секрет CI наступним host-релізом.

### 1D. Дамп БД марний без `POS_SECRETS_KEY`
Властивість уже запінено `src/__tests__/pos.secrets.test.ts` («never leaves the plaintext in the
envelope», AAD-прив'язка до стора+провайдера, відмова під ротованим ключем). Нового тесту не треба —
лише тримати цей файл зеленим.

## Фаза 2 — бекенд зроблено (розкрита активація ліцензії)

Перевірка відповідності ліцензії, що рахує інсталяції, сигналить про несанкціоновані копії й ґейтить
**власні** онлайн-сервіси автора — і **ніколи не вимикає** законно запущену локальну копію
(`LICENSE:145-150`). Бекендна половина (2A/2B/2C/2E + модель даних для 2F) — у коді; серверний ґейт
автора (2D) і адмінка підрахунку (Ф3) — окремі треки, ще не зроблені.

**Що приземлилось (файли):**
- Перевірка токена: `src/pos/license/token.ts` (`verifyLicenseToken`/`signLicenseToken`, fail-closed,
  ніколи не кидає), довірені публічні ключі — `src/pos/license/keys.ts` (prod keyId `980b166aa890defb`;
  приватна половина лише в секрет-менеджері автора, у репо її нема — як із ключем підпису модулів).
- Стан і heartbeat: `src/pos/license/service.ts` (`computeStatus` — чистий, `GRACE_DAYS=14`;
  `runLicenseHeartbeat` — best-effort пінг за зразком `qr.service.ts`; `getLicenseStatusForOwner`).
- Таблиця: `migrations/094_pos_license_state.sql` — singleton-рядок `id=1` на всю **інсталяцію**
  (перша справді instance-global POS-таблиця), лише дані відповідності, без PII.
- Маршрут: owner-only `GET /api/pos/license/status` (`src/pos/routes/license.routes.ts`, core-група в
  `pos.routes.ts`).
- Крон + boot: щоденний `cron.schedule('20 4 * * *', …)` і fire-and-forget на старті в `src/index.ts` —
  **після** `startServer`, через `runBootHeartbeat` (до 3 спроб з паузою 2 хв, поки сервер не прийме пінг;
  `HeartbeatResult.server_ok`). Чому: деплой автора на `the-live.shop` пінгує **сам себе** через публічний
  домен, який під час заміни контейнера на Railway ще дивиться на старий — 2026-11-06 обидва boot-пінги
  впали по таймауту, і перший пінг зі щойно заданим `LICENSE_KEY` чекав крону цілу добу, а на «Ліцензії»
  висів лише рядок «Без ключа».
- Картка «Про програму» (`pos/src/components/AboutCard.tsx`, рядок «Ліцензія копії»): для власника
  читає `GET /license/status` і пише зеленим «Копія ліцензована · <licensee> · план <plan>», жовтим
  «Ключ дійсний, сервер активації не відповідає», червоним «Копія не ліцензована · <чому>» — слова в
  `pos/src/lib/licenseStatus.ts`; продавцю не показує нічого, невдале читання (офлайн, старіший сервер)
  теж нічого — картка про програму, і збій читання не має виглядати як вердикт. Десктоп отримує рядок
  з наступним POS Release.
- Кейтул автора: `scripts/license-key.mjs` (`--gen` / `--sign` / `--verify`).
- Тести: `src/__tests__/pos.license.test.ts` (валідний / absent / malformed / unknown_key /
  tampered / forged / expired; `computeStatus`).

**Що приземлилось у 2F (приймач + адмінка підрахунку, окремий PR поверх 2A-E):**
- Таблиця: `migrations/095_pos_license_activations.sql` — дзеркало 094 на боці АВТОРА: рядок на
  `(fingerprint, instance_id, origin)`, лише дані сумісності, повторний пінг лише піднімає `seen_count`.
- Приймач: публічний `POST /api/license/activation` (`src/api.ts`, за зразком `/api/leads` — ліміт тіла,
  глобальний ліміт частоти; відсутній/невалідний токен навмисно записується, а не відкидається).
- Інжест + читання: `src/pos/license/activations.service.ts` (`recordActivation`, `listLicenses`,
  `getLicense`): `fingerprint` = sha256 токена ('' = «без ключа»), `installs` = різних `instance_id`,
  `over_limit` = installs > `instance_limit` токена, `cloned` = один `instance_id` з кількох origin.
  Origin копія бере лише з того, що на деплої є заради самої каси (`reportedOrigin` у `service.ts`:
  `RAILWAY_PUBLIC_DOMAIN`, який Railway ставить сам, потім перший `http(s)` origin із `CORS_ORIGINS`) —
  навмисно НЕ з `PUBLIC_BASE_URL`, бо та лишається для адрес гостьового QR-меню (`public-menu/urls.ts`),
  а змінна, яку ставлять, щоб її звітували, найлегше ставиться неправдиво (рішення власника 2026-11-07);
  і ніколи не вгадує домен автора — інакше клон без змінної звітував би як `the-live.shop` і сигнал
  клона осліп би. Будь-який origin — слово самої копії; чого вона не вибирає, так це адреси, з якої
  приходить пінг. Приймач додатково пише адресу, з якої прийшов пінг
  (міграція `096`, `remote_ip` — останній запис `X-Forwarded-For`, той, що дописав проксі Railway;
  `remoteIpOf`), і картка показує «IP …» замість «(невідомо)» для копії, що не назвала origin
  (`originLabel`/`originNote` в `pos/src/super/licenseLabels.ts`). Власний деплой автора 2026-11-06
  пінгував як «(невідомо)», бо `PUBLIC_BASE_URL` там не задано.
- Читання власника: owner/super `GET /api/pos/super/licenses` і `…/:fingerprint`
  (`src/pos/routes/super.routes.ts`, `ensureSuper`); єдиний запис — `DELETE …/:fingerprint`
  (`deleteLicense`, `none` = група без ключа, 404 коли нічого не лишилось): кнопка «Видалити записи» в
  картці ліцензії з підтвердженням. Навіщо: копія, що пінгувала до того, як їй задали `LICENSE_KEY`,
  лишає рядок «Без ключа» поруч зі своєю справжньою ліцензією назавжди (групування — за sha256 токена,
  порожній токен — окрема група), а запис — лише історія пінгів: копія, що працює, з'явиться знову з
  наступним пінгом.
- Адмінка: вкладка «Ліцензії» в супер-адмінці (`pos/src/super/LicensesPage.tsx` + `LicenseCard.tsx`,
  `superApi.listLicenses/getLicense`) — хто, скільки копій, понад ліміт, клон, і origin для скарги.
- Тести: `src/__tests__/pos.license-activations.test.ts` (приймач, ідемпотентність, підрахунок,
  over-limit, клон, гейт `ensureSuper`) + `pos/src/super/licenseLabels.test.ts`.

Деталі дизайну (нижче лишені як специфікація контракту):

- **2A. Токен ліцензії = Ed25519-підпис** над малим JSON `{ licensee, plan, issued_at, expires_at?,
  instance_limit?, nonce }`. Сайт автора підписує приватним ключем (лише на інфрі автора); бекенд
  вшиває лише **публічний** ключ і перевіряє через `node:crypto` `crypto.verify(null, …)` — новий
  примітив у `src/` (сьогодні там лише HMAC/AES — `src/core/auth.ts`, `src/pos/core/secrets.ts`), за
  зразком клієнтського `pos/src/modules/remoteVerify.ts`. Клон не підробить токен. Оператор задає
  `LICENSE_KEY` (і опційно `LICENSE_SERVER_URL`, дефолт `https://the-live.shop`) — у `.env.example` і
  `TechDocs/RAILWAY_POS.md`.
- **2B. Ping активації (розкритий лічильник інсталяцій + сигнал невідомої копії).** На старті й щоденним
  `cron.schedule(...)` у Кроці 5 `src/index.ts:103-256` (та сама форма try/catch, що й GTIN/fiscal
  крони) POST на `<LICENSE_SERVER_URL>/api/license/activation` **лише дані відповідності ліцензії**: id
  ліцензії, стабільний випадковий `instance_id` (генерується раз, у новій `pos_license_state`),
  `appVersion`, `PUBLIC_BASE_URL`. **Жодних даних користувача, каталогу, PII** — саме це тримає нас у
  §1.150 і поза §1.12(d). Патерн — `src/pos/qr.service.ts:82-116,256-275`: `fetch` +
  `AbortSignal.timeout(5000)` + `catch → logger.warn → no-op`. **Ніколи не кидає далі крон-обгортки;
  старт ніколи не падає через нього.**
- **2C. М'яка деградація — НЕ kill switch.** Нема/невалідний/протермінований токен або сервер недоступний:
  POS працює далі (health, логіни, продажі). Натомість: `logger.warn`; owner-only
  `GET /api/pos/license/status` → `licensed | unlicensed | unreachable` (видно в супер-адміні); валідний
  токен кешується з власним expiry, heartbeat може падати N днів до статусу `unreachable` — документовано,
  оператор може перевписати ключ (та «documented, self-serviceable alternative», якої вимагає §1.12(a)).
- **2D. Важіль = ґейт ВЛАСНИХ сервісів автора, не локальної копії.** Ендпоінти `the-live.shop` вимагають
  дійсну ліцензію; нема ліцензії → 403 **від сервера автора**. Це «authentication for a network service
  the user chooses to use» (§1.145), явно **не** Closed System. Несанкціонований клон **офіційної
  збірки** працює на тому, що має, але не отримує оновлень.

  **Знахідка по архітектурі (чому гейт вузький):** оновлення десктопу йдуть з **GitHub Releases**, а
  онлайн-модулі — з **jsdelivr** за публічними URL у `module_remotes`; POS-API та LIVE-міст — це **власний
  сервер кожного деплоя**. Тобто єдиний канал автора, який варто й можна гейтити без вимкнення чужого
  POS, — це **фід оновлень десктопу**, перенаправлений на `the-live.shop`.

  **2D-A — ЗРОБЛЕНО (бекенд + канал):**
  - `src/pos/license/entitlement.ts`: чистий `checkEntitlement(token)` + Fastify-ґард `requireValidLicense`
    (токен із заголовка `X-License-Key` або `?key=`, перевірка публічним ключем, 403 інакше).
  - `GET /api/license/entitlement` (`src/api.ts`): перевірка токена — 200 `{entitled:true,…}` або 403.
  - `GET /api/updates/latest.json` (`src/api.ts`): фід оновлень. **За замовчуванням прозорий проксі**
    upstream `latest.json` (нуль змін поведінки); з `LICENSE_UPDATE_GATE=on` вимагає валідний токен,
    інакше 403; тіло проксі **дослівне**, щоб підпис оновлення (`pubkey` у `tauri.conf`) не ламався; збій
    upstream → 502 (updater трактує як «оновлення нема», не цеглина). Upstream задається
    `LICENSE_UPDATE_UPSTREAM` (дефолт — GitHub latest.json проєкту).
  - `pos/src-tauri/tauri.conf.json`: updater тепер вказує **лише** на `the-live.shop/api/updates/latest.json`
    (один ендпоінт, щоб gate не обходився фолбеком на GitHub).
  - Тести: `src/__tests__/pos.license-entitlement.test.ts` (verdict, entitlement 403, gate off→проксі,
    gate on→403, 502-upstream).

  **2D-B — ще НЕ зроблено (десктоп):** щоб гейт «кусався» per-deployment, офіційна каса має слати свій
  лицензійний токен у `X-License-Key`. Це означає перехід з вбудованого auto-updater на програмний
  `@tauri-apps/plugin-updater` `check({ headers })` + віддача токена з бекенду деплоя при логіні. Потребує
  Tauri-збірки для перевірки, тож окремий PR + POS Release. **Поки `LICENSE_UPDATE_GATE` вимкнено** фід —
  чистий проксі, нічого не ламається.
- **2E. Розкриття (що робить 2B законним).** Розділ у цьому доці + абзац у `README.md`/`NOTICE` +
  коментовані записи в `.env.example`: прямо — що ping шле, куди, навіщо (відповідність ліцензії), і що
  він **ніколи не вимикає** законну копію.
- **2F. Підрахунок — ЗРОБЛЕНО.** Серверний `/api/license/activation` пише `(fingerprint, instance_id,
  origin)` = лічильник інсталяцій; невідомі/невалідні ключі = кандидати на несанкціоновані копії, для
  **юридичного** супроводу (не технічного вимкнення). Панель перегляду — звичайна, **не прихована**
  вкладка «Ліцензії» в супер-адмінці на `the-live.shop`. Клон виявляється через один `instance_id` з
  кількох `origin` (клон копіює й базу з `instance_id`); перевищення договору — `installs >
  instance_limit`; origin кожної копії — на кого подавати скаргу.

## Фази

| # | Фаза | Що | Стан |
|---|---|---|---|
| Ф1 | Moat: custody + документація | цей док; гвардія `check:prod-no-dev-key`; runbook ротації; пін `pos.secrets.test.ts` | **в роботі** (ця гілка) |
| Ф2-A/B/C/E | Активація ліцензії (бекенд) | Ed25519-перевірка токена, `pos_license_state`, env, `GET /license/status`, boot/cron ping, м'яка деградація, розкриття | **зроблено** |
| Ф2-F | Приймач активацій + підрахунок + адмінка | `POST /api/license/activation`, `pos_license_activations`, `GET /super/licenses`, вкладка «Ліцензії» (installs/over-limit/clone/origin) | **зроблено** |
| Ф2-D-A | Ґейт власних сервісів (бекенд + канал оновлень) | `requireValidLicense`, `GET /api/license/entitlement`, `GET /api/updates/latest.json` (проксі, enforcement за `LICENSE_UPDATE_GATE`), updater → `the-live.shop` | **зроблено** |
| Ф2-D-C | Ґейт роздачі онлайн-модулів (open-core, `POS_OPENCORE.md` §8) | токен доставки **в шляху** (`/api/modules/t/<token>/<id>/<ver>/*`), який деплой отримує за свій `LICENSE_KEY` (`POST /api/modules/token`) і сам вставляє в URL модулів у відповіді логіну — ключ ліцензії до каси не доходить, каси не змінюються; закрите сховище бандлів на томі (`.module-bundles`, `/pos-uploads` його не віддає) перед публічним jsdelivr; журнал виданого `pos_module_issues` (міграція `097`) — протермінована ліцензія отримує лише видане раніше (§1.12); `Access-Control-Allow-Origin: *`, `Cache-Control: private`; enforcement за `LICENSE_MODULE_GATE` (дефолт off = прозоро) | **зроблено** (бекенд); заливка в сховище з Module Release — `POS_OPENCORE.md` O-3 |
| Ф2-D-B | Десктоп шле свій токен в `X-License-Key` | перехід на програмний `plugin-updater` + токен із логіну; робить gate **оновлень** per-deployment (модулям не потрібен — 2D-C несе токен у шляху) | — (потребує Tauri-збірки) |

## Рішення власника

| # | Рішення | Дата |
|---|---|---|
| Л1 | Робимо обидві фази поетапно: спершу підсилити moat (без нового ризику), потім додати розкриту активацію | 2026-11-05 |
| Л2 | Прихованого маяка, kill switch чи обходу рев'ю — не робимо (суперечить власній OwnNet 1.1); усе розкрито й документовано | 2026-11-05 |
