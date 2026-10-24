# Cashalot — локальна копія документації

Навіщо: специфікація WEB API — живий Google Doc без версії в URL, а сторінка
на сайті віддає PDF на місяць старший за нього; swagger кабінету не має
серверного URL і читається лише з браузера. Тримаємо знімки з датою, щоб
дизайн адаптера ([../POS_FISCAL_CASHALOT.md](../POS_FISCAL_CASHALOT.md)) не
спирався на переказ.

| Файл | Що | Джерело | Дата |
|---|---|---|---|
| `webapi-2.1.0.8034.md` | «Специфікація WEB API ПРРО Cashälot» версія 2.1.0.8034 від 29.09.2026: обмін, автоматичний офлайн, 22 команди з прикладами запит/відповідь, структури чека і Z-звіту (C#), константи, документи у форматі НБУ | Google Doc `1HbO74I4Z2Pcp__Ufmbqw_wkV9tdnTkcyxzIZf1G7mVM` (експорт `?format=html`), на який посилаються https://cashalot.ua/instructions/api-webapi-cashalot і https://portfel.ua/prro-api-cashalot/ | 2026-10-21 |
| `webapi-2.1.0.7980.pdf` | Та сама спека у PDF, версія 2.1.0.7980 від 04.09.2026, 625 454 байт — сталий артефакт на випадок, якщо Google Doc зміниться або зникне | https://cashalot.ua/instructions/api-webapi-cashalot | 2026-10-21 |
| `cabinet-api-swagger-v1.json` | OpenAPI 3.0.1 «API Кабінету користувача» v1: 9 POST-методів, схеми чека/зміни/звіту | https://my.cashalot.org.ua/swagger/v1/swagger.json | 2026-10-21 |
| `cabinet-api.md` | Конспект swagger: авторизація, методи, поля, навіщо нам | з файлу вище | 2026-10-21 |
| `integration-facts.md` | Варіанти інтеграції, вимоги, ціни, офлайн, доступ, контакти | https://cashalot.ua/integration, /sale, /cashalot-offline, portfel.ua, dtkt.ua — перелік у файлі | 2026-10-21 |
| `other-specs.md` | COM API, API Bridge, драйвер BAS, старі версії WEB API — версії, дати, URL; у репозиторій не кладемо | у файлі | 2026-10-21 |
| `community-clients.md` | `github.com/Gavan4eg/cashalot-laravel` та оголошення інтеграторів — реальні JSON стану ПРРО і чека, назви методів | у файлі | 2026-10-21 |
| `support-answers.md` | Відповіді розробки Cashalot на наші 14 питань: тестова зміна через `OpenShift{TESTING}`, `KeyGuid`+`KeyPin` для всіх команд, повтор `UID` → `DuplicatedRequestUid`, `UID` у корені запиту, коди одиниць і форм оплати, ширина візуалізації в пікселях, офлайн лише при доступному сервері Cashalot | лист через партнера Cashalot, «Відповідь надана розробкою ПРРО Кашалот» | 2026-10-24 |

Головний висновок для нашого дизайну: WEB API — хмарний RPC
(`https://fsapi.cashalot.org.ua/`, POST + JSON, поле `Command`) **без сесії**:
креди КЕП або `KeyGuid`/`KeyPin` їдуть у кожному запиті; JSON чека повторює
XML ДПС один в один (`CHECKHEAD`/`CHECKBODY`/`CHECKPAY`/`CHECKTAX`, і податки
рахує клієнт); офлайн робить сам сервер Cashalot, команд `ask-offline-codes` /
`sell-offline` / `go-online` немає; пісочниці немає — тестові документи йдуть
на реальний ПРРО з `TESTING=true`. Чого в спеці немає: таблиці `ErrorCode`,
лімітів, правила повтору, джерела ставок податків. Наслідки — в
`../POS_FISCAL_CASHALOT.md`.

Як перезняти спеку: `curl -L "https://docs.google.com/document/d/<id>/export?format=html"`
→ одноразовий скрипт на `turndown` + `turndown-plugin-gfm` (у репозиторій не
кладемо): кожна однокомірна таблиця → блок коду (`json`/`xml`), `public class`
і `public enum` з їхніми `/// <summary>` → блок `csharp`, зміст із номерами
сторінок прибрати, заголовки опустити на рівень, Google-редиректи в посиланнях
розгорнути; перевірити рядок версії і 22 заголовки команд (`grep -c '^### '`).
`?format=md` сервер не віддає (400).
