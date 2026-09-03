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
