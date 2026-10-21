# Cashalot — інші специфікації (не зберігаємо, лише посилання)

Знято 2026-10-21. Усе нижче — або Windows-шлях через встановлене РМК Cashalot
(COM, .NET Bridge, драйвер BAS), який нам не підходить (наш бекенд на Railway,
касa — Tauri/веб), або старіші версії WEB API, які поточна спека замінила.
Тримаємо перелік, щоб у пошуку не прийняти стару версію за актуальну.

| Документ | Версія / дата | URL | Примітка |
|---|---|---|---|
| Специфікація WEB API ПРРО Cashälot | 1.0.2.3471 від 30.05.2022 | https://cashalot.org.ua/files/uploads/instruction_api.pdf | попередник; поля сертифіката/ключа, авто-Z-звіт — усе є в 2.1 |
| Специфікація рішень API ПРРО Cashalot | v1.0 від 28.05.2021 | https://cashalot.org.ua/files/uploads/driver_for_cashalot_%20v.1.0.pdf | драйвер/варіанти для 1С, BAS |
| Специфікація драйвера для розрахунково-облікових систем | від 05.02.2021 | https://medoc.ua/files/uploads/driver_for_cashalot_ias9dia92201oei9e.pdf | `CashaLotApiBridge.dll`, виклики з кореня встановленого Cashalot |
| Специфікація рішень API ПРРО Cashalot | v3.3 від 11.11.2021 (від ПРРО 1.00.33) | https://cashalot.org.ua/files/uploads/spec_for_cashalot_v3.3.pdf | `CashaLotApiDrv32.dll` для BAS |
| Специфікація рішень API ПРРО Cashalot | v3.5.1 від 06.01.2022 | https://antra-service.com/files/spec_for_cashalot_v3.5.1.pdf | дзеркало партнера |
| Специфікація використання API COM Cashälot | v4.2 (завантажено 2023-02) | https://cashalot.ua/uploads/files/2023/02/lH0NaxYWFkAnalUiRCFi59OiVQwoneqRoHtUH1oK.pdf | |
| Специфікація використання API COM Cashalot | v5.3 (2025-02) | https://cashalot.ua/uploads/files/2025/02/rT81U31DW7xupJFO9Cr6ZlPsw7cnfBcjc2CqSs04.pdf | |
| Specification API COM Cashalot | v5.9.0 (01.00.1002), поточна | https://cashalot.ua/instructions/api-com-cashalot | PDF 2,8 МБ; посилається на `https://fs.tax.gov.ua:8643/fs/cmd`, `load.cashalot.org.ua/update/`, `api.novaposhta.ua` |
| Специфікація використання Cashälot API Bridge | v4.0 | https://me-doc.info/download/API_NET_doc.pdf | .NET |
| Специфікація використання Cashälot API Bridge | v4.4 (2023-07) | https://cashalot.ua/uploads/files/2023/07/HHEb3iEMwQEi2Wyv0BVuSGTYgctrhbbbcLs1Zv7Y.pdf | поточна — https://cashalot.ua/instructions/api-bridge-cashalot |
| Документація драйвера BAS / POS-термінала для BAS | — | https://cashalot.ua/instructions/driver-for-bas-cashalot, https://cashalot.ua/instructions/driver-pos-for-bas-cashalot | |

Джерела ДПС, на які спирається WEB API (у нас уже зняті):
«Опис АРІ Фіскального Сервера» — [../../dps/fiscal-server-api.md](../../dps/fiscal-server-api.md);
формат НБУ «Технологія зберігання і збору даних РРО для ДПС» v2.1.9 ред. 1.4 —
https://tax.gov.ua/baneryi/programni-rro/opis-ari-fiskalnogo-servera/opis-ari--elektronniy-kabinet-/ (не знімали: `ConvertDocument` нам не потрібен).
