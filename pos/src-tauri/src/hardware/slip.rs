// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

//! A non-fiscal slip a feature module prints to its own station printer
//! (phase Г2, TechDocs/grocery/PLAN.md §4) — the debt journal's «ПІД ЗАПИС»
//! first: goods handed over to a customer who will pay later, which under
//! scheme A is not a settlement at all, so its paper must not look like one.
//!
//! Same rules as the pre-bill (`precheck.rs`), with one difference that makes
//! them matter more. A pre-bill's title is ours; a slip's title is the
//! module's, because the documents differ. So what keeps a slip honest is
//! what this file refuses rather than what the caller calls it:
//!  - «НЕ Є РОЗРАХУНКОВИМ ДОКУМЕНТОМ» at the top and at the bottom, always;
//!  - no «ЧЕК №», no fiscal block, no tax-office QR, no «ДО СПЛАТИ»;
//!  - a title that would pass for a receipt («…ЧЕК…», «ФІСКАЛЬН…») and a
//!    total labelled like one («До сплати», «ПДВ», «Решта») are refused
//!    outright, before anything reaches the printer.
//!
//! Its own command because a module cannot carry Rust: the host owns every
//! Tauri command (`EXPECTED_COMMANDS`), and `printSlip` in `@pos/platform`
//! is the only door to this one.

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
pub struct SlipItem {
    pub name: String,
    /// Already formatted by the host: «2», «0,350 кг».
    #[serde(default)]
    pub quantity: String,
    #[serde(default)]
    pub unit_price_cents: Option<i64>,
    #[serde(default)]
    pub line_total_cents: Option<i64>,
}

#[derive(Deserialize, Default)]
pub struct SlipTotal {
    pub label: String,
    pub amount_cents: i64,
}

#[derive(Deserialize, Default)]
pub struct SlipData {
    pub title: String,
    #[serde(default)]
    pub store_name: String,
    /// Under the title, one per row: who, when, which document. Already formatted.
    #[serde(default)]
    pub lines: Vec<String>,
    #[serde(default)]
    pub items: Vec<SlipItem>,
    #[serde(default)]
    pub totals: Vec<SlipTotal>,
    /// Above the bottom disclaimer: «Підпис покупця ______».
    #[serde(default)]
    pub footer: Vec<String>,
    /// Already formatted by the host: now.
    #[serde(default)]
    pub printed_at: String,
}

const DISCLAIMER: &str = "НЕ Є РОЗРАХУНКОВИМ ДОКУМЕНТОМ";

/// Words a slip's title may not carry: they are what a fiscal receipt is called.
const TITLE_FORBIDDEN: [&str; 2] = ["ЧЕК", "ФІСКАЛЬН"];
/// Labels a slip's total may not carry: the receipt's own rows (Положення № 13, рядки 20–25).
const TOTAL_FORBIDDEN: [&str; 4] = ["ДО СПЛАТИ", "ПДВ", "РЕШТА", "ФІСКАЛЬН"];

fn check(slip: &SlipData) -> Result<(), String> {
    let title = slip.title.trim().to_uppercase();
    if title.is_empty() {
        return Err("Квитанція без заголовка".into());
    }
    if TITLE_FORBIDDEN.iter().any(|word| title.contains(word)) {
        return Err("Нефіскальна квитанція не може називатися чеком".into());
    }
    for total in &slip.totals {
        let label = total.label.trim().to_uppercase();
        if TOTAL_FORBIDDEN.iter().any(|word| label.contains(word)) {
            return Err(format!("Рядок «{}» належить фіскальному чеку", total.label.trim()));
        }
    }
    Ok(())
}

fn build_slip(slip: &SlipData, width: usize) -> Result<Vec<u8>, String> {
    check(slip)?;

    let dir = std::env::temp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("pos-slip-{}.bin", now_nanos()));

    let mut open_opts = OpenOptions::new();
    open_opts.read(true).write(true).create(true).truncate(true);
    let driver = FileDriver::open_with_options(&path, &open_opts).map_err(|e| e.to_string())?;
    let options = PrinterOptions::new(Some(RECEIPT_PAGE_CODE), None, width as u8);
    let mut printer = Printer::new(driver, Protocol::default(), Some(options));

    printer.init().map_err(|e| e.to_string())?;
    printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;

    // What it is, before anything with a number in it.
    printer.bold(true).map_err(|e| e.to_string())?;
    printer.size(2, 2).map_err(|e| e.to_string())?;
    printer.writeln(slip.title.trim()).map_err(|e| e.to_string())?;
    printer.reset_size().map_err(|e| e.to_string())?;
    printer.writeln(DISCLAIMER).map_err(|e| e.to_string())?;
    printer.bold(false).map_err(|e| e.to_string())?;
    if !slip.store_name.trim().is_empty() {
        printer.writeln(slip.store_name.trim()).map_err(|e| e.to_string())?;
    }

    printer.justify(JustifyMode::LEFT).map_err(|e| e.to_string())?;
    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;

    for line in slip.lines.iter().map(|l| l.trim()).filter(|l| !l.is_empty()) {
        printer.writeln(line).map_err(|e| e.to_string())?;
    }

    if !slip.items.is_empty() {
        printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
        for item in &slip.items {
            printer.writeln(item.name.trim()).map_err(|e| e.to_string())?;
            let quantity = item.quantity.trim();
            let left = match item.unit_price_cents {
                Some(price) if !quantity.is_empty() => format!("  {quantity} x {}", money(price)),
                _ if !quantity.is_empty() => format!("  {quantity}"),
                _ => String::new(),
            };
            match item.line_total_cents {
                Some(total) => {
                    printer
                        .writeln(&two_col(width, &left, &money(total)))
                        .map_err(|e| e.to_string())?;
                }
                None if !left.is_empty() => {
                    printer.writeln(&left).map_err(|e| e.to_string())?;
                }
                None => {}
            }
        }
    }

    if !slip.totals.is_empty() {
        printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
        printer.bold(true).map_err(|e| e.to_string())?;
        for total in &slip.totals {
            printer
                .writeln(&two_col(width, total.label.trim(), &money(total.amount_cents)))
                .map_err(|e| e.to_string())?;
        }
        printer.bold(false).map_err(|e| e.to_string())?;
    }

    let footer: Vec<&str> = slip.footer.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    if !footer.is_empty() {
        printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
        for line in footer {
            printer.writeln(line).map_err(|e| e.to_string())?;
        }
    }

    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
    printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;
    // Said twice on purpose, as on the pre-bill: the bottom is where people read.
    printer.writeln(DISCLAIMER).map_err(|e| e.to_string())?;
    if !slip.printed_at.trim().is_empty() {
        printer.writeln(slip.printed_at.trim()).map_err(|e| e.to_string())?;
    }

    printer.feed().map_err(|e| e.to_string())?;
    printer.print_cut().map_err(|e| e.to_string())?;

    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&path);
    Ok(bytes)
}

/// Print one non-fiscal slip to a named OS printer. Same trust surface as
/// `print_precheck` — a printer name and text — and the same checklist answer
/// (TechDocs/POS_MODULE_TAURI_CAPABILITIES.md §7): no paths, no network,
/// nothing beyond the printer the host names.
#[tauri::command]
pub fn print_slip(
    printer_name: String,
    slip: SlipData,
    paper_width_mm: Option<u16>,
) -> Result<(), String> {
    let bytes = build_slip(&slip, chars_per_line(paper_width_mm))?;
    send_raw(&printer_name, &bytes, "Квитанція")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hardware::receipt::test_util::{contains, win1251};

    const CHARS_58MM: usize = 32;

    fn base() -> SlipData {
        SlipData {
            title: "ПІД ЗАПИС".into(),
            store_name: "Крамниця біля дому".into(),
            lines: vec!["Покупець: Ольга".into(), "Касир: Марта".into()],
            items: vec![
                SlipItem {
                    name: "Хліб житній".into(),
                    quantity: "2".into(),
                    unit_price_cents: Some(3200),
                    line_total_cents: Some(6400),
                },
                SlipItem {
                    name: "Сир твердий".into(),
                    quantity: "0,350 кг".into(),
                    unit_price_cents: Some(18990),
                    line_total_cents: Some(6647),
                },
            ],
            totals: vec![
                SlipTotal { label: "Разом".into(), amount_cents: 13047 },
                SlipTotal { label: "Борг після".into(), amount_cents: 124047 },
            ],
            footer: vec!["Підпис покупця ________".into()],
            printed_at: "24.10.2026 14:05".into(),
        }
    }

    fn position(bytes: &[u8], needle: &[u8]) -> usize {
        bytes.windows(needle.len()).position(|w| w == needle).unwrap()
    }

    fn count(bytes: &[u8], needle: &[u8]) -> usize {
        bytes.windows(needle.len()).filter(|w| *w == needle).count()
    }

    #[test]
    fn it_says_what_it_is_before_any_money_and_again_at_the_bottom() {
        let bytes = build_slip(&base(), CHARS_58MM).unwrap();
        let double = position(&bytes, &[0x1D, 0x21, 0x11]);
        let title = position(&bytes, &win1251("ПІД ЗАПИС"));
        let disclaimer = position(&bytes, &win1251(DISCLAIMER));
        let first_price = position(&bytes, &win1251("32.00"));
        assert!(double < title && title < disclaimer && disclaimer < first_price);
        assert_eq!(count(&bytes, &win1251(DISCLAIMER)), 2);
    }

    #[test]
    fn it_carries_none_of_the_marks_of_a_receipt() {
        let bytes = build_slip(&base(), CHARS_58MM).unwrap();
        assert!(!contains(&bytes, &win1251("ЧЕК")));
        assert!(!contains(&bytes, &win1251("ФІСКАЛЬНИЙ")));
        assert!(!contains(&bytes, &win1251("ФН ПРРО")));
        assert!(!contains(&bytes, &win1251("ДО СПЛАТИ")));
    }

    #[test]
    fn the_lines_items_and_totals_read_top_to_bottom() {
        let bytes = build_slip(&base(), CHARS_58MM).unwrap();
        let buyer = position(&bytes, &win1251("Покупець: Ольга"));
        let bread = position(&bytes, &win1251("Хліб житній"));
        let qty = position(&bytes, &win1251("  2 x 32.00"));
        let cheese = position(&bytes, &win1251("0,350 кг x 189.90"));
        let total = position(&bytes, &win1251("Разом"));
        let after = position(&bytes, &win1251("Борг після"));
        let sign = position(&bytes, &win1251("Підпис покупця"));
        assert!(buyer < bread && bread < qty && qty < cheese && cheese < total && total < after);
        assert!(after < sign);
        assert!(contains(&bytes[after..], &win1251("1240.47")));
        assert!(contains(&bytes, &win1251("24.10.2026 14:05")));
    }

    #[test]
    fn a_title_or_a_total_that_would_pass_for_a_receipt_is_refused() {
        for title in ["Фіскальний чек", "ЧЕК №12", "товарний чек"] {
            let slip = SlipData { title: title.into(), ..base() };
            assert!(build_slip(&slip, CHARS_58MM).is_err(), "{title}");
        }
        for label in ["До сплати", "ПДВ А 20%", "Решта"] {
            let slip = SlipData {
                totals: vec![SlipTotal { label: label.into(), amount_cents: 100 }],
                ..base()
            };
            assert!(build_slip(&slip, CHARS_58MM).is_err(), "{label}");
        }
        let untitled = SlipData { title: "  ".into(), ..base() };
        assert!(build_slip(&untitled, CHARS_58MM).is_err());
    }

    #[test]
    fn a_minimal_payload_parses_with_every_optional_field_defaulted() {
        let json = serde_json::json!({ "title": "ВИДАЧА" });
        let slip: SlipData = serde_json::from_value(json).unwrap();
        let bytes = build_slip(&slip, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("ВИДАЧА")));
        assert_eq!(count(&bytes, &win1251(DISCLAIMER)), 2);
    }
}
