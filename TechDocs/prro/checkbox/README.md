# Checkbox — провайдер ПРРО № 1 (у проді)

| Що | Де |
|---|---|
| Ранбук першого включення фіскалізації в магазині | [POS_FISCAL_CHECKBOX_SETUP.md](POS_FISCAL_CHECKBOX_SETUP.md) |
| Знімки API: OpenAPI 2.106.4, вікі (режим каси, офлайн-чеки, зміни) | [api/](api/README.md) — таблиця джерел і дат |
| Адаптер | `src/pos/fiscal/providers/checkbox/` — `client.ts` (HTTP, `BASE_URL`), `payload.ts` (`FiscalDoc` ↔ wire), `errors.ts` (→ `FiscalErrorKind`), `index.ts` (адаптер + офлайн-capability), `poll.ts` (асинхронні зміна/чек), `sandbox-offline.ts` (ручний прогін, не тест) |
| Бандл | `pos/src/modules/fiscal-checkbox/` (manifest, `secretSpecs.ts`, `CheckboxAdminPage`, `CheckboxTillPage`), `pos/vite.fiscal-checkbox-remote.config.ts`, `npm run build:fiscal-checkbox-remote`, порт 5005 |
| Реальні пари запит/відповідь | `src/__tests__/fixtures/checkbox/` — README із знахідками пісочниці; `runs/<timestamp>/` пише скрипт |
| Пісочниця | `npm run fiscal:sandbox:offline -- --ask --go`; `CHECKBOX_SANDBOX_LICENSE_KEY` / `CHECKBOX_SANDBOX_PIN` у `.env` (тільки `test`-ключ) |
| Тести адаптера | `src/__tests__/pos.fiscal.checkbox.{client,errors,offline,payload,poll,provider}.test.ts` |

Checkbox-специфічне всередині спільних дизайн-доків: [../POS_FISCAL_PRRO.md](../POS_FISCAL_PRRO.md)
§3 («Подтверждённые эндпоинты Checkbox», «Что дала спека»), §10 (чек-лист
релізу бандла), журнал фаз 2б і 6; [../POS_FISCAL_OFFLINE.md](../POS_FISCAL_OFFLINE.md) —
«Что даёт API Checkbox», «Решение 2026-09-12: облачный путь; Kasa — отложено»,
«Фаза 8в — реквизиты из Checkbox», «Прогон на демо-кассе».

## Що в контракті насправді «чекбоксівське»

На це дивитись, підключаючи іншого провайдера (трек Cashalot робить це в
[../cashalot/POS_FISCAL_CASHALOT.md](../cashalot/POS_FISCAL_CASHALOT.md)):

- ліміт 2 запити/с у `src/pos/fiscal/rateLimit.ts` — ліміт Checkbox у спільному коді;
- ідемпотентність: наш `requestId` стає `id` чека, повтор відповідає `duplicate`;
- ставки податків приходять із `/tax` (`fetchRequisites().taxes`), ПДВ рахує Checkbox;
- офлайн за моделлю `ask-offline-codes` → `sell-offline` → `go-online`
  (`FiscalOfflineOps`): коди ДПС у нас, штампує або сервер, або каса;
- сесія — bearer-токен (`signIn` → `FiscalSession.token`);
- `pos/src/modules/fiscal-core/lib/diagnostics.ts` надсилає `module: 'fiscal-checkbox'`
  зі спільного `fiscal-core`.
