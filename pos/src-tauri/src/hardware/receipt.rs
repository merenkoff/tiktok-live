// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

use std::fs::OpenOptions;

use escpos::driver::FileDriver;
use escpos::printer::Printer;
use escpos::printer_options::PrinterOptions;
use escpos::utils::{JustifyMode, PageCode, Protocol};
use printers::common::base::job::PrinterJobOptions;
use serde::Deserialize;

#[derive(Deserialize, Default)]
pub struct ReceiptItem {
    pub name: String,
    pub variant_label: String,
    pub quantity: i64,
    pub unit_price_cents: i64,
    pub line_total_cents: i64,
    /// Letter of the VAT rate (Положення № 13, розділ II п. 2, рядок 11).
    /// Absent in a store that does not fiscalise.
    #[serde(default)]
    pub tax_symbol: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct ReceiptPayment {
    pub method: String,
    pub amount_cents: i64,
}

/// A refund prints as its own document referencing the sale it undoes.
/// Defaults to `Sale` so older callers that omit the field keep working.
#[derive(Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ReceiptKind {
    #[default]
    Sale,
    Refund,
}

/// Рядки 1–5: who sold and where, as the ПРРО provider has it registered.
/// Absent for a store that does not fiscalise — its paper stays as it was.
#[derive(Deserialize, Default)]
pub struct ReceiptHeader {
    #[serde(default)]
    pub org_name: Option<String>,
    #[serde(default)]
    pub point_name: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
    /// «ПН 1234567890» for a VAT payer, «ІД 12345678» otherwise.
    #[serde(default)]
    pub tax_id_line: Option<String>,
}

/// Рядок 21: one «ПДВ» line per rate letter.
#[derive(Deserialize, Default)]
pub struct ReceiptVatLine {
    pub symbol: String,
    pub rate: f64,
    pub amount_cents: i64,
}

/// The ПРРО result our own layout prints as a fiscal block.
#[derive(Deserialize, Default)]
pub struct ReceiptFiscal {
    pub fiscal_code: String,
    #[serde(default)]
    pub fiscal_date: Option<String>,
    #[serde(default)]
    pub tax_url: Option<String>,
    /// Stamped from the offline reserve — the paper must say so.
    #[serde(default)]
    pub offline: bool,
    /// Контрольне число; absent until the document reaches the provider.
    #[serde(default)]
    pub control_number: Option<String>,
    /// Рядок 34: «ФН ПРРО …». Cached from the provider; absent before the
    /// first online contact.
    #[serde(default)]
    pub register_fiscal_number: Option<String>,
    /// Рядок 31: `"online"` / `"offline"`. The mark is printed on every ПРРО
    /// receipt; `offline` above is the older flag and still decides when this
    /// is absent.
    #[serde(default)]
    pub mode: Option<String>,
    /// Рядок 35: the ПРРО software's name next to «ФІСКАЛЬНИЙ ЧЕК».
    #[serde(default)]
    pub producer: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct ReceiptData {
    pub store_name: String,
    #[serde(default)]
    pub kind: ReceiptKind,
    pub receipt_number: String,
    #[serde(default)]
    pub refund_of_receipt: Option<String>,
    pub created_at: String,
    pub staff_name: String,
    pub customer_name: Option<String>,
    pub items: Vec<ReceiptItem>,
    pub subtotal_cents: i64,
    pub discount_cents: Option<i64>,
    pub total_cents: i64,
    pub payments: Vec<ReceiptPayment>,
    /// The fiscal provider's own pre-rendered receipt. Printed verbatim when
    /// present; every other field is then ignored. Every field below defaults
    /// so a host built before it keeps printing the layout.
    #[serde(default)]
    pub provider_text: Option<String>,
    #[serde(default)]
    pub fiscal: Option<ReceiptFiscal>,
    /// Рядки 1–5. Absent for a non-fiscal store.
    #[serde(default)]
    pub header: Option<ReceiptHeader>,
    /// Рядок 21. Empty when the store is not a VAT payer or has no rate table.
    #[serde(default)]
    pub vat_lines: Vec<ReceiptVatLine>,
    /// Рядок 25: cash handed back. Absent when nothing was.
    #[serde(default)]
    pub change_cents: Option<i64>,
}

// Characters per line for the two common thermal paper widths (Font A, ~12 dots
// wide): 58mm rolls fit 32, 80mm rolls fit 48. The cashier picks the roll size
// in Hardware settings; 58mm stays the default when nothing is stored.
const CHARS_58MM: usize = 32;
const CHARS_80MM: usize = 48;

fn chars_per_line(paper_width_mm: Option<u16>) -> usize {
    match paper_width_mm {
        Some(mm) if mm >= 80 => CHARS_80MM,
        _ => CHARS_58MM,
    }
}

// Thermal printers don't speak UTF-8: without a code page the raw UTF-8 bytes
// get rendered through the printer's default table (PC437) and Cyrillic comes
// out as garbage. Windows-1251 is the one ESC/POS Cyrillic table in the escpos
// crate that carries the full Ukrainian set (і, ї, є, ґ); PC866 there is missing
// them. `Printer::init()` emits the matching `ESC t` select command, and every
// `write` maps each char to its single Win-1251 byte.
const RECEIPT_PAGE_CODE: PageCode = PageCode::WPC1251;

fn money(cents: i64) -> String {
    format!("{:.2}", cents as f64 / 100.0)
}

fn divider(width: usize) -> String {
    "-".repeat(width)
}

fn two_col(width: usize, left: &str, right: &str) -> String {
    let space = width.saturating_sub(left.chars().count() + right.chars().count()).max(1);
    format!("{left}{}{right}", " ".repeat(space))
}

/// Рядок 18: the regulation knows three forms of payment — «ГОТІВКА»,
/// «БЕЗГОТІВКОВА», «ІНШЕ»; the bracket keeps the detail the cashier had.
fn payment_label(method: &str) -> String {
    match method {
        "cash" => "ГОТІВКА".into(),
        "card" => "БЕЗГОТІВКОВА (картка)".into(),
        "qr" => "БЕЗГОТІВКОВА (QR)".into(),
        other => format!("ІНШЕ ({other})"),
    }
}

/// Рядок 21: «ПДВ А 20%» — a whole-number rate prints without decimals.
fn vat_label(line: &ReceiptVatLine) -> String {
    if line.rate.fract() == 0.0 {
        format!("ПДВ {} {}%", line.symbol, line.rate as i64)
    } else {
        format!("ПДВ {} {}%", line.symbol, line.rate)
    }
}

fn build_ticket(receipt: &ReceiptData, width: usize) -> Result<Vec<u8>, String> {
    let dir = std::env::temp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("pos-receipt-{}.bin", now_nanos()));

    // `FileDriver::open` opens read+append and never creates the file, so it
    // fails with "No such file or directory" on our fresh temp path. Create it.
    let mut open_opts = OpenOptions::new();
    open_opts.read(true).write(true).create(true).truncate(true);
    let driver = FileDriver::open_with_options(&path, &open_opts).map_err(|e| e.to_string())?;
    let options = PrinterOptions::new(Some(RECEIPT_PAGE_CODE), None, width as u8);
    let mut printer = Printer::new(driver, Protocol::default(), Some(options));

    printer.init().map_err(|e| e.to_string())?;

    // The provider already laid the receipt out at this roll's width (the
    // store's `receipt_width`); lines are exactly `width` chars like our own
    // `two_col` output, so they go through unchanged, same Win-1251 mapping.
    if let Some(text) = receipt.provider_text.as_deref().filter(|t| !t.trim().is_empty()) {
        printer.justify(JustifyMode::LEFT).map_err(|e| e.to_string())?;
        for line in text.lines() {
            printer.writeln(line.trim_end_matches('\r')).map_err(|e| e.to_string())?;
        }
        printer.feed().map_err(|e| e.to_string())?;
        printer.print_cut().map_err(|e| e.to_string())?;
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&path);
        return Ok(bytes);
    }

    printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;
    printer.bold(true).map_err(|e| e.to_string())?;
    printer.writeln(&receipt.store_name).map_err(|e| e.to_string())?;
    printer.bold(false).map_err(|e| e.to_string())?;
    // Рядки 1–5, in the regulation's order, straight from the provider's
    // registration — a fiscal store prints them on every receipt.
    if let Some(header) = &receipt.header {
        for line in [
            &header.org_name,
            &header.point_name,
            &header.address,
            &header.tax_id_line,
        ]
        .into_iter()
        .flatten()
        .filter(|l| !l.trim().is_empty())
        {
            printer.writeln(line).map_err(|e| e.to_string())?;
        }
    }
    if receipt.kind == ReceiptKind::Refund {
        printer
            .writeln(&format!("ЧЕК ПОВЕРНЕННЯ {}", receipt.receipt_number))
            .map_err(|e| e.to_string())?;
        if let Some(origin) = &receipt.refund_of_receipt {
            printer
                .writeln(&format!("до чека {origin}"))
                .map_err(|e| e.to_string())?;
        }
    } else {
        printer
            .writeln(&format!("Чек {}", receipt.receipt_number))
            .map_err(|e| e.to_string())?;
    }
    printer.writeln(&receipt.created_at).map_err(|e| e.to_string())?;
    printer.justify(JustifyMode::LEFT).map_err(|e| e.to_string())?;
    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;

    for item in &receipt.items {
        let title = format!("{} {}", item.name, item.variant_label);
        printer.writeln(&title).map_err(|e| e.to_string())?;
        // Рядок 11: the rate letter closes the line, «100.00 А».
        let amount = match item.tax_symbol.as_deref().filter(|s| !s.is_empty()) {
            Some(symbol) => format!("{} {symbol}", money(item.line_total_cents)),
            None => money(item.line_total_cents),
        };
        let qty_line = two_col(
            width,
            &format!("  {} x {}", item.quantity, money(item.unit_price_cents)),
            &amount,
        );
        printer.writeln(&qty_line).map_err(|e| e.to_string())?;
    }

    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
    // Рядок 20 «СУМА», 21 «ПДВ», 24 «ДО СПЛАТИ» — the regulation's own words,
    // on a non-fiscal receipt as well: one layout, one set of tests.
    printer
        .writeln(&two_col(width, "СУМА", &money(receipt.subtotal_cents)))
        .map_err(|e| e.to_string())?;

    if let Some(discount) = receipt.discount_cents.filter(|d| *d != 0) {
        printer
            .writeln(&two_col(width, "Знижка", &format!("-{}", money(discount))))
            .map_err(|e| e.to_string())?;
    }

    for line in &receipt.vat_lines {
        printer
            .writeln(&two_col(width, &vat_label(line), &money(line.amount_cents)))
            .map_err(|e| e.to_string())?;
    }

    printer.bold(true).map_err(|e| e.to_string())?;
    let total_label = if receipt.kind == ReceiptKind::Refund {
        "ДО ПОВЕРНЕННЯ"
    } else {
        "ДО СПЛАТИ"
    };
    printer
        .writeln(&two_col(width, total_label, &money(receipt.total_cents)))
        .map_err(|e| e.to_string())?;
    printer.bold(false).map_err(|e| e.to_string())?;
    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;

    for payment in &receipt.payments {
        printer
            .writeln(&two_col(width, &payment_label(&payment.method), &money(payment.amount_cents)))
            .map_err(|e| e.to_string())?;
    }
    // Рядок 25.
    if let Some(change) = receipt.change_cents.filter(|c| *c > 0) {
        printer
            .writeln(&two_col(width, "РЕШТА", &money(change)))
            .map_err(|e| e.to_string())?;
    }

    // Fiscal block, rows 26–35 of the regulation: what document this is, the
    // number the tax office knows it by, and its verification link as a QR the
    // printer renders itself (native ESC/POS `GS ( k`, no image library) — a
    // 200-char URL as text would just wrap.
    if let Some(fiscal) = &receipt.fiscal {
        printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
        // Рядок 35: «ФІСКАЛЬНИЙ ЧЕК» and the ПРРО software that made it.
        let title = match fiscal.producer.as_deref().filter(|p| !p.is_empty()) {
            Some(producer) => two_col(width, "ФІСКАЛЬНИЙ ЧЕК", producer),
            None => "ФІСКАЛЬНИЙ ЧЕК".to_string(),
        };
        printer.bold(true).map_err(|e| e.to_string())?;
        printer.writeln(&title).map_err(|e| e.to_string())?;
        printer.bold(false).map_err(|e| e.to_string())?;
        // Рядок 31: the mode mark goes on every ПРРО receipt. An offline
        // receipt is a different document and has to say so on the paper,
        // above its number — same order Checkbox's own offline receipt uses
        // (TechDocs/checkbox-api/receipts-offline.md).
        let offline = fiscal.offline || fiscal.mode.as_deref() == Some("offline");
        printer
            .writeln(if offline { "ОФЛАЙН" } else { "ОНЛАЙН" })
            .map_err(|e| e.to_string())?;
        // Рядок 26: the fiscal number of the receipt.
        printer
            .writeln(&two_col(width, "ЧЕК №", &fiscal.fiscal_code))
            .map_err(|e| e.to_string())?;
        // Рядок 32.
        if let Some(number) = fiscal.control_number.as_deref().filter(|n| !n.is_empty()) {
            printer
                .writeln(&two_col(width, "Контрольне число", number))
                .map_err(|e| e.to_string())?;
        }
        // Рядок 34.
        if let Some(fn_) = fiscal.register_fiscal_number.as_deref().filter(|n| !n.is_empty()) {
            printer
                .writeln(&two_col(width, "ФН ПРРО", fn_))
                .map_err(|e| e.to_string())?;
        }
        // Рядок 27.
        if let Some(date) = &fiscal.fiscal_date {
            printer.writeln(date).map_err(|e| e.to_string())?;
        }
        // Рядок 29.
        if let Some(url) = fiscal.tax_url.as_deref().filter(|u| !u.is_empty()) {
            printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;
            printer.qrcode(url).map_err(|e| e.to_string())?;
            printer.writeln("cabinet.tax.gov.ua").map_err(|e| e.to_string())?;
            printer.justify(JustifyMode::LEFT).map_err(|e| e.to_string())?;
        } else if offline {
            // No QR yet: the link needs the register's own fiscal number, which
            // the till only has after its first online contact. Say it plainly
            // rather than print a link that would open an error page.
            printer
                .writeln("QR буде після синхронізації з ПРРО")
                .map_err(|e| e.to_string())?;
        }
    }

    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
    printer
        .writeln(&format!("Касир: {}", receipt.staff_name))
        .map_err(|e| e.to_string())?;

    if let Some(customer) = &receipt.customer_name {
        printer
            .writeln(&format!("Клієнт: {customer}"))
            .map_err(|e| e.to_string())?;
    }

    printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;
    printer.feed().map_err(|e| e.to_string())?;
    let footer = if receipt.kind == ReceiptKind::Refund {
        "Кошти повернуто"
    } else {
        "Дякуємо за покупку!"
    };
    printer.writeln(footer).map_err(|e| e.to_string())?;
    printer.print_cut().map_err(|e| e.to_string())?;

    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&path);
    Ok(bytes)
}

fn now_nanos() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

// `document-format` is handled very differently per platform by the `printers`
// crate: on Windows it is passed straight through as the Win32 print datatype
// (StartDocPrinterW only accepts registered types like "RAW"/"TEXT", so a MIME
// string makes the job fail outright), while on Unix it is a CUPS option and
// "application/vnd.cups-raw" is what stops CUPS from running our ESC/POS bytes
// through a text-to-PostScript filter. Pick the right value per OS.
#[cfg(windows)]
const RAW_JOB_PROPS: &[(&str, &str)] = &[("document-format", "RAW")];
#[cfg(not(windows))]
const RAW_JOB_PROPS: &[(&str, &str)] = &[("document-format", "application/vnd.cups-raw")];

#[tauri::command]
pub fn print_receipt(
    printer_name: String,
    receipt: ReceiptData,
    paper_width_mm: Option<u16>,
) -> Result<(), String> {
    let bytes = build_ticket(&receipt, chars_per_line(paper_width_mm))?;

    let target = printers::get_printer_by_name(&printer_name)
        .ok_or_else(|| format!("Принтер \"{printer_name}\" не знайдено"))?;

    target
        .print(
            &bytes,
            PrinterJobOptions {
                name: Some("Чек"),
                raw_properties: RAW_JOB_PROPS,
                ..PrinterJobOptions::none()
            },
        )
        .map_err(|e| format!("{e:?}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win1251(s: &str) -> Vec<u8> {
        // Only what these tests need: ASCII passes through, Cyrillic maps to
        // the Win-1251 table the printer is switched to (`RECEIPT_PAGE_CODE`).
        s.chars()
            .map(|c| match c {
                'А'..='Я' => 0xC0 + (c as u32 - 'А' as u32) as u8,
                'а'..='я' => 0xE0 + (c as u32 - 'а' as u32) as u8,
                'і' => 0xB3,
                'І' => 0xB2,
                'ї' => 0xBF,
                'є' => 0xBA,
                'Є' => 0xAA,
                c => c as u8,
            })
            .collect()
    }

    fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack.windows(needle.len()).any(|w| w == needle)
    }

    fn base() -> ReceiptData {
        ReceiptData {
            store_name: "Demo".into(),
            kind: ReceiptKind::Sale,
            receipt_number: "R-00001".into(),
            refund_of_receipt: None,
            created_at: "09.09.2026, 14:59:03".into(),
            staff_name: "Олена".into(),
            customer_name: None,
            items: vec![ReceiptItem {
                name: "Футболка".into(),
                variant_label: "M".into(),
                quantity: 1,
                unit_price_cents: 10000,
                line_total_cents: 10000,
                tax_symbol: None,
            }],
            subtotal_cents: 10000,
            discount_cents: None,
            total_cents: 10000,
            payments: vec![ReceiptPayment { method: "cash".into(), amount_cents: 10000 }],
            ..Default::default()
        }
    }

    fn fiscal() -> ReceiptFiscal {
        ReceiptFiscal {
            fiscal_code: "TEST-fKbevQ".into(),
            fiscal_date: Some("09.09.2026, 14:59:03".into()),
            tax_url: Some("https://cabinet.tax.gov.ua/cashregs/check?id=TEST-fKbevQ".into()),
            ..Default::default()
        }
    }

    #[test]
    fn provider_text_prints_verbatim_and_nothing_of_ours() {
        let mut receipt = base();
        receipt.provider_text = Some("=== ТЕСТОВИЙ ЧЕК ===\nСУМА 100.00 ГРН\n".into());
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("=== ТЕСТОВИЙ ЧЕК ===")));
        assert!(contains(&bytes, &win1251("СУМА 100.00 ГРН")));
        assert!(!contains(&bytes, &win1251("Дякуємо за покупку!")));
        assert!(!contains(&bytes, &win1251("Касир")));
    }

    #[test]
    fn empty_provider_text_falls_back_to_the_layout() {
        let mut receipt = base();
        receipt.provider_text = Some("   \n".into());
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("Дякуємо за покупку!")));
    }

    #[test]
    fn fiscal_block_carries_the_number_and_a_qr() {
        let mut receipt = base();
        receipt.fiscal = Some(fiscal());
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("ФІСКАЛЬНИЙ ЧЕК")));
        assert!(contains(&bytes, b"TEST-fKbevQ"));
        // Рядок 31 is printed online too.
        assert!(contains(&bytes, &win1251("ОНЛАЙН")));
        // ESC/POS 2D-code function group: GS ( k
        assert!(contains(&bytes, &[0x1D, 0x28, 0x6B]));
        // And still our own footer — this is the local layout, not the provider's.
        assert!(contains(&bytes, &win1251("Дякуємо за покупку!")));
    }

    #[test]
    fn no_fiscal_block_for_a_non_fiscal_store() {
        let bytes = build_ticket(&base(), CHARS_58MM).unwrap();
        assert!(!contains(&bytes, &win1251("ФІСКАЛЬНИЙ ЧЕК")));
        assert!(!contains(&bytes, &win1251("ОНЛАЙН")));
        assert!(!contains(&bytes, &[0x1D, 0x28, 0x6B]));
    }

    #[test]
    fn header_prints_the_requisites_in_the_regulation_order() {
        let mut receipt = base();
        receipt.header = Some(ReceiptHeader {
            org_name: Some("ТОВ «Тест»".into()),
            point_name: Some("Магазин №1".into()),
            address: Some("м. Київ, вул. Хрещатик, 1".into()),
            tax_id_line: Some("ПН 1234567890".into()),
        });
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        let org = bytes
            .windows(win1251("ТОВ").len())
            .position(|w| w == win1251("ТОВ").as_slice())
            .unwrap();
        let tax = bytes
            .windows(win1251("ПН 1234567890").len())
            .position(|w| w == win1251("ПН 1234567890").as_slice())
            .unwrap();
        let items = bytes
            .windows(win1251("Футболка").len())
            .position(|w| w == win1251("Футболка").as_slice())
            .unwrap();
        assert!(org < tax && tax < items);
    }

    #[test]
    fn offline_receipt_says_so_and_carries_the_register_number() {
        let mut receipt = base();
        receipt.fiscal = Some(ReceiptFiscal {
            fiscal_code: "OFF-0002".into(),
            tax_url: None,
            mode: Some("offline".into()),
            control_number: Some("9933".into()),
            register_fiscal_number: Some("4001118166".into()),
            producer: Some("ПРРО Checkbox".into()),
            ..Default::default()
        });
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("ОФЛАЙН")));
        assert!(!contains(&bytes, &win1251("ОНЛАЙН")));
        assert!(contains(&bytes, b"9933"));
        assert!(contains(&bytes, b"4001118166"));
        assert!(contains(&bytes, &win1251("ПРРО Checkbox")));
        assert!(contains(&bytes, &win1251("QR буде після синхронізації з ПРРО")));
        assert!(!contains(&bytes, &[0x1D, 0x28, 0x6B]));
    }

    #[test]
    fn older_offline_flag_still_marks_the_receipt() {
        let mut receipt = base();
        receipt.fiscal = Some(ReceiptFiscal { offline: true, mode: None, ..fiscal() });
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("ОФЛАЙН")));
    }

    #[test]
    fn vat_letters_lines_and_change_follow_the_regulation() {
        let mut receipt = base();
        receipt.items[0].tax_symbol = Some("А".into());
        receipt.vat_lines = vec![ReceiptVatLine { symbol: "А".into(), rate: 20.0, amount_cents: 1667 }];
        receipt.payments = vec![ReceiptPayment { method: "cash".into(), amount_cents: 15000 }];
        receipt.change_cents = Some(5000);
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("100.00 А")));
        assert!(contains(&bytes, &win1251("ПДВ А 20%")));
        assert!(contains(&bytes, b"16.67"));
        assert!(contains(&bytes, &win1251("ГОТІВКА")));
        assert!(contains(&bytes, &win1251("РЕШТА")));
        assert!(contains(&bytes, b"50.00"));
        assert!(contains(&bytes, &win1251("ДО СПЛАТИ")));
    }

    #[test]
    fn card_and_qr_are_cashless() {
        assert_eq!(payment_label("card"), "БЕЗГОТІВКОВА (картка)");
        assert_eq!(payment_label("qr"), "БЕЗГОТІВКОВА (QR)");
        assert_eq!(payment_label("cash"), "ГОТІВКА");
        assert_eq!(payment_label("bonus"), "ІНШЕ (bonus)");
    }
}
