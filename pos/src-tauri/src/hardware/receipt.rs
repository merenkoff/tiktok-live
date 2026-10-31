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
    /// The quantity row ready to print, when «quantity x price» would lie: a
    /// weighed line is grams at a price per kilogram, so it prints «0.350 кг x
    /// 189.90», not «350 x 189.90» (рядок 6: weighed goods in kilograms to
    /// the gram). The host formats it (`lib/receipt.ts`) because only the host
    /// knows the line's `price_per` (TechDocs/grocery/G4_WEIGHED.md). Absent
    /// on every other line and from a host built before weighed goods.
    #[serde(default)]
    pub quantity_text: Option<String>,
    /// A line under the row — «вагу введено вручну» for a hand-typed weight.
    #[serde(default)]
    pub note: Option<String>,
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
    /// The short daily number the counter calls out, printed large above the
    /// receipt number. Only a café sends it; absent from an older host.
    #[serde(default)]
    pub order_no: Option<i64>,
    /// The till's own number for a receipt it printed before the sale reached
    /// the server — «К17», a string because of the letter. `order_no` wins
    /// when both are set; a host built before this field never sends it.
    #[serde(default)]
    pub order_label: Option<String>,
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
    /// Рядок 23 «Заокруглення» (Положення № 13 розд. II п. 9; НБУ № 25),
    /// signed: what was paid — or handed back — is `total_cents` plus this.
    /// Absent from a host built before cash rounding: nothing changes.
    #[serde(default)]
    pub rounding_cents: Option<i64>,
    /// The guest menu's feedback sheet, printed as the QR «Оцініть нас» at the
    /// very bottom (phase F7, TechDocs/POS_QR_MENU_FEEDBACK.md). The host
    /// sends it only where the owner takes feedback; absent from an older
    /// host, ignored on a refund — nobody is asked to rate a return.
    #[serde(default)]
    pub feedback_url: Option<String>,
}

/// Title and caption of the feedback QR — the same words the guest page's
/// own button uses, so the paper and the phone ask one question.
pub(crate) const FEEDBACK_TITLE: &str = "Оцініть нас";
pub(crate) const FEEDBACK_CAPTION: &str = "Як вам сьогодні? Відскануйте";

/// The feedback QR block (F7): a divider, «Оцініть нас», the QR the printer
/// renders itself and one line under it. Shared by the receipt and the
/// pre-bill. It says nothing fiscal and names no money, so it is as welcome
/// on the pre-bill — which must not look like a receipt — as on the receipt.
/// Leaves the printer left-justified.
pub(crate) fn feedback_block(
    printer: &mut Printer<FileDriver>,
    width: usize,
    url: &str,
) -> Result<(), String> {
    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
    printer.justify(JustifyMode::CENTER).map_err(|e| e.to_string())?;
    printer.bold(true).map_err(|e| e.to_string())?;
    printer.writeln(FEEDBACK_TITLE).map_err(|e| e.to_string())?;
    printer.bold(false).map_err(|e| e.to_string())?;
    printer.qrcode(url).map_err(|e| e.to_string())?;
    printer.writeln(FEEDBACK_CAPTION).map_err(|e| e.to_string())?;
    printer.justify(JustifyMode::LEFT).map_err(|e| e.to_string())?;
    Ok(())
}

/// The address to print, if any: a sale's, never a refund's, never blank.
fn feedback_url_of(receipt: &ReceiptData) -> Option<&str> {
    if receipt.kind == ReceiptKind::Refund {
        return None;
    }
    receipt.feedback_url.as_deref().map(str::trim).filter(|u| !u.is_empty())
}

// Characters per line for the two common thermal paper widths (Font A, ~12 dots
// wide): 58mm rolls fit 32, 80mm rolls fit 48. The cashier picks the roll size
// in Hardware settings; 58mm stays the default when nothing is stored.
const CHARS_58MM: usize = 32;
const CHARS_80MM: usize = 48;

pub(crate) fn chars_per_line(paper_width_mm: Option<u16>) -> usize {
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
pub(crate) const RECEIPT_PAGE_CODE: PageCode = PageCode::WPC1251;

pub(crate) fn money(cents: i64) -> String {
    format!("{:.2}", cents as f64 / 100.0)
}

/// Рядок 23: the rounding with its sign — НБУ № 25 rounds both ways.
fn signed_money(cents: i64) -> String {
    format!("{}{}", if cents < 0 { '-' } else { '+' }, money(cents.abs()))
}

pub(crate) fn divider(width: usize) -> String {
    "-".repeat(width)
}

pub(crate) fn two_col(width: usize, left: &str, right: &str) -> String {
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

/// The row under an item's name, without its amount: «2 x 45.90», or the
/// host's own text for a weighed line — «0.350 кг x 189.90».
fn quantity_row(item: &ReceiptItem) -> String {
    match item.quantity_text.as_deref().filter(|t| !t.trim().is_empty()) {
        Some(text) => text.to_string(),
        None => format!("{} x {}", item.quantity, money(item.unit_price_cents)),
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
        // Ours goes under the provider's text, never inside it: the fiscal
        // receipt is theirs line for line, and «Оцініть нас» is not part of
        // any receipt.
        if let Some(url) = feedback_url_of(receipt) {
            feedback_block(&mut printer, width, url)?;
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
        // Рядок 31 of Положення № 13: the return receipt is captioned
        // «ВИДАТКОВИЙ ЧЕК» — the regulation's name for it, not ours.
        printer
            .writeln(&format!("ВИДАТКОВИЙ ЧЕК {}", receipt.receipt_number))
            .map_err(|e| e.to_string())?;
        if let Some(origin) = &receipt.refund_of_receipt {
            printer
                .writeln(&format!("до чека {origin}"))
                .map_err(|e| e.to_string())?;
        }
    } else {
        let order = receipt
            .order_no
            .map(|n| n.to_string())
            .or_else(|| receipt.order_label.clone());
        if let Some(order) = order {
            // The number the barista calls out — big enough to read from the
            // pickup counter, above the receipt number nobody reads aloud.
            // The server's number, or the till's own «К17» while offline.
            printer.bold(true).map_err(|e| e.to_string())?;
            printer.size(2, 2).map_err(|e| e.to_string())?;
            printer
                .writeln(&format!("ЗАМОВЛЕННЯ {order}"))
                .map_err(|e| e.to_string())?;
            printer.reset_size().map_err(|e| e.to_string())?;
            printer.bold(false).map_err(|e| e.to_string())?;
        }
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
        let qty_line = two_col(width, &format!("  {}", quantity_row(item)), &amount);
        printer.writeln(&qty_line).map_err(|e| e.to_string())?;
        if let Some(note) = item.note.as_deref().filter(|n| !n.trim().is_empty()) {
            printer
                .writeln(&format!("  {note}"))
                .map_err(|e| e.to_string())?;
        }
    }

    printer.writeln(&divider(width)).map_err(|e| e.to_string())?;
    // Рядок 20 «СУМА», 21 «ПДВ», 24 «ДО СПЛАТИ» — the regulation's own words,
    // on a non-fiscal receipt as well: one layout, one set of tests.
    printer
        .writeln(&two_col(width, "СУМА", &money(receipt.subtotal_cents)))
        .map_err(|e| e.to_string())?;

    let discount = receipt.discount_cents.filter(|d| *d != 0);
    if let Some(discount) = discount {
        printer
            .writeln(&two_col(width, "Знижка", &format!("-{}", money(discount))))
            .map_err(|e| e.to_string())?;
    }

    // НБУ № 25 п. 5 wants the sum before rounding on the paper too. «СУМА»
    // here is before the discount, so with both a discount and a rounding the
    // sum between them is printed as «УСЬОГО» (рядок 20's other word).
    let rounding = receipt.rounding_cents.filter(|r| *r != 0);
    if rounding.is_some() && discount.is_some() {
        printer
            .writeln(&two_col(width, "УСЬОГО", &money(receipt.total_cents)))
            .map_err(|e| e.to_string())?;
    }

    for line in &receipt.vat_lines {
        printer
            .writeln(&two_col(width, &vat_label(line), &money(line.amount_cents)))
            .map_err(|e| e.to_string())?;
    }

    // Рядок 23, «після рядка 21» (Положення № 13 розд. II п. 9).
    if let Some(rounding) = rounding {
        printer
            .writeln(&two_col(width, "ЗАОКРУГЛЕННЯ", &signed_money(rounding)))
            .map_err(|e| e.to_string())?;
    }

    printer.bold(true).map_err(|e| e.to_string())?;
    let total_label = if receipt.kind == ReceiptKind::Refund {
        "ДО ПОВЕРНЕННЯ"
    } else {
        "ДО СПЛАТИ"
    };
    printer
        .writeln(&two_col(
            width,
            total_label,
            &money(receipt.total_cents + rounding.unwrap_or(0)),
        ))
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
        // (TechDocs/prro/checkbox/api/receipts-offline.md).
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
    // After the thanks, as the last thing on the paper: the guest who turns
    // the receipt over in their hand finds the QR, and the fiscal block above
    // stays exactly where the regulation reads it.
    if let Some(url) = feedback_url_of(receipt) {
        feedback_block(&mut printer, width, url)?;
    }
    printer.print_cut().map_err(|e| e.to_string())?;

    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&path);
    Ok(bytes)
}

/// A number no two jobs of this process share, for the temp file each one is
/// built in. The clock alone is not that: `SystemTime` ticks in microseconds
/// on macOS, so two jobs built in the same tick — which the test threads do —
/// got one name and truncated each other's bytes. The counter keeps them
/// apart; the clock keeps the names apart across restarts.
pub(crate) fn now_nanos() -> u128 {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    // The last three digits are always zero on a microsecond clock, so the
    // sequence fits in them without colliding with a later tick.
    nanos.saturating_add(u128::from(SEQ.fetch_add(1, Ordering::Relaxed) % 1000))
}

// `document-format` is handled very differently per platform by the `printers`
// crate: on Windows it is passed straight through as the Win32 print datatype
// (StartDocPrinterW only accepts registered types like "RAW"/"TEXT", so a MIME
// string makes the job fail outright), while on Unix it is a CUPS option and
// "application/vnd.cups-raw" is what stops CUPS from running our ESC/POS bytes
// through a text-to-PostScript filter. Pick the right value per OS.
#[cfg(windows)]
pub(crate) const RAW_JOB_PROPS: &[(&str, &str)] = &[("document-format", "RAW")];
#[cfg(not(windows))]
pub(crate) const RAW_JOB_PROPS: &[(&str, &str)] = &[("document-format", "application/vnd.cups-raw")];

/// Hand raw ESC/POS bytes to a named OS printer as one job. Shared by the
/// receipt and the kitchen ticket (`kitchen_ticket.rs`): the printer lookup,
/// the raw-format option and the error wording are the same for both.
pub(crate) fn send_raw(printer_name: &str, bytes: &[u8], job_name: &str) -> Result<(), String> {
    let target = printers::get_printer_by_name(printer_name)
        .ok_or_else(|| format!("Принтер \"{printer_name}\" не знайдено"))?;

    target
        .print(
            bytes,
            PrinterJobOptions {
                name: Some(job_name),
                raw_properties: RAW_JOB_PROPS,
                ..PrinterJobOptions::none()
            },
        )
        .map_err(|e| format!("{e:?}"))?;

    Ok(())
}

#[tauri::command]
pub fn print_receipt(
    printer_name: String,
    receipt: ReceiptData,
    paper_width_mm: Option<u16>,
) -> Result<(), String> {
    let bytes = build_ticket(&receipt, chars_per_line(paper_width_mm))?;
    send_raw(&printer_name, &bytes, "Чек")
}

#[cfg(test)]
pub(crate) mod test_util {
    pub(crate) fn win1251(s: &str) -> Vec<u8> {
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

    pub(crate) fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack.windows(needle.len()).any(|w| w == needle)
    }
}

#[cfg(test)]
mod tests {
    use super::test_util::{contains, win1251};
    use super::*;

    fn base() -> ReceiptData {
        ReceiptData {
            store_name: "Demo".into(),
            kind: ReceiptKind::Sale,
            receipt_number: "R-00001".into(),
            refund_of_receipt: None,
            order_no: None,
            created_at: "09.09.2026, 14:59:03".into(),
            staff_name: "Олена".into(),
            customer_name: None,
            items: vec![ReceiptItem {
                name: "Футболка".into(),
                variant_label: "M".into(),
                quantity: 1,
                unit_price_cents: 10000,
                line_total_cents: 10000,
                ..Default::default()
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

    const FEEDBACK: &str = "https://the-live.shop/m/shablya#feedback";

    fn after(bytes: &[u8], text: &str) -> usize {
        let needle = win1251(text);
        bytes.windows(needle.len()).position(|w| w == needle.as_slice()).unwrap()
    }

    #[test]
    fn a_sale_ends_with_the_feedback_qr_after_the_thanks() {
        let mut receipt = base();
        receipt.feedback_url = Some(FEEDBACK.into());
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251(FEEDBACK_TITLE)));
        assert!(contains(&bytes, &win1251(FEEDBACK_CAPTION)));
        // The address goes to the printer's own QR engine (GS ( k), as bytes.
        assert!(contains(&bytes, &[0x1D, 0x28, 0x6B]));
        assert!(contains(&bytes, FEEDBACK.as_bytes()));
        // Last on the paper: after «Дякуємо», which is after the cashier.
        assert!(after(&bytes, "Касир") < after(&bytes, "Дякуємо за покупку!"));
        assert!(after(&bytes, "Дякуємо за покупку!") < after(&bytes, FEEDBACK_TITLE));
    }

    #[test]
    fn the_feedback_qr_follows_the_fiscal_block_rather_than_breaking_it() {
        let mut receipt = base();
        receipt.fiscal = Some(fiscal());
        receipt.feedback_url = Some(FEEDBACK.into());
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(after(&bytes, "ФІСКАЛЬНИЙ ЧЕК") < after(&bytes, "cabinet.tax.gov.ua"));
        assert!(after(&bytes, "cabinet.tax.gov.ua") < after(&bytes, FEEDBACK_TITLE));
    }

    #[test]
    fn the_feedback_qr_goes_under_the_providers_own_text_too() {
        let mut receipt = base();
        receipt.provider_text = Some("=== ТЕСТОВИЙ ЧЕК ===\nСУМА 100.00 ГРН\n".into());
        receipt.feedback_url = Some(FEEDBACK.into());
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(after(&bytes, "СУМА 100.00 ГРН") < after(&bytes, FEEDBACK_TITLE));
        assert!(contains(&bytes, FEEDBACK.as_bytes()));
        // Still nothing of our layout but the QR block.
        assert!(!contains(&bytes, &win1251("Дякуємо за покупку!")));
    }

    #[test]
    fn a_refund_never_asks_to_be_rated() {
        let mut receipt = base();
        receipt.kind = ReceiptKind::Refund;
        receipt.refund_of_receipt = Some("R-00001".into());
        receipt.feedback_url = Some(FEEDBACK.into());
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(!contains(&bytes, &win1251(FEEDBACK_TITLE)));
        assert!(!contains(&bytes, &[0x1D, 0x28, 0x6B]));
        assert!(contains(&bytes, &win1251("Кошти повернуто")));
    }

    #[test]
    fn no_feedback_block_without_an_address_or_with_a_blank_one() {
        let bytes = build_ticket(&base(), CHARS_58MM).unwrap();
        assert!(!contains(&bytes, &win1251(FEEDBACK_TITLE)));
        assert!(!contains(&bytes, &[0x1D, 0x28, 0x6B]));
        let mut blank = base();
        blank.feedback_url = Some("   ".into());
        let bytes = build_ticket(&blank, CHARS_58MM).unwrap();
        assert!(!contains(&bytes, &win1251(FEEDBACK_TITLE)));
    }

    #[test]
    fn no_fiscal_block_for_a_non_fiscal_store() {
        let bytes = build_ticket(&base(), CHARS_58MM).unwrap();
        assert!(!contains(&bytes, &win1251("ФІСКАЛЬНИЙ ЧЕК")));
        assert!(!contains(&bytes, &win1251("ОНЛАЙН")));
        assert!(!contains(&bytes, &[0x1D, 0x28, 0x6B]));
    }

    #[test]
    fn order_number_prints_large_above_the_receipt_number() {
        let mut receipt = base();
        receipt.order_no = Some(42);
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        let order = bytes
            .windows(win1251("ЗАМОВЛЕННЯ 42").len())
            .position(|w| w == win1251("ЗАМОВЛЕННЯ 42").as_slice())
            .unwrap();
        let number = bytes
            .windows(win1251("Чек ").len())
            .position(|w| w == win1251("Чек ").as_slice())
            .unwrap();
        assert!(order < number);
        // Double size on, then back to normal before the receipt number.
        assert!(contains(&bytes[..number], &[0x1D, 0x21, 0x11]));
        assert!(contains(&bytes[order..number], &[0x1D, 0x21, 0x00]));
    }

    #[test]
    fn a_payload_without_an_order_number_still_parses_and_prints_none() {
        // A host built before the field, or any sale outside a café.
        let json = serde_json::json!({
            "store_name": "Demo",
            "receipt_number": "R-1",
            "created_at": "x",
            "staff_name": "y",
            "customer_name": null,
            "items": [],
            "subtotal_cents": 0,
            "discount_cents": null,
            "total_cents": 0,
            "payments": []
        });
        let receipt: ReceiptData = serde_json::from_value(json).unwrap();
        assert_eq!(receipt.order_no, None);
        assert_eq!(receipt.order_label, None);
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(!contains(&bytes, &win1251("ЗАМОВЛЕННЯ")));
    }

    #[test]
    fn the_tills_own_label_prints_large_when_there_is_no_server_number() {
        // A receipt printed while the sale is still in the outbox: «К1», in
        // the same place and size the server's number would take.
        let mut receipt = base();
        receipt.order_label = Some("К1".into());
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        let order = bytes
            .windows(win1251("ЗАМОВЛЕННЯ К1").len())
            .position(|w| w == win1251("ЗАМОВЛЕННЯ К1").as_slice())
            .unwrap();
        let number = bytes
            .windows(win1251("Чек ").len())
            .position(|w| w == win1251("Чек ").as_slice())
            .unwrap();
        assert!(order < number);
        assert!(contains(&bytes[..number], &[0x1D, 0x21, 0x11]));
    }

    #[test]
    fn the_server_number_wins_over_the_tills_label() {
        let mut receipt = base();
        receipt.order_no = Some(42);
        receipt.order_label = Some("К1".into());
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("ЗАМОВЛЕННЯ 42")));
        assert!(!contains(&bytes, &win1251("К1")));
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
    fn cash_rounding_prints_the_row_and_the_rounded_sum() {
        let mut receipt = base();
        receipt.items[0].unit_price_cents = 22123;
        receipt.items[0].line_total_cents = 22123;
        receipt.subtotal_cents = 22123;
        receipt.total_cents = 22123;
        receipt.rounding_cents = Some(-23);
        receipt.payments = vec![ReceiptPayment { method: "cash".into(), amount_cents: 50000 }];
        receipt.change_cents = Some(27900);
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("ЗАОКРУГЛЕННЯ")));
        // The sign goes through the printer's code page like every other «-»
        // on the ticket, so the digits are what can be matched byte for byte.
        assert_eq!(signed_money(-23), "-0.23");
        assert_eq!(signed_money(20), "+0.20");
        assert!(contains(&bytes, b"0.23"));
        assert!(contains(&bytes, b"221.00"));
        assert!(contains(&bytes, b"279.00"));
        // No discount: «СУМА» already is the sum before rounding.
        assert!(!contains(&bytes, &win1251("УСЬОГО")));
    }

    #[test]
    fn rounding_after_a_discount_also_prints_the_sum_before_it() {
        let mut receipt = base();
        receipt.subtotal_cents = 23400;
        receipt.discount_cents = Some(1277);
        receipt.total_cents = 22123;
        receipt.rounding_cents = Some(-23);
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("УСЬОГО")));
        assert!(contains(&bytes, b"221.23"));
        assert!(contains(&bytes, b"221.00"));
    }

    #[test]
    fn no_rounding_row_without_a_rounding() {
        let mut receipt = base();
        receipt.rounding_cents = Some(0);
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(!contains(&bytes, &win1251("ЗАОКРУГЛЕННЯ")));
        assert!(contains(&bytes, b"100.00"));
    }

    /// 0,350 кг of cheese at 189,90 ₴/кг, as `lib/receipt.ts` sends it: the
    /// quantity stays grams, the row and the mark come ready to print.
    fn cheese() -> ReceiptItem {
        ReceiptItem {
            name: "Сир твердий".into(),
            variant_label: "Гауда".into(),
            quantity: 350,
            unit_price_cents: 18990,
            line_total_cents: 6647,
            quantity_text: Some("0.350 кг x 189.90".into()),
            note: Some("вагу введено вручну".into()),
            ..Default::default()
        }
    }

    fn position(haystack: &[u8], text: &str) -> usize {
        let needle = win1251(text);
        haystack
            .windows(needle.len())
            .position(|w| w == needle.as_slice())
            .unwrap_or_else(|| panic!("«{text}» is not on the ticket"))
    }

    #[test]
    fn a_weighed_line_prints_kilograms_and_the_hand_typed_mark_under_it() {
        let mut receipt = base();
        receipt.items = vec![cheese()];
        receipt.subtotal_cents = 6647;
        receipt.total_cents = 6647;
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        // One row on a 58 mm roll: the weight at its price, the sum on the right.
        let row = two_col(CHARS_58MM, "  0.350 кг x 189.90", "66.47");
        assert!(contains(&bytes, &win1251(&row)));
        // The mark sits under its own line, before the totals.
        let at_row = position(&bytes, &row);
        let at_note = position(&bytes, "  вагу введено вручну");
        let at_sum = position(&bytes, "СУМА");
        assert!(at_row < at_note && at_note < at_sum);
        // Never the grams read as pieces.
        assert!(!contains(&bytes, b"350 x 189.90"));
    }

    #[test]
    fn a_weighed_line_keeps_its_rate_letter_and_comes_back_on_a_refund() {
        let mut receipt = base();
        receipt.kind = ReceiptKind::Refund;
        receipt.refund_of_receipt = Some("R-00001".into());
        receipt.items = vec![ReceiptItem { tax_symbol: Some("А".into()), ..cheese() }];
        receipt.subtotal_cents = 6647;
        receipt.total_cents = 6647;
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, &win1251("ВИДАТКОВИЙ ЧЕК")));
        let row = two_col(CHARS_58MM, "  0.350 кг x 189.90", "66.47 А");
        assert!(contains(&bytes, &win1251(&row)));
        assert!(contains(&bytes, &win1251("вагу введено вручну")));
    }

    #[test]
    fn the_host_payload_for_a_weighed_line_parses() {
        // Exactly what `buildReceiptPayload` puts on the wire for one weighing.
        let json = serde_json::json!({
            "name": "Сир твердий",
            "variant_label": "Гауда",
            "quantity": 350,
            "unit_price_cents": 18990,
            "line_total_cents": 6647,
            "tax_symbol": null,
            "quantity_text": "0.350 кг x 189.90",
            "note": "вагу введено вручну"
        });
        let item: ReceiptItem = serde_json::from_value(json).unwrap();
        assert_eq!(quantity_row(&item), "0.350 кг x 189.90");
        assert_eq!(item.note.as_deref(), Some("вагу введено вручну"));
    }

    #[test]
    fn a_line_without_the_weighed_fields_prints_as_it_always_did() {
        // A piece, or any line from a host built before weighed goods.
        let json = serde_json::json!({
            "name": "Футболка",
            "variant_label": "M",
            "quantity": 2,
            "unit_price_cents": 10000,
            "line_total_cents": 20000
        });
        let item: ReceiptItem = serde_json::from_value(json).unwrap();
        assert_eq!(quantity_row(&item), "2 x 100.00");
        assert_eq!(item.note, None);
        // A blank text is no text: the row falls back rather than print nothing.
        let blank = ReceiptItem { quantity_text: Some("  ".into()), ..item };
        assert_eq!(quantity_row(&blank), "2 x 100.00");

        let mut receipt = base();
        receipt.items[0].note = Some(" ".into());
        let bytes = build_ticket(&receipt, CHARS_58MM).unwrap();
        assert!(contains(&bytes, b"1 x 100.00"));
        assert!(!contains(&bytes, &win1251("вагу введено вручну")));
    }

    #[test]
    fn card_and_qr_are_cashless() {
        assert_eq!(payment_label("card"), "БЕЗГОТІВКОВА (картка)");
        assert_eq!(payment_label("qr"), "БЕЗГОТІВКОВА (QR)");
        assert_eq!(payment_label("cash"), "ГОТІВКА");
        assert_eq!(payment_label("bonus"), "ІНШЕ (bonus)");
    }
}
