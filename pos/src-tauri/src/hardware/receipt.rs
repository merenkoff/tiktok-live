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

#[derive(Deserialize)]
pub struct ReceiptItem {
    pub name: String,
    pub variant_label: String,
    pub quantity: i64,
    pub unit_price_cents: i64,
    pub line_total_cents: i64,
}

#[derive(Deserialize)]
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

/// The ПРРО result our own layout prints as a fiscal block.
#[derive(Deserialize)]
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
}

#[derive(Deserialize)]
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
    /// present; every other field is then ignored. Both new fields default so
    /// a host built before them keeps printing the layout.
    #[serde(default)]
    pub provider_text: Option<String>,
    #[serde(default)]
    pub fiscal: Option<ReceiptFiscal>,
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

fn payment_label(method: &str) -> &str {
    match method {
        "cash" => "Готівка",
        "card" => "Картка",
        "qr" => "QR-код",
        other => other,
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
        let qty_line = two_col(
            width,
            &format!("  {} x {}", item.quantity, money(item.unit_price_cents)),
            &money(item.line_total_cents),
        );
        printer.writeln(&qty_line).map_err(|e| e.to_string())?;
    }

    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
    printer
        .writeln(&two_col(width, "Підсумок", &money(receipt.subtotal_cents)))
        .map_err(|e| e.to_string())?;

    if let Some(discount) = receipt.discount_cents.filter(|d| *d != 0) {
        printer
            .writeln(&two_col(width, "Знижка", &format!("-{}", money(discount))))
            .map_err(|e| e.to_string())?;
    }

    printer.bold(true).map_err(|e| e.to_string())?;
    let total_label = if receipt.kind == ReceiptKind::Refund {
        "ДО ПОВЕРНЕННЯ"
    } else {
        "РАЗОМ"
    };
    printer
        .writeln(&two_col(width, total_label, &money(receipt.total_cents)))
        .map_err(|e| e.to_string())?;
    printer.bold(false).map_err(|e| e.to_string())?;
    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;

    for payment in &receipt.payments {
        printer
            .writeln(&two_col(width, payment_label(&payment.method), &money(payment.amount_cents)))
            .map_err(|e| e.to_string())?;
    }

    // Fiscal block: the number the tax office knows this receipt by, and its
    // verification link as a QR the printer renders itself (native ESC/POS
    // `GS ( k`, no image library) — a 200-char URL as text would just wrap.
    if let Some(fiscal) = &receipt.fiscal {
        printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
        printer.writeln("Фіскальний чек").map_err(|e| e.to_string())?;
        // An offline receipt is a different document and has to say so on the
        // paper, above its number — same order Checkbox's own offline receipt
        // uses (TechDocs/checkbox-api/receipts-offline.md).
        if fiscal.offline {
            printer.writeln("ОФЛАЙН").map_err(|e| e.to_string())?;
        }
        printer
            .writeln(&two_col(width, "ФН чека", &fiscal.fiscal_code))
            .map_err(|e| e.to_string())?;
        if let Some(number) = fiscal.control_number.as_deref().filter(|n| !n.is_empty()) {
            printer
                .writeln(&two_col(width, "Контрольне число", number))
                .map_err(|e| e.to_string())?;
        }
        if let Some(date) = &fiscal.fiscal_date {
            printer.writeln(date).map_err(|e| e.to_string())?;
        }
        if let Some(url) = fiscal.tax_url.as_deref().filter(|u| !u.is_empty()) {
            printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;
            printer.qrcode(url).map_err(|e| e.to_string())?;
            printer.writeln("cabinet.tax.gov.ua").map_err(|e| e.to_string())?;
            printer.justify(JustifyMode::LEFT).map_err(|e| e.to_string())?;
        } else if fiscal.offline {
            // No QR yet: its `mac` is the ПРРО transaction-chain hash, which
            // only exists once the document reaches the register that keeps the
            // chain. Say it plainly rather than print a link that would fail
            // verification in the tax office cabinet.
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
            }],
            subtotal_cents: 10000,
            discount_cents: None,
            total_cents: 10000,
            payments: vec![ReceiptPayment { method: "cash".into(), amount_cents: 10000 }],
            provider_text: None,
            fiscal: None,
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
        receipt.fiscal = Some(ReceiptFiscal {
            fiscal_code: "TEST-fKbevQ".into(),
            fiscal_date: Some("09.09.2026, 14:59:03".into()),
            tax_url: Some("https://cabinet.tax.gov.ua/cashregs/check?id=TEST-fKbevQ".into()),
        });
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("Фіскальний чек")));
        assert!(contains(&bytes, b"TEST-fKbevQ"));
        // ESC/POS 2D-code function group: GS ( k
        assert!(contains(&bytes, &[0x1D, 0x28, 0x6B]));
        // And still our own footer — this is the local layout, not the provider's.
        assert!(contains(&bytes, &win1251("Дякуємо за покупку!")));
    }

    #[test]
    fn no_fiscal_block_for_a_non_fiscal_store() {
        let bytes = build_ticket(&base(), CHARS_58MM).unwrap();
        assert!(!contains(&bytes, &win1251("Фіскальний чек")));
        assert!(!contains(&bytes, &[0x1D, 0x28, 0x6B]));
    }
}
