# Cashalot — API Кабінету користувача (конспект swagger, знято 2026-10-21)

Джерело — `cabinet-api-swagger-v1.json` (OpenAPI 3.0.1, title «API Кабінету
користувача», version v1, блоку `servers` немає — шляхи відносні до
`https://my.cashalot.org.ua/`, що не перевірено). Це **не** API фіскалізації:
воно читає з кабінету каси, зміни, чеки і звіти, запускає імпорт номенклатури
і надсилає чек клієнту. Навіщо нам: звірка нашого реєстру
`pos_fiscal_receipts` з тим, що бачить Cashalot (аналог `reconcileQrPayments`),
і `SendReceipt` як запасний канал «чек покупцю» — не раніше CA7.

## Авторизація

Схем безпеки у swagger немає; усе в тілі запиту. `POST /api/v{version}/Authorization`
із кодом ЄДРПОУ і `hash` (за описом схеми — SHA-256 від дати запиту `YYYYMMDD`
і ключа API; точний порядок конкатенації перевірити на живому) → `token`, який
решта методів передають у тілі як `token`; живе 15 хвилин від останнього запиту.

## Методи (усі POST, параметр шляху `{version}`)

| Шлях | Що |
|---|---|
| `/api/v{version}/Authorization` | отримати токен |
| `/api/v{version}/GetReceipts` | чеки за фільтром |
| `/api/v{version}/GetShifts` | зміни |
| `/api/v{version}/GetReports` | Z-звіти |
| `/api/v{version}/GetAllData` | зміни + чеки + звіти одним пакетом |
| `/api/v{version}/GetReceiptUrl` | посилання на перегляд чека |
| `/api/v{version}/StartImport` | запустити імпорт номенклатури |
| `/api/v{version}/GetImportStatus` | стан імпорту |
| `/api/v{version}/SendReceipt` | надіслати чек клієнту (SMS/Viber, `OpenApiSendServiceType`) |

## Схеми (поля, як у swagger)

- **ApiImportItem**: `vendorcode` string, `name` string, `barcode` string nullable, `groupName` string nullable, `type` string nullable, `unitType` string, `uktzedCode` string nullable, `dkppCode` string nullable, `pdvAmount` string nullable, `pdvLetter` string nullable, `exciseAmount` string nullable, `exciseLetter` string nullable, `pfAmount` string nullable, `pfLetter` string nullable, `sellPrice` string, `tradeMargin` string nullable, `buyPrice` string nullable
- **ApiImportModelView**: `edrPou` string, `mode` ImportMode, `nomenclatures` array<ApiImportItem>
- **AuthorizationRequest**: `edrpou` string, `hash` string
- **AuthorizationResponse**: `resultCode` integer int32, `resultMessage` string nullable, `token` string uuid
- **EPaymentType** (enum integer): 0, 1
- **ETaxType** (enum integer): 0, 1
- **FullInfo**: `dfsNumber` string nullable, `dateBeg` string date-time, `dateEnd` string date-time nullable, `firmName` string nullable, `businessunitName` string nullable, `businessUnitAddress` string nullable, `edrpou` string nullable, `inn` string nullable, `fullName` string nullable, `localNumber` string nullable, `cashierName` string nullable, `rroFiscalNumber` integer int64, `receipt` array<Receipt>, `report` Report
- **FullInfoResposeArrayResult**: `code` integer int32, `message` string nullable, `data` array<FullInfo>
- **IApiImportJobResult**: `isError` boolean, `isCompleted` boolean, `recordCount` integer int32, `create` integer int32, `update` integer int32, `bad` integer int32, `validationMessages` array<string>
- **IApiImportJobResultResposeArrayResult**: `code` integer int32, `message` string nullable, `data` array<IApiImportJobResult>
- **ImportMode** (enum integer): 0, 1, 2
- **OpenApiImportStatusRequest**: `token` string, `tracker` string
- **OpenApiReceiptRequest**: `token` string, `filters` RequestFilters
- **OpenApiReceiptUrlRequest**: `token` string, `rroFn` string, `receiptFn` string
- **OpenApiSendReceiptRequest**: `token` string, `serviceType` OpenApiSendServiceType, `receiptSum` number double, `receiptFn` string, `prroFn` string, `phoneNumber` string, `dateTime` string date-time
- **OpenApiSendServiceType** (enum integer): 0, 1
- **OpenApiStartImportRequest**: `token` string, `data` ApiImportModelView
- **PaymentSubType** (enum integer): 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21, 22, 23, 24, 25, 26, 27, 101, 102
- **PaymentType** (enum integer): 0, 1, 2, 3, 201, 202, 203, 204, 205, 300, 301, 302, 303, 304, 305, 306, 100000
- **Receipt**: `docType` integer int32, `docSubType` integer int32, `uid` string uuid, `orderDate` string date-time nullable, `orderNum` integer int32, `fiscalNumber` string nullable, `commentDps` string nullable, `sum` number double, `roundSum` number double, `nonRoundSum` number double, `taxes` array<ReceiptTaxes>, `payments` array<ReceiptPayments>, `sales` array<ReceiptSales>, `parentFiscalNumber` string nullable
- **ReceiptPayments**: `paymentFormID` PaymentType, `paymentFormName` string nullable, `paymentSubType` string nullable, `paymentSubTypeId` PaymentSubType, `providedSum` number double nullable, `remainderSum` number double nullable, `totalSum` number double
- **ReceiptResposeArrayResult**: `code` integer int32, `message` string nullable, `data` array<Receipt>
- **ReceiptSales**: `vendorCode` string nullable, `name` string nullable, `typeId` integer int32, `quantity` number double, `unitPrice` number double, `discountSum` number double, `priceOut` number double
- **ReceiptTaxes**: `turnOver` number double, `removedTaxes` number double, `letter` string nullable, `amount` number double, `typeId` integer int32
- **Report**: `orderDate` string date-time nullable, `orderTaxNum` string nullable, `sumReal` number double, `sumRet` number double, `taxSumRet` number double, `taxSumReal` number double, `serviceInput` number double, `serviceOutput` number double, `payments` array<ReportPayments>, `taxes` array<ReportTaxes>
- **ReportPayments**: `paymentFormId` integer int32, `paymentFormCode` integer int32, `paymentFormName` string nullable, `paymentSubTypeId` integer int32, `paymentSubTypeName` string nullable, `totalSum` number double, `type` EPaymentType
- **ReportResposeArrayResult**: `code` integer int32, `message` string nullable, `data` array<Report>
- **ReportTaxes**: `letter` string nullable, `amount` number double, `typeId` integer int32, `sum` number double, `turnOver` number double, `discountSum` number double, `removedTaxes` number double, `type` ETaxType
- **RequestFilters**: `dateFrom` string date-time nullable, `dateTo` string date-time nullable, `rros` array<integer int64>, `pageNumber` integer int32
- **ResponseGetUrlResult**: `code` integer int32, `message` string nullable, `url` string nullable
- **ResponseSendReceipt**: `code` integer int32, `message` string nullable
- **ResposeStartImportResult**: `code` integer int32, `message` string nullable, `tracker` string nullable
- **Shift**: `dfsNumber` string nullable, `dateBeg` string date-time, `dateEnd` string date-time nullable, `firmName` string nullable, `businessunitName` string nullable, `businessUnitAddress` string nullable, `edrpou` string nullable, `inn` string nullable, `fullName` string nullable, `localNumber` string nullable, `cashierName` string nullable, `rroFiscalNumber` integer int64
- **ShiftResposeArrayResult**: `code` integer int32, `message` string nullable, `data` array<Shift>
