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

**Не в скоупі:** ESC/POS, автооновлення, підпис/нотарізація бінарів, офлайн на сайті адмінки, складські документи офлайн, Rust-SQLite.

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
| Роути | повний SPA, див. `App.tsx` | лише `/login`, `/register`, `/customers` |
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

`tauri.conf.json`: `bundle.targets = all`. Збірка `.msi` / `.dmg` — на відповідній ОС (на Ubuntu вийде AppImage/deb). Автооновлення й code signing — не в цій поставці.

## CORS

Прод-webview Tauri шле Origin `https://tauri.localhost` (інколи `http://tauri.localhost` / `tauri://localhost`). Вони в allowlist [`src/api.ts`](../src/api.ts). Dev на `:3003` покриває `isLocalDev` (будь-який localhost-порт).

Якщо API на іншому хості — `VITE_API_BASE` = публічний URL API без слеша в кінці (як у [[RAILWAY_POS]]).

## Офлайн каса

Працює лише в десктопному entry (`cashier-main.tsx` → `enableOfflinePos()`). Веб-адмінка як і раніше ходить в API напряму.

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

Код: [`pos/src/offline/`](../pos/src/offline/). Баннер «Офлайн» / «Очікує синк: N» на касі та клієнтах.

## Кіоск Ubuntu 22.04

Fullscreen лише в **release** (`npm run tauri:build`), не в `tauri:dev`. Rust: `set_fullscreen(true)`, без рамки, не resizable, не closable. Alt+F4 на Ubuntu все одно може закрити GTK-вікно — обмеження ОС.

Бінар після збірки: `pos/src-tauri/target/release/cloth-pos`. Після `.deb` зазвичай `/usr/bin/cloth-pos`.

### Автологін користувача каси

GNOME Settings → Users → Automatic Login, або в `/etc/gdm3/custom.conf`:

```
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=kasyr
```

(`kasyr` — системний юзер каси, не POS PIN.)

### Автостарт

`~/.config/autostart/cloth-pos.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Cloth POS
Exec=/usr/bin/cloth-pos
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

- [`pos/src-tauri/tauri.conf.json`](../pos/src-tauri/tauri.conf.json) — вікно «Каса» min 1024×700, CSP (`connect-src` на API, `media-src` для камери)
- [`pos/src-tauri/src/lib.rs`](../pos/src-tauri/src/lib.rs) — у release: fullscreen, без рамки
- identifier: `shop.cloth.pos`
- [`pos/src-tauri/capabilities/default.json`](../pos/src-tauri/capabilities/default.json) — права вікна; що з них випливає для feature-модулів — [POS_MODULE_TAURI_CAPABILITIES.md](POS_MODULE_TAURI_CAPABILITIES.md)
