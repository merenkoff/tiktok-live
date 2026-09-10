# Checkbox API — локальна копія документації

Навіщо: вікі Checkbox (`wiki.checkbox.ua`) рендериться скриптом і не читається
інструментами без браузера, а ми будуємо на ній офлайн-режим ПРРО
([POS_FISCAL_OFFLINE.md](../POS_FISCAL_OFFLINE.md)) і, пізніше, власну
реалізацію, що ходитиме в ДПС напряму. Тут — знятий текст, зведений у markdown,
плюс OpenAPI-спека, з якої беруться точні схеми.

| Файл | Що | Джерело | Дата |
|---|---|---|---|
| `openapi-2.106.4.json` | Повна OpenAPI 3.1 спека Checkbox (131 шлях, 249 схем) | `https://api.checkbox.in.ua/api/openapi.json` | 2026-09-10 |
| `cash-register.md` | «Режим роботи каси»: `offline_mode`, `ask/get-offline-codes`, `go-online`, `go-offline` | `https://wiki.checkbox.ua/api/cash-register` | 2026-09-10 |
| `receipts-offline.md` | «Чеки → Офлайн»: `sell-offline`, приклад відповіді з `control_number`, `tax_url`/`mac`, вигляд офлайн-чека | `https://wiki.checkbox.ua/api/receipts` | 2026-09-10 |
| `shifts.md` | «Зміни»: відкриття (онлайн/офлайн), статус, закриття, Z-звіт, ліміти 36 год / 168 год на місяць | `https://wiki.checkbox.ua/api/shifts` | 2026-09-10 |

Головний висновок для офлайн-режиму: контрольне число та `mac` для QR
формує Checkbox у відповіді `sell-offline` — формули для клієнта в документації
немає і вона не потрібна (див. `receipts-offline.md`, «Наслідки»).

Вихідні PDF (16 файлів по ~600 КБ, одна сторінка з різними розкритими
вкладками) у репозиторій не кладемо — текст зведений повністю; при потребі
перезняти сторінку заново.
