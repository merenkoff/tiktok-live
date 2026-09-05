# POS module-remote — roadmap of independent follow-ups

Derived from `TechDocs/POS_MODULE_REMOTE_POC.md` ("Still open" items). Each
section below is an independent unit of work — do them in any order unless a
dependency is called out. Nothing here is committed to; this is the menu if
independent *delivery* of POS modules ever becomes real.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` won't do

---

## Web-only, до продакшн-готовности

- [ ] **1. Версионирование `/api/pos`**
  - Версия в путь или заголовок (`/api/pos/v1`, либо `Accept: application/vnd.pos.v1`).
  - Контракт совместимости: что считается breaking, как модуль объявляет требуемую версию.
  - Блокирует независимый релиз модулей — модуль, выпущенный отдельно против
    неверсионированного API, ломается молча. **Обязательное условие** для всего
    остального в этом разделе.
  - Зависимостей нет. Оценка: несколько дней.

- [ ] **2. CI-публикация remote-артефактов**
  - Workflow: собрать `dist-remotes/returns` и `dist-remotes/stock`, залить в
    CDN/бакет с иммутабельным путём по версии.
  - Манифест соответствия «версия модуля → URL».
  - Зависит от: п.1 (схема путей). Оценка: несколько дней.

- [~] **3. SRI + подпись артефактов**
  - `integrity=` хэш в import map / при динамическом `import()`.
  - Опционально — подпись артефакта и проверка на загрузке.
  - Независимо; логично после п.2 (генерация хэша в CI). Оценка: 1–2 дня.
  - **Частично сделано в п.7:** `scripts/assemble-web-dist.mjs` пишет `sha384`
    SRI для vendor- и `@pos/platform`-чанков прямо в `importmap.integrity`.
    Остаётся: подпись артефактов модуль-ремоутов и SRI для их
    `remote-entry.js` при динамическом `import()`.

- [ ] **4. Извлечение Tailwind CSS для модуля**
  - Сейчас remote не везёт свой стиль и полагается на скомпилированный CSS
    хоста; держится только потому, что исходники модуля лежат внутри `pos/src`
    и попадают в `content`-glob.
  - Нужно: отдельный CSS-бандл на модуль (свой Tailwind-прогон по исходникам
    модуля) либо явный «shared design-tokens» слой.
  - `check:*-css-coverage` уже ловит дрейф — оставить как временную страховку.
  - Независимо. Оценка: 2–4 дня.

- [ ] **5. Error boundary / retry / телеметрия вокруг динамического `import()`**
  - Что показываем, если remote не загрузился (fallback на bundled-дескриптор
    есть структурно, но UX нет).
  - Retry с backoff, таймаут, метрика «remote load failed» + версия.
  - Независимо. Оценка: 2–3 дня.
  - **Прим. из п.7:** vendor- и `@pos/platform`-чанки теперь same-origin
    same-deploy — их отказ = отказ entry-чанка (принятый риск, не покрывается
    этим пунктом). Этот пункт остаётся про *модуль-ремоуты*.

- [ ] **6. Телеметрия версий в рантайме**
  - Логировать, какая версия каждого модуля реально загрузилась в сессии
    (для отладки skew).
  - Зависит от: п.1. Оценка: 1 день.

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

- [ ] **9. Регистрация remote во `VITE_MODULE_REMOTES` из настроек стора**
  - Сейчас список remote зашит в build-time env. Дать включать/переключать
    per-store в рантайме (перекликается с существующими module-toggles).
  - Зависит от: п.1, п.5. Оценка: 3–5 дней.

---

## Расширение на другие модули

- [ ] **10. Третий модуль через тот же паттерн**
  - Проверить на модуле, который трогает больше shared-компонентов, чем
    `stock` (тот использует только `useDragScroll`).
  - Независимо. Оценка: 1–2 дня на модуль.

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

п.1 → (п.2, п.4, п.5 параллельно) → п.3, п.6 → ~~п.7~~ → ~~п.8~~, п.9 → п.10

(п.7 + п.8 уже сделаны — но п.1/п.4/п.5 всё ещё нужны до реального
продакшн-раскатывания модуль-ремоутов.)
