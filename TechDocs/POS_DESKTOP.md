# POS Desktop (Tauri 2)

Десктопна каса: те саме React-UI, окремий Vite entry, оболонка **Tauri 2**. Адмінка лишається сайтом. Офлайн (каталог, PIN, продажі, клієнти) — лише в cashier-shell.

Пов’язано: [[RAILWAY_POS]] · [[POS_POST_MVP]] · [`pos/UI_CASHIER.md`](../pos/UI_CASHIER.md)

## Рішення

| Шар | Технологія | Навіщо |
|-----|------------|--------|
| Сайт (Railway `pos/`) | Vite + React SPA як раніше | Адмінка + каса в браузері; деплой не ламаємо |
| Десктоп | Той самий React, entry каси + Tauri 2 | Вікно Win / Mac / Ubuntu 22.04 лише з касою |
| Бізнес-логіка | TypeScript (Zustand, Axios, сторінки каси) | Rust не містить продажів, каталогу, синку |
| Офлайн каса | IndexedDB (Dexie) + черга в TS | PIN, каталог, продажі, клієнти; адмінка/склад — лише онлайн |

**Чому Tauri 2, а не Electron.** Каса — кіоск на слабшому ПК, UI вже веб. Tauri дає системний webview, малий інсталятор і RAM. Slack/Electron має сенс, коли потрібен той самий Chromium скрізь; для цієї каси зайвий. Уся логіка в TS: офлайн не вимагає міграції на Electron.

**Не в скоупі** (станом на першу поставку; ESC/POS і автооновлення відтоді з'явилися — `src-tauri/src/hardware/`, `update.rs`)**:** підпис/нотарізація бінарів, офлайн на сайті адмінки, складські документи офлайн (виняток з 2026-09-09: лист інвентаризації на касі — модуль `stocktake` зі своєю офлайн-чергою, проводка лишається на вебі — [POS_MODULE_OFFLINE_DATA.md](POS_MODULE_OFFLINE_DATA.md)), Rust-SQLite.

```
[Браузер: index.html + App.tsx]
    /admin ─────────────────────────┐
    /register /customers ───────────┤
                                    ▼
[Tauri: cashier.html + CashierApp.tsx] ──► Fastify /api/pos
    /login /register /customers
```

## Два entry

Код каси спільний: `RegisterPage`, `CustomersPage`, `api.ts`, Zustand.

| | Веб | Десктоп |
|--|-----|---------|
| HTML | [`pos/index.html`](../pos/index.html) | [`pos/cashier.html`](../pos/cashier.html) |
| Entry | [`pos/src/main.tsx`](../pos/src/main.tsx) | [`pos/src/cashier-main.tsx`](../pos/src/cashier-main.tsx) |
| Роутер | `BrowserRouter` | `HashRouter` (SPA всередині webview без 404 на `/register`) |
| Роути | повний SPA, див. `App.tsx` | екрани каси (`/login`, `/register`, `/orders`, `/customers`, `/sales`, `/hardware`) + для власника сторінки кабінету з прапорцем `desktop` — лише «Товари» (`/admin/products…`, `/admin/modifiers`, `/admin/tech-cards`) у рамці каси, бо принтери тут (2026-10-19) |
| Shell | `PosShellContext` = `web` | `cashier` |
| Owner після логіну | `/admin` | `/register` |
| Посилання в rail/nav на адмінку | так, для owner | приховані |

Контекст: [`pos/src/shell.tsx`](../pos/src/shell.tsx). Збірка каси: [`pos/vite.cashier.config.ts`](../pos/vite.cashier.config.ts) → `dist-cashier/` (порт **3003**). Сайт як і раніше: `vite.config.ts` → `dist/`, порт **3002**, Dockerfile Railway без змін.

`VITE_API_BASE` bake-in у [`pos/src/lib/urls.ts`](../pos/src/lib/urls.ts). **Десктоп-каса за замовчуванням** б’є в прод API `https://the-live.shop` ([`pos/vite.cashier.config.ts`](../pos/vite.cashier.config.ts)) — після clone `npm run tauri:dev` / `tauri:build` без `.env`. Перевизначити: змінна оточення або [`pos/.env`](../pos/.env) (шаблон [`pos/.env.example`](../pos/.env.example)). Сайт (`npm run dev` / Railway Docker ARG) цим дефолтом не користується.

## Запуск

Потрібні **Node 20+**, **Rust** (rustup) і системні бібліотеки webview.

### Ubuntu 22.04

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf build-essential curl wget file
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Актуальний список: [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

### Команди (з каталогу `pos/`)

Після clone каса вже ходить на `https://the-live.shop`. Локальний `.env` не обов’язковий.

```bash
# Лише каса в браузері (той самий entry, що Tauri): :3003
npm run dev:cashier

# Вікно Tauri (піднімає dev:cashier сам; перша компіляція Rust ~кілька хвилин)
npm run tauri:dev

# Інсталятор поточної ОС → pos/src-tauri/target/release/bundle/
npm run tauri:build
```

Сайт каса+адмінка лишається `npm run dev` на `:3002` (прокси на локальний API). Для десктопа локальний `:3000` не потрібен.

`tauri.conf.json`: `bundle.targets = all`. Збірка `.msi` / `.dmg` — на відповідній ОС (на Ubuntu вийде AppImage/deb). Автооновлення є (`update.rs`, кнопка на «Обладнанні»; macOS і Linux AppImage ставлять самі, Windows дає посилання); code signing — ні.

## CORS

Прод-webview Tauri шле Origin `https://tauri.localhost` (інколи `http://tauri.localhost` / `tauri://localhost`). Вони в allowlist [`src/api.ts`](../src/api.ts). Dev на `:3003` покриває `isLocalDev` (будь-який localhost-порт).

Якщо API на іншому хості — `VITE_API_BASE` = публічний URL API без слеша в кінці (як у [[RAILWAY_POS]]).

## Офлайн каса

Повний офлайн (черга продажів, резерв кодів ПРРО, device id) працює лише в десктопному entry (`cashier-main.tsx` → `enableOfflinePos()` **через `@pos/platform`**, не відносним імпортом — `offline/enabled.ts` живе в чанку платформи, і відносний імпорт вмикав другу копію прапорця, якої чанк не читав, тож релізна каса офлайн не запускала; закрито в [[POS_PWA]] §2). Планшет офіціанта (`tablet-main.tsx` → `enableOfflineReads()`) читає дзеркало, але не пише — [[POS_PWA]]. Веб-адмінка як і раніше ходить в API напряму.

Перший запуск на пристрої **потребує інтернету** (логін + знімок каталогу/тегів/клієнтів + PBKDF2-verifier PIN/пароля). Сирий PIN на диск не пишеться.

Далі без мережі:

- PIN / пароль власника, хто вже входив на цій касі, перевіряється локально.
- Каталог і клієнти читаються з IndexedDB; фільтр тег/пошук/штрихкод — у TS.
- Продаж одразу закривається локально (чек `OFF-…`, мінус з кешу залишку, черга outbox).
- Новий/змінений клієнт — локально + черга; на сервері upsert по `(store, phone)` / `client_uuid`.

Синк (коли є живий JWT і мережа): **спочатку клієнти, потім продажі**. Повтор `POST /sales/complete` з тим самим `client_uuid` повертає той самий чек без другого списання.

Конфлікт залишків з іншою касою: сервер **приймає** продаж, `reason = sale` може піти в мінус. Adjust / writeoff як і раніше не опускають qty нижче 0. Локально каса не дає продати більше **кешу** (`max_quantity`).

JWT: last-good токен тримається до `expires_at` (14 днів). Якщо протух і мережі немає — каса працює з локальним PIN, черга копиться, синк після наступного **онлайн**-логіна. `401` з сервера скидає сесію, PIN на пристрої лишається.

Фото каталогу кешуються через Cache API після знімка; якщо URL недоступний — плитка як раніше (плейсхолдер).

### Магазин із ПРРО

Фіскальний чек реєструється в момент продажу, тож до 2026-09-12 каса з
увімкненим ПРРО офлайн **не продавала зовсім**. Тепер (фаза 3,
[POS_FISCAL_OFFLINE.md](prro/POS_FISCAL_OFFLINE.md)) вона продає з власного
резерву кодів ДПС, якщо магазин має `offline_mode`:

- поки є мережа, каса тримає **оренду** кодів (`POST /fiscal/offline/lease`,
  50 штук, оновлюється в кінці кожного синку) — разом із зміною, ФН ПРРО і
  станом сесії; резерв і причина відмови видні в баннері;
- без мережі каса сама ставить на чек код, свою дату й час, друкує чек
  повністю (шапка з реквізитів, «ОФЛАЙН», QR ДПС — без контрольного числа,
  воно приходить після синку) і кладе продаж у чергу зі штампом;
- гейти локальні (`pos/src/offline/lease.ts`): немає кодів, немає зміни,
  до автозакриття зміни < 15 хв, офлайн > 36 год, касу зайнято іншим
  пристроєм, реквізити ще не отримані — кожна відмова називає себе;
- **перший чек реєстратора — тільки онлайн**: шапку чека (Положення № 13,
  п. 2) вигадати не можна, її дає ПРРО;
- на синку чек іде з полем `fiscal_offline`, сервер приймає його як є, а не
  реєструє наново; 409 означає «більше не пробуй» (чек лишається в
  «непроведених», залишок **не** повертається — товар пішов), 503 — «спробуй
  за хвилину».

Кеш холодного входу (`staffUnlock`) тримає **весь** публічний блок `fiscal`
(реквізити, ФН ПРРО, код ставки, `offline_mode`): без нього каса після
перезапуску надрукувала б чек із порожньою шапкою.

Код: [`pos/src/offline/`](../pos/src/offline/). Баннер «Офлайн» / «Офлайн —
чеки ПРРО з резерву (N)» / «Очікує синк: N» на касі та клієнтах.

## Кіоск Ubuntu 22.04

Fullscreen лише в **release** (`npm run tauri:build`), не в `tauri:dev`. Rust: `set_fullscreen(true)`, без рамки, не resizable, не closable. Alt+F4 на Ubuntu все одно може закрити GTK-вікно — обмеження ОС.

Бінар після збірки: `pos/src-tauri/target/release/liveshop-pos` (до 2.7.x — `cloth-pos`). Після `.deb` зазвичай `/usr/bin/liveshop-pos`.

### Автологін користувача каси

GNOME Settings → Users → Automatic Login, або в `/etc/gdm3/custom.conf`:

```
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=kasyr
```

(`kasyr` — системний юзер каси, не POS PIN.)

### Автостарт

`~/.config/autostart/liveshop-pos.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=LiveShop POS
Exec=/usr/bin/liveshop-pos
X-GNOME-Autostart-enabled=true
```

Підставте `Exec=` на фактичний шлях (release-бінар або `/usr/bin` після deb).

### Блокування екрана і сон

Settings → Privacy → Screen Lock → off; Power → Blank screen → never. Або:

```bash
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing'
```

### Wayland vs X11

GTK fullscreen Tauri працює на обох. Огляд GNOME (Super) ОС не ховає — для «жорсткого» кіоска опційно `gnome-kiosk` / окрема сесія, не в коді v1.

### Вихід з каси

Не прибирати logout. Owner — кнопка «Вихід» у rail (і довгий тап на мобільній навігації). Після виходу PIN на пристрої лишається; потрібен повторний ввід.

Камера (`html5-qrcode`) залежить від webview; на Linux WebKit буває гірше, ніж Chrome. USB-сканер як клавіатура працює без native API.

## Файли оболонки

- [`pos/src-tauri/tauri.conf.json`](../pos/src-tauri/tauri.conf.json) — вікно «LiveShop POS» min 1024×700, CSP (`connect-src` на API, `media-src` для камери)
- [`pos/src-tauri/src/lib.rs`](../pos/src-tauri/src/lib.rs) — у release: fullscreen, без рамки
- identifier: `shop.the-live.pos` (до 2.7.x — `shop.cloth.pos`; перенесення тек — нижче)
- [`pos/src-tauri/capabilities/default.json`](../pos/src-tauri/capabilities/default.json) — права вікна; що з них випливає для feature-модулів — [POS_MODULE_TAURI_CAPABILITIES.md](POS_MODULE_TAURI_CAPABILITIES.md)

## Перейменування 2.8.0: «Cloth POS» → «LiveShop POS»

До 2.7.x десктопна каса називалася «Cloth POS» (крейт `cloth-pos`, identifier `shop.cloth.pos`) — ім'я з перших версій, коли каса продавала лише одяг. З 2.8.0 файл програми називається так само, як сайт: **«LiveShop POS»**, крейт і бінар `liveshop-pos`, identifier **`shop.the-live.pos`**, файли релізу `LiveShop.POS_<версія>_…`. Що лишилося старим навмисно: ключ і endpoint апдейтера (вшиті в кожну встановлену копію), імена баз Dexie `cloth-pos-offline` / `cloth-pos-module-*` і ключі `localStorage` (користувач їх не бачить, а перейменування втратило б дані і на вебі), шлях до локального ключа підпису `~/.tauri/cloth-pos-updater.key`.

**Де лежать дані.** Tauri виводить кожну теку з identifier:

| ОС | `app_data_dir` (кеш модулів `modules/`) | профіль webview (IndexedDB, localStorage) |
|---|---|---|
| Windows | `%APPDATA%\shop.the-live.pos` | `%LOCALAPPDATA%\shop.the-live.pos\EBWebView` |
| macOS | `~/Library/Application Support/shop.the-live.pos` | `~/Library/WebKit/shop.the-live.pos` (стандартне сховище WKWebView за bundle id) |
| Linux | `~/.local/share/shop.the-live.pos` | там само (`app_local_data_dir`) |

У профілі webview живе все, без чого каса після перейменування стала б порожньою: черга невідправлених продаж, вхід, `deviceId`, резерв фіскальних кодів, вибір принтерів.

**Перенесення.** `src-tauri/src/legacy_profile.rs` викликається першим рядком `run()`, до `tauri::Builder` (Tauri створює теки нового identifier лише при побудові webview): для кожної базової теки, якщо `<base>/shop.the-live.pos` ще немає, а `<base>/shop.cloth.pos` є — копіює дерево у `<base>/shop.the-live.pos.migrating`, пише маркер `.migrated-from-shop.cloth.pos` (скільки файлів, що не вдалося) і перейменовує у `<base>/shop.the-live.pos`. Стару теку ніколи не видаляє. Кеші браузера (`CacheStorage` з фото товарів — 474 МБ на одному Mac — `Code Cache`, `GPUCache`, …) пропускає. Файл, який не читається (стара каса ще відкрита), записує в маркер і йде далі — бо наступний запуск уже побачить теку, яку створив Tauri, і не повторить спробу; тому в заметках релізу: **закрити «Cloth POS» перед першим запуском нової**. Базові теки резолвить крейт `dirs`, той самий, що й Tauri. Тести — `cargo test legacy_profile`.

**Оновлення на місці.** macOS-апдейтер 2.7.x замінює вміст бандла, тека лишається `Cloth POS.app`; після заміни `app.restart()` шукає кешований шлях `…/MacOS/cloth-pos`, якого вже немає, тому каса закривається і не перезапускається — один раз, власник відкриває її з Dock. `install-macos.sh` прибирає і `Cloth POS.app`, і `LiveShop POS.app` перед копіюванням. Windows-інсталятор NSIS ставить «LiveShop POS» поруч зі старою; «Cloth POS» видаляють через «Програми та компоненти» після першого запуску нової.

**«Про програму».** Картка на «Обладнанні» під «Версія програми» і внизу «Налаштувань» (`pos/src/components/AboutCard.tsx`, факти в `pos/src/lib/about.ts` — ті самі, що `site/src/lib/productFacts.ts` і шапка LICENSE); на macOS — меню «LiveShop POS → Про LiveShop POS» (`src-tauri/src/app_menu.rs`). Посилання з картки десктоп відкриває через `opener`, тому `capabilities/default.json` має три шаблони для `the-live.shop`, `technologies.llc`, `own-net.com` — [POS_MODULE_TAURI_CAPABILITIES.md](POS_MODULE_TAURI_CAPABILITIES.md) §4; `bundle` у `tauri.conf.json` несе publisher, copyright, homepage, ліцензію і опис для інсталяторів.
