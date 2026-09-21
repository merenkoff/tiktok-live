// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

//! The kitchen ticket (café phase К3e): what the kitchen or the bar gets on
//! its own printer the moment a sale is rung. It is not a receipt — no
//! prices, no fiscal block, no store header — and it is deliberately loud:
//! the order number at triple size, one line per item at double height,
//! the answers and the kitchen note indented under it. The host routes one
//! ticket per station (`lib/kitchenTicket.ts`); this side only draws it.
//!
//! Same ESC/POS pipeline as the receipt (`receipt.rs`): Win-1251 page code,
//! raw job to a named OS printer. Paper carries only Win-1251, so the note
//! marker is a plain `*`, never the «✎» the screen shows.

use std::fs::OpenOptions;

use escpos::driver::FileDriver;
use escpos::printer::Printer;
use escpos::printer_options::PrinterOptions;
use escpos::utils::{JustifyMode, Protocol};
use serde::Deserialize;

use crate::hardware::receipt::{chars_per_line, divider, now_nanos, send_raw, RECEIPT_PAGE_CODE};

#[derive(Deserialize, Default)]
pub struct KitchenTicketItem {
    pub name: String,
    #[serde(default)]
    pub variant_label: String,
    pub quantity: i64,
    /// The answers the line chose, by name — «вівсяне», «без цукру».
    #[serde(default)]
    pub modifiers: Vec<String>,
    /// The kitchen note for this line.
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct KitchenTicketData {
    /// What the counter will call out: the server's «17» or the till's own
    /// «К17» while the sale is still in the outbox.
    pub order_label: String,
    /// «КУХНЯ» / «БАР» — absent when the store routes nothing by station.
    #[serde(default)]
    pub station: Option<String>,
    /// Already formatted by the host — the time the sale was rung.
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub staff_name: String,
    /// The order-level note, if the sale carried one.
    #[serde(default)]
    pub note: Option<String>,
    /// Small, at the bottom: what to look for on the till if something is off.
    #[serde(default)]
    pub receipt_number: Option<String>,
    pub items: Vec<KitchenTicketItem>,
}

fn build_kitchen_ticket(ticket: &KitchenTicketData, width: usize) -> Result<Vec<u8>, String> {
    let dir = std::env::temp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("pos-kitchen-{}.bin", now_nanos()));

    let mut open_opts = OpenOptions::new();
    open_opts.read(true).write(true).create(true).truncate(true);
    let driver = FileDriver::open_with_options(&path, &open_opts).map_err(|e| e.to_string())?;
    let options = PrinterOptions::new(Some(RECEIPT_PAGE_CODE), None, width as u8);
    let mut printer = Printer::new(driver, Protocol::default(), Some(options));

    printer.init().map_err(|e| e.to_string())?;
    printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;

    // The number, first and biggest: it is what the barista reads across the
    // counter and what the customer hears.
    printer.bold(true).map_err(|e| e.to_string())?;
    printer.size(3, 3).map_err(|e| e.to_string())?;
    printer.writeln(&ticket.order_label).map_err(|e| e.to_string())?;
    printer.reset_size().map_err(|e| e.to_string())?;

    if let Some(station) = ticket.station.as_deref().filter(|s| !s.trim().is_empty()) {
        printer.size(1, 2).map_err(|e| e.to_string())?;
        printer.writeln(station).map_err(|e| e.to_string())?;
        printer.reset_size().map_err(|e| e.to_string())?;
    }
    printer.bold(false).map_err(|e| e.to_string())?;

    let who = if ticket.staff_name.trim().is_empty() {
        ticket.created_at.clone()
    } else {
        // Two spaces, no glyph: the escpos Win-1251 table sends a hyphen as
        // 0xAD (a soft hyphen) and a middle dot is not in the test encoder.
        format!("{}  {}", ticket.created_at, ticket.staff_name)
    };
    printer.writeln(&who).map_err(|e| e.to_string())?;

    printer.justify(JustifyMode::LEFT).map_err(|e| e.to_string())?;
    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;

    for item in &ticket.items {
        let label = item.variant_label.trim();
        let head = if label.is_empty() {
            format!("{} x {}", item.quantity, item.name)
        } else {
            format!("{} x {} {}", item.quantity, item.name, label)
        };
        printer.bold(true).map_err(|e| e.to_string())?;
        printer.size(1, 2).map_err(|e| e.to_string())?;
        printer.writeln(&head).map_err(|e| e.to_string())?;
        printer.reset_size().map_err(|e| e.to_string())?;
        printer.bold(false).map_err(|e| e.to_string())?;
        for modifier in &item.modifiers {
            printer
                .writeln(&format!("   {modifier}"))
                .map_err(|e| e.to_string())?;
        }
        if let Some(note) = item.note.as_deref().filter(|n| !n.trim().is_empty()) {
            printer
                .writeln(&format!("   * {}", note.trim()))
                .map_err(|e| e.to_string())?;
        }
    }

    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
    if let Some(note) = ticket.note.as_deref().filter(|n| !n.trim().is_empty()) {
        printer
            .writeln(&format!("Замовлення: {}", note.trim()))
            .map_err(|e| e.to_string())?;
    }
    if let Some(number) = ticket.receipt_number.as_deref().filter(|n| !n.trim().is_empty()) {
        printer
            .writeln(&format!("Чек {number}"))
            .map_err(|e| e.to_string())?;
    }

    printer.feed().map_err(|e| e.to_string())?;
    printer.print_cut().map_err(|e| e.to_string())?;

    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&path);
    Ok(bytes)
}

/// Print one kitchen ticket to a named OS printer. Same trust surface as
/// `print_receipt` — a printer name and text — and the same checklist answer
/// (TechDocs/POS_MODULE_TAURI_CAPABILITIES.md §7): no paths, no network,
/// nothing beyond the printer the host names.
#[tauri::command]
pub fn print_kitchen_ticket(
    printer_name: String,
    ticket: KitchenTicketData,
    paper_width_mm: Option<u16>,
) -> Result<(), String> {
    let bytes = build_kitchen_ticket(&ticket, chars_per_line(paper_width_mm))?;
    send_raw(&printer_name, &bytes, "Тікет")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hardware::receipt::test_util::{contains, win1251};

    const CHARS_58MM: usize = 32;

    fn base() -> KitchenTicketData {
        KitchenTicketData {
            order_label: "17".into(),
            station: Some("БАР".into()),
            created_at: "14:59".into(),
            staff_name: "Олена".into(),
            note: Some("з собою".into()),
            receipt_number: Some("ЧК-000017".into()),
            items: vec![
                KitchenTicketItem {
                    name: "Латте".into(),
                    variant_label: "M".into(),
                    quantity: 2,
                    modifiers: vec!["вівсяне".into(), "без цукру".into()],
                    note: Some("гарячіше".into()),
                },
                KitchenTicketItem {
                    name: "Круасан".into(),
                    variant_label: "".into(),
                    quantity: 1,
                    modifiers: vec![],
                    note: None,
                },
            ],
        }
    }

    fn position(bytes: &[u8], needle: &[u8]) -> usize {
        bytes.windows(needle.len()).position(|w| w == needle).unwrap()
    }

    #[test]
    fn the_order_label_comes_first_at_triple_size() {
        let bytes = build_kitchen_ticket(&base(), CHARS_58MM).unwrap();
        // GS ! 0x22 = width ×3, height ×3 — before the label, and the label
        // before anything else the ticket says.
        let triple = position(&bytes, &[0x1D, 0x21, 0x22]);
        let label = position(&bytes, &win1251("17"));
        let station = position(&bytes, &win1251("БАР"));
        let first_item = position(&bytes, &win1251("2 x Латте M"));
        assert!(triple < label);
        assert!(label < station);
        assert!(station < first_item);
        // Back to normal size before the station line.
        assert!(contains(&bytes[label..station], &[0x1D, 0x21, 0x00]));
    }

    #[test]
    fn items_carry_their_answers_and_notes_indented_and_no_money_at_all() {
        let bytes = build_kitchen_ticket(&base(), CHARS_58MM).unwrap();
        let latte = position(&bytes, &win1251("2 x Латте M"));
        let oat = position(&bytes, &win1251("   вівсяне"));
        let sugar = position(&bytes, &win1251("   без цукру"));
        let note = position(&bytes, &win1251("   * гарячіше"));
        let croissant = position(&bytes, &win1251("1 x Круасан"));
        assert!(latte < oat && oat < sugar && sugar < note && note < croissant);
        assert!(contains(&bytes, &win1251("Замовлення: з собою")));
        // The hyphen goes out as 0xAD on this table, so match around it.
        let receipt = position(&bytes, &win1251("Чек ЧК"));
        assert!(contains(&bytes[receipt..], &win1251("000017")));
        assert!(contains(&bytes, &win1251("14:59  Олена")));
        assert!(!contains(&bytes, &win1251("ДО СПЛАТИ")));
        assert!(!contains(&bytes, &win1251("СУМА")));
        assert!(!contains(&bytes, &win1251(".00")));
        // No «✎» on paper: the marker is the ASCII star.
        assert!(!contains(&bytes, "✎".as_bytes()));
    }

    #[test]
    fn a_store_without_stations_gets_a_ticket_without_a_heading() {
        let mut ticket = base();
        ticket.station = None;
        ticket.note = None;
        ticket.receipt_number = None;
        let bytes = build_kitchen_ticket(&ticket, CHARS_58MM).unwrap();
        assert!(!contains(&bytes, &win1251("БАР")));
        assert!(!contains(&bytes, &win1251("Замовлення:")));
        assert!(!contains(&bytes, &win1251("Чек ")));
        assert!(contains(&bytes, &win1251("17")));
    }

    #[test]
    fn a_minimal_payload_parses_with_every_optional_field_defaulted() {
        // A host that sends only what it must — an older build of the
        // ticket builder, or a ticket for a store that names no stations.
        let json = serde_json::json!({
            "order_label": "К1",
            "items": [{ "name": "Еспресо", "quantity": 1 }]
        });
        let ticket: KitchenTicketData = serde_json::from_value(json).unwrap();
        assert_eq!(ticket.station, None);
        assert_eq!(ticket.items[0].modifiers.len(), 0);
        assert_eq!(ticket.items[0].note, None);
        let bytes = build_kitchen_ticket(&ticket, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("К1")));
        assert!(contains(&bytes, &win1251("1 x Еспресо")));
    }
}
