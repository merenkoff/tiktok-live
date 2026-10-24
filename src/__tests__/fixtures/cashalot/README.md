# Реальні пари запит/відповідь Cashalot WEB API

Знімає `npm run fiscal:sandbox:cashalot` (`src/pos/fiscal/providers/cashalot/sandbox.ts`)
на справжньому ПРРО в тестовому режимі — окремої пісочниці в Cashalot немає
(відповідь розробки 1, `TechDocs/prro/cashalot/sources/support-answers.md`).
Кожен прогін лишає теку `runs/<мітка часу>/`: по файлу на крок — запит із
замаскованими `KeyGuid`/`KeyPin` поруч із відповіддю, бо розробка Cashalot
розбирає помилки саме за ними (відповідь 6), — а також `console.log` і
`run.json` з рядками `ANSWER …`. Справжніх ключів тут бути не може; перед
комітом прогону переглянути файли очима.

Що перевіряють проби — `TechDocs/prro/cashalot/POS_FISCAL_CASHALOT.md` §4.5.
Прапорці:

```bash
npm run fiscal:sandbox:cashalot                 # лише читання: проби 1, 7
npm run fiscal:sandbox:cashalot -- --shift      # + 2: відкрити ТЕСТОВУ зміну
npm run fiscal:sandbox:cashalot -- --sell       # + 3, 4, 5, 8 (потрібна відкрита тестова зміна)
npm run fiscal:sandbox:cashalot -- --return     # + 6: повернення, внесення/видача, X, Z, повторне закриття
npm run fiscal:sandbox:cashalot -- --all        # усе по черзі
```

Скрипт нічого не пише, поки на ПРРО відкрита фіскальна зміна (вихід 3), а
кожен документ і зміна йдуть із `TESTING`.

## Проба 9 — виклик із продакшн-мережі

Розробка попередила, що IP із країн під обмеженнями можуть блокуватися
(відповідь 4), а проби вище йдуть із машини розробника. Один виклик із
контейнера API на Railway (`railway ssh`, див. пам'ять про доступ до шелу):

```bash
node -e "fetch('https://fsapi.cashalot.org.ua/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({Command:'ServerState'})}).then(async r=>console.log(r.status,await r.text()))"
```

Очікується `200` і `{"Available":true,…}`; будь-що інше — записати сюди.

## Знахідки

Ще немає — перший прогін після CA0 (ключі в `.env`). Формат — як у
`../checkbox/README.md`: пронумеровані знахідки, що змінюють дизайн адаптера.
