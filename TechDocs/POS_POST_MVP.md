# POS Post-MVP backlog

Документ «на потім»: ідеї після стабільного MVP (каса + складські документи + заглушки в приході). **Не робити в поточному спринті.**

Пов’язано: [[POS_GTIN_ENRICHMENT]] · [[RAILWAY_POS]] · [[POS_DISCOUNTS_AND_CUSTOMERS]] · [[POS_DESKTOP]]

---

## P1. GTIN enrichment (підказка назви)

**Статус:** free path **реалізовано** → [[POS_GTIN_SETUP]] · [[POS_GTIN_ENRICHMENT]]; масове навчання кешу → [[POS_GTIN_LEARNING_API]]  
**Звідки:** відкладено з плану receipt placeholders — у MVP заглушка лише вручну; enrichment додано окремо.

### Навіщо

Після скану/вводу штрихкоду, якщо товару немає в каталозі, опційно підказати назву/бренд — продавець швидше заповнює форму заглушки. **Не блокує** створення, якщо lookup порожній або офлайн.

### Джерела (коротко)

| Джерело | Вартість | Нотатки |
|---------|----------|---------|
| [GEPIR UA веб](https://newgepir.gs1ua.org/search/gtin) | безкоштовно (ручний) | немає офіційного API; часто лише company |
| [Verified by GS1](https://www.gs1.org/services/verified-by-gs1) | веб ~30/день free; **API платно** через GS1 MO | деталі в [[POS_GTIN_ENRICHMENT]] |
| Open Products Facts + UPCitemdb trial | **безкоштовно** (з лімітами) | рекомендований шлях для першої імплементації |

Окремого відкритого каталогу «весь дитячий одяг України» немає.

### Продуктові правила

- Працює лише як **підказка** у флоу «Створити новий товар» у приході (і опційно в ProductsPage)
- Успіх → prefill `name` (і barcode); юзер може змінити
- Немає в базі / помилка / ліміт → тихий fallback, форма заглушки як зараз
- Не створює товар автоматично без підтвердження
- Не залежить від Square Auto Create / їхньої retail-бази
- Feature flag / store setting: `gtin_lookup_enabled` (default off)

### Технічний начерк (коли дійдемо)

1. Backend: `GET /api/pos/catalog/gtin-lookup?code=` — server-side proxy (ключ API не на клієнті)
2. Waterfall: cache → Open Products Facts → UPCitemdb → (опційно GS1)
3. Кеш відповідей у Postgres по GTIN (TTL дні/тижні)
4. UI: після «Нічого не знайдено», якщо query схожий на EAN → підказка / кнопка пошуку
5. Тести: mock HTTP; hit/miss/timeout; prefill; feature flag off

Деталі реєстрації, цін, ToS і freemium — у [[POS_GTIN_ENRICHMENT]].

### Ризики

- Покриття UA kidswear / опт / ноунейм — низьке
- Платні ліміти Verified by GS1 enterprise
- Юридичні/ToS для комерційного використання даних

### Критерій готовності

Скан невідомого EAN → (якщо джерело знає) назва підставилась у форму заглушки; якщо ні — звичайне ручне створення без помилки для юзера.

---

## P2. Desktop каса (Tauri 2)

**Статус:** перша поставка (онлайн-вікно) **зроблено** → [[POS_DESKTOP]]  
Сайт (адмінка + каса в браузері) без змін. Десктоп — окремий cashier entry, логіка лише в TypeScript.

Не в цій поставці (окремі пункти нижче / пізніше): ESC/POS, автооновлення. Офлайн каса + кіоск Ubuntu — [[POS_DESKTOP]] / P3.

---

## P3. Офлайн каса + кіоск

**Статус:** зроблено → [[POS_DESKTOP]].

- Кэш каталогу / клієнтів / PIN-verifier в IndexedDB (Dexie), черга продажів і клієнтів
- Синк `completeSale` + upsert клієнта, коли з’явиться мережа і живий JWT
- Продаж може увести залишок у мінус при гонці кас (`reason = sale`)
- Release Tauri: fullscreen кіоск; Ubuntu 22.04 autologin / autostart / screen lock — у докі
- Без переїзду на Electron і без Rust-SQLite

Не в скоупі: склад офлайн, ESC/POS, gnome-kiosk / приховати Super.

---

## P4. Інше (з попередніх планів, не деталізовано тут)

Перенести з stock ledger Phase E, коли знадобиться:

- Weighted average cost / залишок на дату / Excel-експорт
- Multi-location / переміщення
- Інвентаризація на касі (продавець)
- Sync залишків з TikTok LIVE
- Авто-націнка від закупівельної ціни

Додавати сюди нові post-MVP ідеї окремими секціями `P5…` по мірі появи.

---

## Як користуватись цим документом

1. MVP-фічі закриваємо без пунктів звідси.
2. Коли беремо post-MVP задачу — виносимо в окремий implementation-план і проставляємо статус тут.
3. GTIN enrichment стартувати лише після стабільного приходу з заглушками; спочатку **безкоштовний** waterfall з [[POS_GTIN_ENRICHMENT]], GS1 API — лише після явного бюджету.
