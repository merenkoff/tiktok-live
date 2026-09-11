# Checkbox API — Чеки: офлайн (`sell-offline`)

Джерело: https://wiki.checkbox.ua/api/receipts, розділ «Продаж та повернення →
Офлайн», знято 2026-09-10 (скріншоти вкладок + текст шаблону запиту і
прикладу відповіді). Останнє оновлення сторінки на сайті — 19.08.2026.

## Опис

`POST /api/v1/receipts/sell-offline` — створення чека у офлайні; дозволяє явно
вказати **фіскальну дату** і **фіскальний код**.

- Перед створенням офлайн-чека касу потрібно перевести в офлайн-режим
  (`POST /cash-registers/go-offline`, див. `cash-register.md`), інакше API
  відповість `"message": "Cash register should be in manual offline mode!"`.
- Від `/receipts/sell` метод відрізняється **лише** наявністю полів
  `fiscal_code` та `fiscal_date`, які є обов'язковими і вказуються наприкінці
  пейлоаду чека.
- Документований сценарій: якщо різниця між запитом на фіскалізацію і
  фактичним часом банківської транзакції більше 5 хвилин — перейти в офлайн,
  створити чек через `sell-offline` з `fiscal_date` = час банківської
  транзакції.
- Заголовки: `X-Client-Name`, `X-Client-Version` (обов'язково), `Authorization`,
  `Content-Type: application/json`.

## Шаблон запиту (поля, що відрізняють офлайн — наприкінці)

Тіло = звичайний `ReceiptSellPayload` (`id` — UUID чека, генерується
інтеграцією, обов'язково; `cashier_name`, `departament`, `goods[]` з `good{code,
name, price, tax[], barcode, excise_barcodes[], header, footer, uktzed}`,
`good_id`, `quantity` (тисячні, 1 шт = 1000), `is_return`, `discounts[]`,
`total_sum`; `delivery{email, emails[], phone}`; `discounts[]`; `bonuses[]`;
`payments[]` з `type CASH|CASHLESS`, `value`, `label`, `card_mask`,
`bank_name`, `auth_code`, `rrn`, `payment_system`, `owner_name`, `terminal`,
`acquirer_and_seller`, `receipt_no`, `signature_required`; `rounding`,
`header`, `footer`, `barcode`, `order_id`, `related_receipt_id`,
`previous_receipt_id` (опціонально, контроль послідовності),
`technical_return`, `is_pawnshop`, `custom{…}`) **плюс**:

```json
  "fiscal_code": "<невикористаний офлайн код>",
  "fiscal_date": "<дата/час фіскалізації чека, ISO 8601 YYYY-MM-DDThh:mm:ss.ssssss±hh:mm>"
```

> У шаблоні запиту **немає** `control_number`. В OpenAPI-схемі
> `OfflineReceiptSellPayload` поле `control_number` (1–4 символи) присутнє як
> необов'язкове. Приклад відповіді нижче показує, що Checkbox формує
> контрольне число і хеш сам.

## Приклад відповіді (скорочено до офлайн-полів)

```json
{
  "id": "77ccd2a5-a0c6-4328-bb84-b829574bed74",
  "type": "SELL",
  "transaction": {
    "id": "6bd73d21-2a4e-49ab-9471-108b95d48286",
    "type": "RECEIPT",
    "serial": 187,
    "status": "PENDING",
    "request_signed_at": null,
    "request_received_at": null,
    "response_status": null,
    "response_id": null,
    "offline_id": "TEST-iA5fmb",
    "created_at": "2023-11-29T12:11:28.569137+00:00",
    "original_datetime": "2023-11-29T14:07:28+00:00",
    "previous_hash": "5db006ff9126fcb39146c017f4f8d7e8668dee4220dce5136ff795716c483f73"
  },
  "serial": 93,
  "status": "DONE",
  "total_sum": 56300,
  "fiscal_code": "TEST-iA5fmb",
  "fiscal_date": "2023-11-29T14:07:28+00:00",
  "delivered_at": null,
  "is_created_offline": true,
  "is_sent_dps": false,
  "sent_dps_at": null,
  "tax_url": "https://cabinet.tax.gov.ua/cashregs/check?id=TEST-iA5fmb&date=20231129&time=16%3A07%3A28&fn=TEST551151&sm=563.00&mac=5db006ff9126fcb39146c017f4f8d7e8668dee4220dce5136ff795716c483f73",
  "shift": { "id": "16a4caf5-…", "status": "OPENED", "initial_transaction": { "type": "SHIFT_OPEN", "response_id": "TEST-ZBt1ku", "offline_id": "TEST-ZBt1ku", "previous_hash": "f282bba4…" }, "cash_register": { "fiscal_number": "TEST551151" } },
  "control_number": "9933"
}
```

Спостереження:
- `status` чека — `DONE` одразу, транзакція — `PENDING`, `is_sent_dps: false`:
  чек «прийнятий ТП», у ДПС піде при `go-online`.
- `fiscal_code` = офлайн-код з пулу; `transaction.offline_id` — той самий код.
- `tax_url` — посилання перевірки ДПС: `id` = фіскальний номер (офлайн-код),
  `date`/`time` = фіскальна дата (місцевий час), `fn` = ФН ПРРО, `sm` = сума,
  **`mac` = `transaction.previous_hash`** (SHA-256, 64 hex). Тобто хеш для QR
  рахує Checkbox.
- `control_number: "9933"` — 4 цифри, у відповіді, не в запиті.
- Параметри відповіді збігаються з `/receipts/sell`.

## Візуалізація офлайн-чека (`TEST-iA5fmb`, PDF з вікі)

Низ чека Checkbox для офлайн-документа друкує:

```
Чек № TEST-iA5fmb
29.11.2023 об 16:07:28
ОФЛАЙН
Контрольне число: 9933
ФН ПРРО TEST551151
ФІСКАЛЬНИЙ ЧЕК
```

(+ QR з `tax_url`). Тобто офлайн-чек зобов'язаний нести відмітку «ОФЛАЙН» і
контрольне число — обидва формує Checkbox після `sell-offline`.

## Наслідки для нашого дизайну

1. ~~**Контрольне число і `mac` каса локально порахувати не може**~~ —
   **виправлено 2026-09-11, висновок був хибний.** `mac` у `tax_url`
   **необов'язковий**: реальні чеки перевіряються посиланням без нього
   (`…/check?date=…&time=…&id=…&sm=…&fn=…`) — кабінет ДПС шукає документ за
   `fn` + `id` + дата/час/сума. Тобто QR каса складає сама з п'яти полів, які
   в неї є офлайн. Контрольне число теж рахує сам ПРРО — односторонньою
   хеш-функцією над датою, часом і сумою «всього»; функція одна для всіх ПРРО
   в даний період, оприлюднюється ДПС в Електронному кабінеті, механізм — в
   «Описі API фіскального сервера». А `control_number` у
   `OfflineReceiptSellPayload` — **необов'язкове поле ЗАПИТУ**: порахувавши
   його самі, ми передаємо те саме значення при відправці, і папір збігається
   із записом у ДПС.
2. `sell-offline` = `sell` + два поля → адаптеру потрібен один додатковий
   метод, а не другий маппінг.
3. `previous_receipt_id` — опціональний контроль послідовності; для нашого
   реплею в порядку `seq` варто передавати попередній `id`.
