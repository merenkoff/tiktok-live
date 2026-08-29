use escpos::driver::FileDriver;
use escpos::printer::Printer;
use escpos::utils::{JustifyMode, Protocol};
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

#[derive(Deserialize)]
pub struct ReceiptData {
    pub store_name: String,
    pub receipt_number: String,
    pub created_at: String,
    pub staff_name: String,
    pub customer_name: Option<String>,
    pub items: Vec<ReceiptItem>,
    pub subtotal_cents: i64,
    pub discount_cents: Option<i64>,
    pub total_cents: i64,
    pub payments: Vec<ReceiptPayment>,
}

// 58mm paper, the cheaper/more common Xprinter width.
const LINE_WIDTH: usize = 32;

fn money(cents: i64) -> String {
    format!("{:.2}", cents as f64 / 100.0)
}

fn divider() -> String {
    "-".repeat(LINE_WIDTH)
}

fn two_col(left: &str, right: &str) -> String {
    let space = LINE_WIDTH.saturating_sub(left.chars().count() + right.chars().count()).max(1);
    format!("{left}{}{right}", " ".repeat(space))
}

fn payment_label(method: &str) -> &str {
    match method {
        "cash" => "Готівка",
        "card" => "Картка",
        other => other,
    }
}

fn build_ticket(receipt: &ReceiptData) -> Result<Vec<u8>, String> {
    let dir = std::env::temp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("pos-receipt-{}.bin", now_nanos()));

    let driver = FileDriver::open(&path).map_err(|e| e.to_string())?;
    let mut printer = Printer::new(driver, Protocol::default(), None);

    printer.init().map_err(|e| e.to_string())?;
    printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;
    printer.bold(true).map_err(|e| e.to_string())?;
    printer.writeln(&receipt.store_name).map_err(|e| e.to_string())?;
    printer.bold(false).map_err(|e| e.to_string())?;
    printer
        .writeln(&format!("Чек {}", receipt.receipt_number))
        .map_err(|e| e.to_string())?;
    printer.writeln(&receipt.created_at).map_err(|e| e.to_string())?;
    printer.justify(JustifyMode::LEFT).map_err(|e| e.to_string())?;
    printer.writeln(&divider()).map_err(|e| e.to_string())?;

    for item in &receipt.items {
        let title = format!("{} {}", item.name, item.variant_label);
        printer.writeln(&title).map_err(|e| e.to_string())?;
        let qty_line = two_col(
            &format!("  {} x {}", item.quantity, money(item.unit_price_cents)),
            &money(item.line_total_cents),
        );
        printer.writeln(&qty_line).map_err(|e| e.to_string())?;
    }

    printer.writeln(&divider()).map_err(|e| e.to_string())?;
    printer
        .writeln(&two_col("Підсумок", &money(receipt.subtotal_cents)))
        .map_err(|e| e.to_string())?;

    if let Some(discount) = receipt.discount_cents.filter(|d| *d != 0) {
        printer
            .writeln(&two_col("Знижка", &format!("-{}", money(discount))))
            .map_err(|e| e.to_string())?;
    }

    printer.bold(true).map_err(|e| e.to_string())?;
    printer
        .writeln(&two_col("РАЗОМ", &money(receipt.total_cents)))
        .map_err(|e| e.to_string())?;
    printer.bold(false).map_err(|e| e.to_string())?;
    printer.writeln(&divider()).map_err(|e| e.to_string())?;

    for payment in &receipt.payments {
        printer
            .writeln(&two_col(payment_label(&payment.method), &money(payment.amount_cents)))
            .map_err(|e| e.to_string())?;
    }

    printer.writeln(&divider()).map_err(|e| e.to_string())?;
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
    printer.writeln("Дякуємо за покупку!").map_err(|e| e.to_string())?;
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
pub fn print_receipt(printer_name: String, receipt: ReceiptData) -> Result<(), String> {
    let bytes = build_ticket(&receipt)?;

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
