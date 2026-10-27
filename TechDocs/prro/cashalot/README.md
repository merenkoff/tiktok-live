# Cashalot — провайдер ПРРО № 2 (трек CA)

Стан: **CA1 (документація і папка) і CA2 (gap-аналіз) — 2026-10-21;
відповіді розробки — 2026-10-24; CA4 (контракт v2, `dps/`, транспорт і скрипт
проб), CA5 (адаптер) — 2026-10-24; CA6 (бандл `fiscal-cashalot`, e2e) —
2026-10-27; ранбук першого ввімкнення (частина CA7) — 2026-10-27.** Живого
ПРРО ще не було: далі CA0 (кабінет, ПРРО і ключі — за власником) і CA3
(проби на ньому), після них — Module Release і сайт (решта CA7). Точка
відновлення треку —
[POS_FISCAL_CASHALOT.md](POS_FISCAL_CASHALOT.md) §0; кожна фаза отримує
власний план і схвалення до коду.

| Що | Де |
|---|---|
| Ранбук першого ввімкнення фіскалізації в магазині (кабінет, ключі, таблиця ставок, тестовий режим → перший чек) | [POS_FISCAL_CASHALOT_SETUP.md](POS_FISCAL_CASHALOT_SETUP.md) |
| Дизайн: що відомо, таблиця фаз CA0–CA8, гіпотези про контракт, питання до підтримки, журнал рішень | [POS_FISCAL_CASHALOT.md](POS_FISCAL_CASHALOT.md) |
| Специфікація WEB API v2.1.0.8034 від 29.09.2026 (markdown) і PDF 2.1.0.7980 від 04.09.2026 | [sources/webapi-2.1.0.8034.md](sources/webapi-2.1.0.8034.md), `sources/webapi-2.1.0.7980.pdf` |
| API кабінету користувача: swagger + конспект | `sources/cabinet-api-swagger-v1.json`, [sources/cabinet-api.md](sources/cabinet-api.md) |
| Факти з сайту: варіанти інтеграції, ціни, офлайн, доступ, контакти підтримки | [sources/integration-facts.md](sources/integration-facts.md) |
| Інші специфікації (COM, Bridge, драйвер BAS, старі версії WEB API) — лише посилання з датами | [sources/other-specs.md](sources/other-specs.md) |
| Сторонні клієнти як приклад реальних JSON | [sources/community-clients.md](sources/community-clients.md) |
| Відповіді розробки Cashalot на наші питання (CA0), 2026-10-24 | [sources/support-answers.md](sources/support-answers.md) |

Код: адаптер `src/pos/fiscal/providers/cashalot/` (транспорт `client.ts`,
скрипт проб `sandbox.ts`, фікстури `src/__tests__/fixtures/cashalot/`), бандл
`pos/src/modules/fiscal-cashalot/` (порт 5012; спільне з Checkbox —
`pos/src/modules/fiscal-core/`), e2e `pos/e2e/fiscal-cashalot.spec.ts`,
HTTP-заглушка для ручного прогону `src/__tests__/helpers/fake-cashalot-server.ts`.

Як читати: спочатку [sources/README.md](sources/README.md) (що звідки і коли
знято), потім спеку; наші висновки — тільки в `POS_FISCAL_CASHALOT.md`, файли
в `sources/` не редагуємо, а перезнімаємо з новою датою.
