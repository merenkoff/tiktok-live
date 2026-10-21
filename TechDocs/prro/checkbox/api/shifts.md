# Checkbox API — Зміни (відкриття, статус, закриття; офлайн)

Джерело: https://wiki.checkbox.ua/api/shifts, знято 2026-09-10 (скріншоти
вкладок + текст). Останнє оновлення сторінки — 30.10.2024.

## Відкриття зміни — `POST /api/v1/shifts`

- Відкрити зміну можна **в онлайн або офлайн режимі**. **Перше відкриття
  зміни обов'язково має виконуватись в онлайн режимі.**
- Онлайн: `fiscal_code` / `fiscal_date` не вказуються (дата відкриття = час
  отримання запиту сервером Checkbox), але потрібен `X-License-Key` каси
  конкретного ПРРО тієї ж торгової точки, де знаходиться касир.
- Офлайн: спочатку `POST /cash-registers/go-offline`, потім у тілі — **ще не
  використаний фіскальний код, фіскальна дата та UUID зміни**.
- Створюється об'єкт зміни у стані `CREATED` і транзакція відкриття
  (`initial_transaction`). Для переходу в `OPENED` транзакція має бути
  підписана КЕП і доставлена в ДПС (зазвичай кілька секунд).

> ⚠ Якщо зміну відкрито по API або через портал — **заборонено** виконувати
> інші дії через Checkbox.Kasa або Manager: інша інтеграція призведе до
> непередбачуваних помилок, помилкових звітів тощо.

> ⚠ За замовчуванням варто працювати максимум часу в онлайн режимі:
> **обмеження на офлайн — не більше 36 годин підряд і 168 годин на місяць.**
> Слідкувати за нормою повинен клієнт, який використовує API.

Заголовки: `X-Client-Name`, `X-Client-Version`, `X-License-Key` (обов'язково),
`Authorization`, `Content-Type: application/json`.

```json
{
  "id": "<унікальний ідентифікатор зміни у форматі UUID>",
  "fiscal_code": "<фіскальний код>",
  "fiscal_date": "<фіскальна дата ISO 8601 YYYY-MM-DDThh:mm:ss.ssssss±hh:mm>"
}
```

Відповідь — об'єкт зміни у стані `CREATED` з `initial_transaction.status:
PENDING`, `offline_id: null` для онлайн-відкриття (для офлайн — офлайн-код),
`previous_hash` — хеш попередньої транзакції.

## Перевірка статусу — `GET /api/v1/shifts/{shift_id}`

Після запиту на відкриття або закриття треба відстежувати статус зміни, поки
він не стане `OPENED` або `CLOSED`:
- відкриття → `OPENED`: можна проводити фіскальні операції (чеки, X-звіт);
- відкриття → `CLOSED`: зміну не вдалося відкрити; причина відмови — у
  `initial_transaction`;
- закриття → `CLOSED`: кінцевий статус; далі візуалізація Z-звіту
  `GET /api/v1/reports/{report_id}/text`.

Статуси зміни: `CREATED / OPENED / CLOSING / CLOSED`. Статуси транзакції:
`CREATED / PENDING / SIGNED / DELIVERED / DONE` (або `ERROR`).

Поля зміни: `id`, `serial` (рахуються і невдалі), `status`, `z_report` (для
відкритої — `null`), `opened_at`, `closed_at`, `initial_transaction`,
`closing_transaction`, `created_at`, `updated_at`, `balance{initial, balance,
cash_sales, card_sales, discounts_sum, extra_charge_sum, cash_returns,
card_returns, service_in, service_out, updated_at}`, `taxes[]`,
`emergency_close`, `emergency_close_details`, `cash_register{id,
fiscal_number, active, number}`, `cashier{id, full_name, nin, key_id,
signature_type, permissions{…}, certificate_end, blocked}`.

Поля транзакції: `id`, `type` (`SHIFT_OPEN`, `RECEIPT`, `Z_REPORT`, …),
`serial`, `status`, `request_signed_at`, `request_received_at`,
`response_status` (`OK` при успіху), `response_error_message`, `response_id`
(фіскальний номер від ДПС), `offline_id` (офлайн фіскальний номер; `null`,
якщо транзакцію створено онлайн), `created_at`, `updated_at`,
`original_datetime`, `previous_hash`.

## Закриття зміни — `POST /api/v1/shifts/close`

> Checkbox рекомендує **реалізувати закриття зміни на своєму боці** і не
> покладатись на автоматичне закриття на сайті як основний спосіб.

- **Перед закриттям потрібно впевнитись, що всі попередні транзакції зміни
  мають кінцевий статус `DONE`.** Стан зміни стає `CLOSING`, створюється
  `closing_transaction`; `CLOSED` — після підпису КЕП і доставки в ДПС.
- Після закриття **автоматично формується Z-звіт**; далі в цій зміні нічого
  робити не можна — для роботи відкривають нову зміну.
- Тіло порожнє → усі дані Z-звіту формує сервер Checkbox (**рекомендовано**).
  Або тіло з `report{…}` — тоді звіт формується так, як його заповнила
  інтеграція, **з усіма можливими помилками в даних; перевірка коректності
  оборотів на боці Checkbox не виконується**.
- Офлайн-закриття: у тілі `fiscal_code` («фіскальний код звіту, тільки для
  створення звіту у офлайн режимі») і `fiscal_date`; `skip_client_name_check`
  — вимкнення перевірки програми-клієнта, через яку відкривали зміну (за
  замовчуванням `false`).

Відповідь — об'єкт зміни зі `status: CLOSING` і блоком `z_report{id, serial,
is_z_report, payments[], taxes[], sell_receipts_count, return_receipts_count,
cash_withdrawal_receipts_count, transfers_count, transfers_sum, balance,
initial, sales_round_up/down, returns_round_up/down, discounts_sum,
extra_charge_sum, transaction_fail, created_at}`; `closing_transaction.type:
Z_REPORT`.

## Наслідки для нашого дизайну

1. Перша зміна — тільки онлайн; офлайн-відкриття вимагає `go-offline` перед
   `POST /shifts` (підтверджує порядок «перехід → операції»).
2. Закривати зміну можна лише коли **всі** транзакції `DONE` — тобто після
   повного реплею офлайн-чеків і виходу в онлайн. Це і є заборона на
   авто-закриття, поки живе офлайн-оренда.
3. Ліміт офлайну — **36 год підряд і 168 год на місяць**; обидва рахує клієнт.
4. Змішувати API з Checkbox.Kasa/Manager не можна — наш локальний офлайн не
   може спиратися на їхній агент.
