# POS Desktop (Tauri 2)

Десктопна каса: те саме React-UI, окремий Vite entry, оболонка **Tauri 2**. Адмінка лишається сайтом. Офлайн у цій поставці **немає**.

Пов’язано: [[RAILWAY_POS]] · [[POS_POST_MVP]] · [`pos/UI_CASHIER.md`](../pos/UI_CASHIER.md)

## Рішення

| Шар | Технологія | Навіщо |
|-----|------------|--------|
| Сайт (Railway `pos/`) | Vite + React SPA як раніше | Адмінка + каса в браузері; деплой не ламаємо |
| Десктоп | Той самий React, entry каси + Tauri 2 | Вікно Win / Mac / Ubuntu 22.04 лише з касою |
| Бізнес-логіка | TypeScript (Zustand, Axios, сторінки каси) | Rust не містить продажів, каталогу, синку |
| Офлайн (пізніше) | IndexedDB + черга в TS | Без зміни оболонки й без Rust-SQLite на старті |

**Чому Tauri 2, а не Electron.** Каса — кіоск на слабшому ПК, UI вже веб. Tauri дає системний webview, малий інсталятор і RAM. Slack/Electron має сенс, коли потрібен той самий Chromium скрізь; для цієї каси зайвий. Уся логіка в TS: пізніше офлайн не вимагає міграції на Electron.

**Що не в v1:** офлайн, ESC/POS, автооновлення, кіоск/fullscreen, підпис/нотарізація бінарів.

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

## Ітерація 2: офлайн

Не змінювати Tauri на іншу оболонку. Не класти чергу продажів у Rust.

1. Репозиторій над Axios: онлайн → `/api/pos`, офлайн → локально.
2. Кэш каталогу + черга `completeSale` в **IndexedDB** (каталог одягу — тисячі SKU).
3. Синк після появи мережі; конфлікти залишків — на бекенді.
4. SQLite / Tauri SQL plugin — лише якщо IndexedDB не вистачить (чеки, жорсткі збої).

Камера (`html5-qrcode`) залежить від webview; на Linux WebKit буває гірше, ніж Chrome. USB-сканер як клавіатура вже працює без native API.

## Файли оболонки

- [`pos/src-tauri/tauri.conf.json`](../pos/src-tauri/tauri.conf.json) — вікно «Каса» min 1024×700, CSP (`connect-src` на API, `media-src` для камери)
- [`pos/src-tauri/src/lib.rs`](../pos/src-tauri/src/lib.rs) — порожній `Builder`, без команд
- identifier: `shop.cloth.pos`
