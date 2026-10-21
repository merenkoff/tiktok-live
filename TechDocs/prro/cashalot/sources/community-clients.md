# Cashalot — сторонні клієнти й сліди реального використання (знято 2026-10-21)

Не документація, а підказки: що насправді їде по дроту і як називають методи
ті, хто вже інтегрувався. Нічого з цього не запускали; перевіряти в CA3.

## `github.com/Gavan4eg/cashalot-laravel` (PHP, `composer require gavan4eg/cashalotapi`)

Laravel-пакет (Laravel 6+, PHP 7+, 3 зірки), файли `src/`, `config/`,
`README.md`. Працює у режимі **файлового ключа**: сертифікат `.crt` і ключ
`.pfx` кодуються в base64 (у README — посилання на сторінку сертифікатів
ПриватБанку), тобто `Certificate`/`PrivateKey`/`Password` зі спеки.

Методи `CashalotService`: `transactionsRegistrarState()`, `cleanUp()` (з
`$remove = true` видаляє локальні дані), `openShift()`, `closeShift($zrep)`,
`registerCheck([...])`, `registerZRep()` — ті самі команди, що в спеці.

Приклад чека з README (PHP-масив → JSON):

```php
"CHECKHEAD" => ["DOCTYPE" => "SaleGoods", "DOCSUBTYPE" => "CheckGoods"],
"CHECKTOTAL" => ["SUM" => 99.99],
"CHECKPAY" => [[
    "PAYFORMCD" => 1, "PAYFORMNM" => "Банківська картка", "SUM" => 99.99,
    "PAYSYS" => [["TAXNUM" => "UA2020", "NAME" => "LiqPay", "SUM" => "99.99", "COMMISSION" => "0"]],
]],
"CHECKBODY" => [[
    "NAME" => "Оплата за услуги клинки", "UNITCD" => 138, "UNITNM" => "л",
    "AMOUNT" => 1.000, "PRICE" => 99.99, "COST" => 99.99,
]],
```

Що з цього цінне: `DOCTYPE`/`DOCSUBTYPE` приймаються як **рядки-назви**
(`"SaleGoods"`, `"CheckGoods"`), а не числа з таблиці констант; `PAYFORMCD` 1 =
«Банківська картка» (0 — готівка, за прикладами спеки); `UNITCD` — код
одиниці з довідника ДПС (138 = л). Поля відповіді, які пакет читає: `QrCode`,
`Url`, `NumFiscal`, `NumLocal`, `OrderDateTime`, `Offline`, `ErrorCode`,
`ErrorMessage`. Приклад стану ПРРО з README: `"Testing": false`,
`"OfflineSupported": true`, `OfflineSessionId`, `OfflineSeed`,
`OfflineNextLocalNum`, `OfflineSessionDuration`, `OfflineDocumentsPresent`,
платник «Тестовий платник 4 (Тест)» — тобто автор ганяв на тестовому платнику
ДПС.

## Оголошення інтеграторів (freelancehunt, 2024–2026)

Замовники описують WEB API через `RegisterCheck`, `CloseShift`,
`RegisterZRep`, `LastShiftTotals`, `GetCheck`, `GetZRep` і «прапорець
синхронізації офлайн-документів» — збігається зі спекою, нових методів не
згадують. Посилання: https://freelancehunt.com/en/project/integratsiya-tetyafanya-online-web-api-prro/1552669.html.

## Готові інтеграції, що відкрито ходять у WEB API

Remonline, Smartfin, IBS, USAP, Enote, Base2Base, Універсал 7, Парацельс,
Altegio, Нова пошта, NovaPay, Terralab, Petshandler — перелік і посилання на
https://cashalot.ua/integration#already-integrated. Жоден не публікує код.
