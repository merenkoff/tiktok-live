// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

//! The pre-bill (café phase К4h, TechDocs/POS_TABLES.md §4.5): what the
//! guests are handed when they ask «рахунок, будь ласка».
//!
//! It is emphatically **not** a receipt, and the layout has to say so out
//! loud. Under Закон 265/95-ВР the settlement document is the fiscal receipt;
//! a pre-bill has no legal force whatever it looks like. So this document
//! carries «ПЕРЕДЧЕК» at double size and the line «НЕ Є РОЗРАХУНКОВИМ
//! ДОКУМЕНТОМ» right under it, and it carries none of the things that would
//! make it look like the real one: no «ЧЕК №», no fiscal block, no tax-office
//! QR, no «Дякуємо за покупку!». A guest who is given one and walks out has
//! not been given a receipt, and the paper must not be able to suggest
//! otherwise.
//!
//! Its own file with its own command, exactly like `kitchen_ticket.rs`: a
//! second document type shares the ESC/POS primitives (`receipt.rs`) and
//! nothing else. Same Win-1251 page code and the same raw job to a named OS
//! printer; paper carries no «·», so the parts of a heading are joined with
//! two spaces rather than a glyph the table would mangle.

use std::fs::OpenOptions;

use escpos::driver::FileDriver;
use escpos::printer::Printer;
use escpos::printer_options::PrinterOptions;
use escpos::utils::{JustifyMode, Protocol};
use serde::Deserialize;

use crate::hardware::receipt::{
    chars_per_line, divider, money, now_nanos, send_raw, two_col, RECEIPT_PAGE_CODE,
};

#[derive(Deserialize, Default)]
pub struct PrecheckItem {
    pub name: String,
    /// Already composed by the round when it fired — modifiers included.
    #[serde(default)]
    pub variant_label: String,
    pub quantity: i64,
    pub unit_price_cents: i64,
    pub line_total_cents: i64,
}

#[derive(Deserialize, Default)]
pub struct PrecheckData {
    pub table_name: String,
    #[serde(default)]
    pub hall_name: String,
    #[serde(default)]
    pub bill_no: Option<i64>,
    #[serde(default)]
    pub guests: Option<i64>,
    /// Already formatted by the host: when the table was seated.
    #[serde(default)]
    pub opened_at: String,
    /// Already formatted by the host: now.
    #[serde(default)]
    pub printed_at: String,
    #[serde(default)]
    pub waiter_name: String,
    pub items: Vec<PrecheckItem>,
    pub total_cents: i64,
}

const TITLE: &str = "ПЕРЕДЧЕК";
const DISCLAIMER: &str = "НЕ Є РОЗРАХУНКОВИМ ДОКУМЕНТОМ";

fn build_precheck(bill: &PrecheckData, width: usize) -> Result<Vec<u8>, String> {
    let dir = std::env::temp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("pos-precheck-{}.bin", now_nanos()));

    let mut open_opts = OpenOptions::new();
    open_opts.read(true).write(true).create(true).truncate(true);
    let driver = FileDriver::open_with_options(&path, &open_opts).map_err(|e| e.to_string())?;
    let options = PrinterOptions::new(Some(RECEIPT_PAGE_CODE), None, width as u8);
    let mut printer = Printer::new(driver, Protocol::default(), Some(options));

    printer.init().map_err(|e| e.to_string())?;
    printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;

    // The two lines that do the legal work, and they come before anything a
    // guest could mistake for a total.
    printer.bold(true).map_err(|e| e.to_string())?;
    printer.size(2, 2).map_err(|e| e.to_string())?;
    printer.writeln(TITLE).map_err(|e| e.to_string())?;
    printer.reset_size().map_err(|e| e.to_string())?;
    printer.writeln(DISCLAIMER).map_err(|e| e.to_string())?;
    printer.bold(false).map_err(|e| e.to_string())?;

    printer.justify(JustifyMode::LEFT).map_err(|e| e.to_string())?;
    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;

    let hall = bill.hall_name.trim();
    let head = if hall.is_empty() {
        format!("Стіл {}", bill.table_name)
    } else {
        format!("Стіл {}  {hall}", bill.table_name)
    };
    printer.bold(true).map_err(|e| e.to_string())?;
    printer.writeln(&head).map_err(|e| e.to_string())?;
    printer.bold(false).map_err(|e| e.to_string())?;

    let mut facts: Vec<String> = Vec::new();
    if let Some(no) = bill.bill_no {
        facts.push(format!("Рахунок {no}"));
    }
    if let Some(guests) = bill.guests.filter(|g| *g > 0) {
        facts.push(format!("{guests} гост."));
    }
    if !facts.is_empty() {
        printer.writeln(&facts.join("  ")).map_err(|e| e.to_string())?;
    }

    let mut when: Vec<String> = Vec::new();
    if !bill.opened_at.trim().is_empty() {
        when.push(format!("Відкрито {}", bill.opened_at.trim()));
    }
    if !bill.waiter_name.trim().is_empty() {
        when.push(bill.waiter_name.trim().to_string());
    }
    if !when.is_empty() {
        printer.writeln(&when.join("  ")).map_err(|e| e.to_string())?;
    }

    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;

    for item in &bill.items {
        let label = item.variant_label.trim();
        let title = if label.is_empty() {
            item.name.clone()
        } else {
            format!("{} {label}", item.name)
        };
        printer.writeln(&title).map_err(|e| e.to_string())?;
        printer
            .writeln(&two_col(
                width,
                &format!("  {} x {}", item.quantity, money(item.unit_price_cents)),
                &money(item.line_total_cents),
            ))
            .map_err(|e| e.to_string())?;
    }

    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
    // «РАЗОМ», never «ДО СПЛАТИ»: the second is the regulation's own wording
    // for a fiscal receipt (рядок 24), and a pre-bill borrowing it would be
    // the very impersonation the disclaimer above denies.
    printer.bold(true).map_err(|e| e.to_string())?;
    printer.size(1, 2).map_err(|e| e.to_string())?;
    printer
        .writeln(&two_col(width, "РАЗОМ", &money(bill.total_cents)))
        .map_err(|e| e.to_string())?;
    printer.reset_size().map_err(|e| e.to_string())?;
    printer.bold(false).map_err(|e| e.to_string())?;

    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
    printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;
    // Said twice on purpose: the guest reads the bottom of the paper, and
    // this is the one sentence the law cares about.
    printer.writeln(DISCLAIMER).map_err(|e| e.to_string())?;
    printer
        .writeln("Розрахунковий документ видається після оплати")
        .map_err(|e| e.to_string())?;
    if !bill.printed_at.trim().is_empty() {
        printer.writeln(bill.printed_at.trim()).map_err(|e| e.to_string())?;
    }

    printer.feed().map_err(|e| e.to_string())?;
    printer.print_cut().map_err(|e| e.to_string())?;

    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&path);
    Ok(bytes)
}

/// Print one pre-bill to a named OS printer. Same trust surface as
/// `print_receipt` and `print_kitchen_ticket` — a printer name and text —
/// and the same checklist answer (TechDocs/POS_MODULE_TAURI_CAPABILITIES.md
/// §7): no paths, no network, nothing beyond the printer the host names.
#[tauri::command]
pub fn print_precheck(
    printer_name: String,
    bill: PrecheckData,
    paper_width_mm: Option<u16>,
) -> Result<(), String> {
    let bytes = build_precheck(&bill, chars_per_line(paper_width_mm))?;
    send_raw(&printer_name, &bytes, "Передчек")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hardware::receipt::test_util::{contains, win1251};

    const CHARS_58MM: usize = 32;

    fn base() -> PrecheckData {
        PrecheckData {
            table_name: "5".into(),
            hall_name: "Зала".into(),
            bill_no: Some(12),
            guests: Some(4),
            opened_at: "19:40".into(),
            printed_at: "20:41".into(),
            waiter_name: "Марта".into(),
            items: vec![
                PrecheckItem {
                    name: "Латте".into(),
                    variant_label: "M вівсяне".into(),
                    quantity: 2,
                    unit_price_cents: 8000,
                    line_total_cents: 16000,
                },
                PrecheckItem {
                    name: "Чізкейк".into(),
                    variant_label: "".into(),
                    quantity: 1,
                    unit_price_cents: 7500,
                    line_total_cents: 7500,
                },
            ],
            total_cents: 23500,
        }
    }

    fn position(bytes: &[u8], needle: &[u8]) -> usize {
        bytes.windows(needle.len()).position(|w| w == needle).unwrap()
    }

    fn count(bytes: &[u8], needle: &[u8]) -> usize {
        bytes.windows(needle.len()).filter(|w| *w == needle).count()
    }

    #[test]
    fn it_says_what_it_is_before_it_says_any_money() {
        let bytes = build_precheck(&base(), CHARS_58MM).unwrap();
        // GS ! 0x11 = width ×2, height ×2 — before the title.
        let double = position(&bytes, &[0x1D, 0x21, 0x11]);
        let title = position(&bytes, &win1251(TITLE));
        let disclaimer = position(&bytes, &win1251(DISCLAIMER));
        let first_price = position(&bytes, &win1251("80.00"));
        assert!(double < title);
        assert!(title < disclaimer);
        assert!(disclaimer < first_price);
        // And again at the bottom, where the guest reads.
        assert_eq!(count(&bytes, &win1251(DISCLAIMER)), 2);
    }

    #[test]
    fn it_carries_none_of_the_marks_of_a_real_receipt() {
        let bytes = build_precheck(&base(), CHARS_58MM).unwrap();
        // «чек» appears on this paper only as the tail of «ПЕРЕДЧЕК» — never
        // as «ЧЕК №», which is the fiscal receipt's own line.
        assert_eq!(count(&bytes, &win1251("ЧЕК")), count(&bytes, &win1251("ПЕРЕДЧЕК")));
        assert!(!contains(&bytes, &win1251("ЧЕК №")));
        assert!(!contains(&bytes, &win1251("ФІСКАЛЬНИЙ")));
        assert!(!contains(&bytes, &win1251("ФН ПРРО")));
        assert!(!contains(&bytes, &win1251("ДО СПЛАТИ")));
        assert!(!contains(&bytes, &win1251("ПДВ")));
        assert!(!contains(&bytes, &win1251("Дякуємо")));
        // The word it does use for the sum.
        assert!(contains(&bytes, &win1251("РАЗОМ")));
    }

    #[test]
    fn the_table_and_the_lines_read_in_the_order_the_evening_happened() {
        let bytes = build_precheck(&base(), CHARS_58MM).unwrap();
        let table = position(&bytes, &win1251("Стіл 5  Зала"));
        let facts = position(&bytes, &win1251("Рахунок 12  4 гост."));
        let opened = position(&bytes, &win1251("Відкрито 19:40  Марта"));
        let latte = position(&bytes, &win1251("Латте M вівсяне"));
        let qty = position(&bytes, &win1251("  2 x 80.00"));
        let cheesecake = position(&bytes, &win1251("Чізкейк"));
        let total = position(&bytes, &win1251("РАЗОМ"));
        assert!(table < facts && facts < opened && opened < latte);
        assert!(latte < qty && qty < cheesecake && cheesecake < total);
        assert!(contains(&bytes[total..], &win1251("235.00")));
        assert!(contains(&bytes, &win1251("20:41")));
    }

    #[test]
    fn a_minimal_payload_parses_with_every_optional_field_defaulted() {
        // A host older than this layout, or a table nobody named a hall for.
        let json = serde_json::json!({
            "table_name": "3",
            "items": [{
                "name": "Еспресо",
                "quantity": 1,
                "unit_price_cents": 5500,
                "line_total_cents": 5500
            }],
            "total_cents": 5500
        });
        let bill: PrecheckData = serde_json::from_value(json).unwrap();
        assert_eq!(bill.bill_no, None);
        assert_eq!(bill.guests, None);
        let bytes = build_precheck(&bill, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("Стіл 3")));
        assert!(!contains(&bytes, &win1251("Рахунок")));
        assert!(!contains(&bytes, &win1251("Відкрито")));
        assert!(contains(&bytes, &win1251("Еспресо")));
    }
}
