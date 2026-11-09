// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

//! Which character table a thermal printer reads Cyrillic through.
//!
//! A receipt printer does not speak UTF-8: it has a handful of 256-character
//! tables inside and `ESC t n` says which one the following bytes are read
//! through. Two things have to agree for Cyrillic to come out right:
//!
//!   * the table the TEXT is encoded for here (`EncodingTable`), and
//!   * the number `n` the printer's firmware gives that table (`esc_t`).
//!
//! The numbers follow Epson's list (Windows-1251 is 46, CP866 is 17) and plenty
//! of 58 mm printers do not: they ignore a number they do not have and stay on
//! CP437, which turns every Cyrillic letter into a box-drawing or math symbol
//! («Привіт» -> «╧Σ╟╖╥»). Nothing in the byte stream can tell us that happened,
//! so the owner picks a profile by looking at a test sheet (`print_encoding_test`)
//! and the host remembers it per printer.
//!
//! The default profile is the one every release before this printed with —
//! Windows-1251 at its standard number — so a printer that worked still does.

use std::borrow::Cow;
use std::fs::OpenOptions;
use std::ops::{Deref, DerefMut};

use escpos::driver::FileDriver;
use escpos::errors::Result as EscResult;
use escpos::printer::Printer;
use escpos::printer_options::PrinterOptions;
use escpos::utils::{JustifyMode, PageCode, Protocol};
use serde::Deserialize;

use crate::hardware::receipt::{chars_per_line, divider, now_nanos, send_raw};

/// The character tables we can encode text for. Only these three: they are the
/// ones the escpos crate carries that hold the whole Ukrainian alphabet or most
/// of it (CP866 misses і/І/ґ/Ґ and is folded, see `fold`).
#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum EncodingTable {
    #[default]
    Windows1251,
    Cp866,
    Cp1125,
}

impl EncodingTable {
    pub(crate) fn page_code(self) -> PageCode {
        match self {
            EncodingTable::Windows1251 => PageCode::WPC1251,
            EncodingTable::Cp866 => PageCode::PC866,
            EncodingTable::Cp1125 => PageCode::PC1125,
        }
    }

    /// The `ESC t` number Epson's list gives this table — what `Printer::init`
    /// sends when no number is chosen.
    pub(crate) fn standard_number(self) -> u8 {
        u8::from(self.page_code())
    }

    /// Plain ASCII, for the test sheet's labels: a printer that is on the
    /// wrong table must still print the words that say which one this was.
    fn ascii_name(self) -> &'static str {
        match self {
            EncodingTable::Windows1251 => "WIN-1251",
            EncodingTable::Cp866 => "CP866",
            EncodingTable::Cp1125 => "CP1125",
        }
    }

    /// Text as this table can carry it. Windows-1251 holds everything we print,
    /// so it passes through untouched — exactly what it did before profiles.
    ///
    /// CP866 and CP1125 do not hold the letters or the punctuation below; the
    /// escpos crate would emit the raw UTF-8 bytes of such a character, which is
    /// two or three more wrong symbols, so each is replaced by the nearest
    /// thing the table does have. Ukrainian «і» reads as the Latin «i» it is
    /// drawn like, «ґ» as «г».
    pub(crate) fn fold(self, text: &str) -> Cow<'_, str> {
        let needs = |c: char| match self {
            EncodingTable::Windows1251 => false,
            EncodingTable::Cp866 => fold_char(c, true).is_some(),
            EncodingTable::Cp1125 => fold_char(c, false).is_some(),
        };
        if !text.chars().any(needs) {
            return Cow::Borrowed(text);
        }
        let mut out = String::with_capacity(text.len());
        for c in text.chars() {
            let folded = match self {
                EncodingTable::Windows1251 => None,
                EncodingTable::Cp866 => fold_char(c, true),
                EncodingTable::Cp1125 => fold_char(c, false),
            };
            match folded {
                Some(s) => out.push_str(s),
                None => out.push(c),
            }
        }
        Cow::Owned(out)
    }
}

/// What a character is printed as on a table that lacks it. `cp866` is the
/// narrower of the two tables: it also lacks the four Ukrainian letters.
fn fold_char(c: char, cp866: bool) -> Option<&'static str> {
    match c {
        'і' if cp866 => Some("i"),
        'І' if cp866 => Some("I"),
        'ґ' if cp866 => Some("г"),
        'Ґ' if cp866 => Some("Г"),
        '«' | '»' | '“' | '”' | '„' => Some("\""),
        '’' | 'ʼ' | '‘' => Some("'"),
        '—' | '–' | '‒' => Some("-"),
        '₴' => Some("грн"),
        _ => None,
    }
}

/// The profile a printer is driven with: the table the text is encoded for and,
/// when the printer numbers its tables differently from Epson, the number to
/// select it by.
#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct PrinterEncoding {
    #[serde(default)]
    pub table: EncodingTable,
    /// `ESC t n`. Absent = the table's standard number.
    #[serde(default)]
    pub esc_t: Option<u8>,
}

/// The escpos `Printer` for one document, with the profile applied. It derefs to
/// the plain `Printer`, so every style and layout call is untouched; only the
/// three that decide which BYTES go out are its own, and an inherent method
/// wins over a deref'd one:
///
///   * `init` — `ESC @`, the table's standard `ESC t`, then the profile's own
///     number when it differs;
///   * `write` / `writeln` — the text folded for the table first.
pub(crate) struct TextPrinter {
    inner: Printer<FileDriver>,
    encoding: PrinterEncoding,
}

impl TextPrinter {
    pub(crate) fn new(driver: FileDriver, encoding: &PrinterEncoding, width: usize) -> Self {
        let options = PrinterOptions::new(Some(encoding.table.page_code()), None, width as u8);
        TextPrinter {
            inner: Printer::new(driver, Protocol::default(), Some(options)),
            encoding: *encoding,
        }
    }

    pub(crate) fn init(&mut self) -> EscResult<&mut Printer<FileDriver>> {
        self.inner.init()?;
        if let Some(n) = self.encoding.esc_t {
            self.inner.custom(&select_table(n))?;
        }
        Ok(&mut self.inner)
    }

    pub(crate) fn writeln(&mut self, text: &str) -> EscResult<&mut Printer<FileDriver>> {
        put_line(&mut self.inner, self.encoding.table, text)
    }
}

/// One line of text and a line feed, in `table`.
///
/// Printable ASCII is sent as itself and never looked up: the escpos crate's
/// Windows-1251 table has an ASCII hyphen in the slot of 0xAD (Windows-1251's
/// soft hyphen), so `-` used to go out as 0xAD — a hyphen on a printer whose
/// table 1251 really is selected, `¡` on one that stayed on CP437, which is what
/// every divider, «R-00001» and fiscal code printed as there. ASCII is the same
/// byte in every table a printer has, so nothing needs the table for it.
/// Everything else (the Cyrillic) goes through the table, folded first.
fn put_line<'a>(
    printer: &'a mut Printer<FileDriver>,
    table: EncodingTable,
    text: &str,
) -> EscResult<&'a mut Printer<FileDriver>> {
    let folded = table.fold(text);
    let mut ascii: Vec<u8> = Vec::new();
    let mut other = String::new();
    for c in folded.chars() {
        if c.is_ascii() && !c.is_ascii_control() {
            if !other.is_empty() {
                printer.write(&other)?;
                other.clear();
            }
            ascii.push(c as u8);
        } else {
            if !ascii.is_empty() {
                printer.custom(&ascii)?;
                ascii.clear();
            }
            other.push(c);
        }
    }
    if !ascii.is_empty() {
        printer.custom(&ascii)?;
    }
    if !other.is_empty() {
        printer.write(&other)?;
    }
    printer.feed()
}

impl Deref for TextPrinter {
    type Target = Printer<FileDriver>;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl DerefMut for TextPrinter {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.inner
    }
}

/// `ESC t n` — select character code table.
fn select_table(n: u8) -> [u8; 3] {
    [0x1b, 0x74, n]
}

// ── The test sheet ─────────────────────────────────────────────────────────

/// One profile to try on the test sheet.
#[derive(Deserialize, Debug, Default)]
pub struct EncodingCandidate {
    #[serde(default)]
    pub table: EncodingTable,
    #[serde(default)]
    pub esc_t: Option<u8>,
    /// A short tag («A») the owner matches against the choice on screen. ASCII
    /// only — see `ascii_label`.
    #[serde(default)]
    pub label: Option<String>,
}

/// Every Ukrainian-specific letter, lower and upper case, in words a person
/// recognises at a glance: «Привіт! Їжак, єнот, ґанок».
const SAMPLE_LOWER: &str = "Привіт! Їжак, єнот, ґанок";
const SAMPLE_UPPER: &str = "ПРИВІТ! ЇЖАК, ЄНОТ, ҐАНОК";
/// The same in a line short enough to carry a table number in front of it.
const SAMPLE_COMPACT: &str = "Привіт їєґ ПРИВІТ ЇЄҐ";

/// Beyond this many candidates the sheet is a column of one-line rows instead
/// of a block each: a sweep over the printer's table numbers is 80 rows, not 80
/// blocks of four.
const DETAILED_UP_TO: usize = 8;
/// `ESC t` takes one byte, so 256 numbers is every table a printer can have.
const MAX_CANDIDATES: usize = 256;

fn ascii_label(label: &str) -> String {
    label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect()
}

fn build_test_sheet(candidates: &[EncodingCandidate], width: usize) -> Result<Vec<u8>, String> {
    if candidates.is_empty() {
        return Err("Немає варіантів кодування для друку.".into());
    }
    if candidates.len() > MAX_CANDIDATES {
        return Err(format!("Забагато варіантів: {} (не більше {MAX_CANDIDATES}).", candidates.len()));
    }

    let dir = std::env::temp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("pos-encoding-test-{}.bin", now_nanos()));

    let mut open_opts = OpenOptions::new();
    open_opts.read(true).write(true).create(true).truncate(true);
    let driver = FileDriver::open_with_options(&path, &open_opts).map_err(|e| e.to_string())?;
    let mut printer = Printer::new(driver, Protocol::default(), Some(PrinterOptions::default()));
    let e = |err: escpos::errors::PrinterError| err.to_string();

    printer.init().map_err(e)?;
    printer.justify(JustifyMode::LEFT).map_err(e)?;
    // ASCII on purpose: the sheet is read on a printer that may be on the wrong
    // table, and these two lines must survive that.
    let first = candidates[0].table;
    put_line(&mut printer, first, "ENCODING TEST").map_err(e)?;
    put_line(&mut printer, first, "Find the line that reads right").map_err(e)?;
    put_line(&mut printer, first, &divider(width)).map_err(e)?;

    let detailed = candidates.len() <= DETAILED_UP_TO;
    for candidate in candidates {
        let number = candidate.esc_t.unwrap_or_else(|| candidate.table.standard_number());
        // Switches the table the text is ENCODED for (and sends its standard
        // `ESC t`); the profile's own number, when it differs, follows.
        printer.page_code(candidate.table.page_code()).map_err(e)?;
        if candidate.esc_t.is_some() {
            printer.custom(&select_table(number)).map_err(e)?;
        }
        if detailed {
            let tag = candidate.label.as_deref().map(ascii_label).filter(|t| !t.is_empty());
            let head = match tag {
                Some(tag) => format!("[{tag}] {} ESC t {number}", candidate.table.ascii_name()),
                None => format!("{} ESC t {number}", candidate.table.ascii_name()),
            };
            printer.bold(true).map_err(e)?;
            put_line(&mut printer, candidate.table, &head).map_err(e)?;
            printer.bold(false).map_err(e)?;
            put_line(&mut printer, candidate.table, SAMPLE_LOWER).map_err(e)?;
            put_line(&mut printer, candidate.table, SAMPLE_UPPER).map_err(e)?;
            put_line(&mut printer, candidate.table, &divider(width)).map_err(e)?;
        } else {
            let row = format!("{number}: {SAMPLE_COMPACT}");
            put_line(&mut printer, candidate.table, &row).map_err(e)?;
        }
    }

    printer.feed().map_err(e)?;
    printer.print_cut().map_err(e)?;
    let bytes = std::fs::read(&path).map_err(|err| err.to_string())?;
    let _ = std::fs::remove_file(&path);
    Ok(bytes)
}

/// Prints the encoding test sheet: every candidate profile, each in its own
/// table, so the owner can read off which one their printer understands. The
/// host sends the candidates (a few standard ones, or a sweep over `ESC t`
/// numbers for one table) — this command only prints what it is given.
#[tauri::command]
pub fn print_encoding_test(
    printer_name: String,
    paper_width_mm: Option<u16>,
    candidates: Vec<EncodingCandidate>,
) -> Result<(), String> {
    let bytes = build_test_sheet(&candidates, chars_per_line(paper_width_mm))?;
    send_raw(&printer_name, &bytes, "Тест кодування")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(table: EncodingTable, esc_t: Option<u8>) -> EncodingCandidate {
        EncodingCandidate { table, esc_t, label: None }
    }

    fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack.windows(needle.len()).any(|w| w == needle)
    }

    #[test]
    fn the_standard_numbers_are_epsons() {
        // The numbers the host's picker shows next to each table.
        assert_eq!(EncodingTable::Windows1251.standard_number(), 46);
        assert_eq!(EncodingTable::Cp866.standard_number(), 17);
        assert_eq!(EncodingTable::Cp1125.standard_number(), 44);
    }

    #[test]
    fn the_default_profile_is_what_every_release_before_printed_with() {
        let d = PrinterEncoding::default();
        assert_eq!(d.table, EncodingTable::Windows1251);
        assert_eq!(d.esc_t, None);
    }

    #[test]
    fn a_profile_deserializes_from_what_the_host_sends() {
        let p: PrinterEncoding = serde_json::from_str(r#"{"table":"cp866","esc_t":73}"#).unwrap();
        assert_eq!(p, PrinterEncoding { table: EncodingTable::Cp866, esc_t: Some(73) });
        let p: PrinterEncoding = serde_json::from_str(r#"{"table":"windows1251","esc_t":null}"#).unwrap();
        assert_eq!(p, PrinterEncoding::default());
        let p: PrinterEncoding = serde_json::from_str(r#"{"table":"cp1125"}"#).unwrap();
        assert_eq!(p.table, EncodingTable::Cp1125);
        // A number a printer cannot have is refused rather than wrapped.
        assert!(serde_json::from_str::<PrinterEncoding>(r#"{"esc_t":300}"#).is_err());
        assert!(serde_json::from_str::<PrinterEncoding>(r#"{"table":"koi8"}"#).is_err());
    }

    #[test]
    fn windows_1251_text_is_passed_through_untouched() {
        let text = "Привіт, «Тест» ’ — ₴ ґ";
        assert!(matches!(EncodingTable::Windows1251.fold(text), Cow::Borrowed(_)));
    }

    #[test]
    fn cp866_folds_the_four_letters_it_lacks_and_the_punctuation() {
        // «і» -> Latin i, «І» -> Latin I, «Ґ» -> Cyrillic «Г» (written as escapes so
        // the look-alike letters cannot be mixed up in this file).
        assert_eq!(
            EncodingTable::Cp866.fold("Привіт, Ґанок і Інна"),
            "Прив\u{69}т, \u{413}анок \u{69} \u{49}нна"
        );
        assert_eq!(EncodingTable::Cp866.fold("«Тест» — м’ята"), "\"Тест\" - м'ята");
        assert_eq!(EncodingTable::Cp866.fold("100 ₴"), "100 грн");
        // Letters 866 does have are left alone.
        assert_eq!(EncodingTable::Cp866.fold("Їжак єнот ёж"), "Їжак єнот ёж");
        assert!(matches!(EncodingTable::Cp866.fold("plain ASCII 123"), Cow::Borrowed(_)));
    }

    #[test]
    fn cp1125_keeps_all_the_ukrainian_letters_but_folds_punctuation() {
        assert_eq!(EncodingTable::Cp1125.fold("Привіт Ґанок"), "Привіт Ґанок");
        assert_eq!(EncodingTable::Cp1125.fold("«Тест»"), "\"Тест\"");
    }

    /// All printable ASCII, in the order of the table of characters.
    fn printable_ascii() -> String {
        (0x20u8..=0x7e).map(|b| b as char).collect()
    }

    fn bytes_of(encoding: PrinterEncoding, text: &str) -> Vec<u8> {
        let path = std::env::temp_dir().join(format!("pos-enc-ascii-{}.bin", now_nanos()));
        let mut o = OpenOptions::new();
        o.read(true).write(true).create(true).truncate(true);
        let driver = FileDriver::open_with_options(&path, &o).unwrap();
        let mut p = TextPrinter::new(driver, &encoding, 32);
        p.init().unwrap();
        p.writeln(text).unwrap();
        p.print_cut().unwrap();
        let bytes = std::fs::read(&path).unwrap();
        let _ = std::fs::remove_file(&path);
        bytes
    }

    #[test]
    fn ascii_is_sent_as_itself_in_every_table() {
        // The escpos crate's Windows-1251 table maps '-' to 0xAD; none of this
        // may depend on a table.
        let ascii = printable_ascii();
        for table in [EncodingTable::Windows1251, EncodingTable::Cp866, EncodingTable::Cp1125] {
            let bytes = bytes_of(PrinterEncoding { table, esc_t: None }, &ascii);
            assert!(contains(&bytes, ascii.as_bytes()), "{table:?}");
        }
        // And the thing that actually went wrong: a divider and a receipt number.
        let bytes = bytes_of(PrinterEncoding::default(), "R-00001 -------- Привіт");
        assert!(contains(&bytes, b"R-00001 -------- "));
        assert!(!bytes.contains(&0xAD), "no soft hyphen on the wire");
    }

    #[test]
    fn ascii_and_cyrillic_keep_their_order_within_a_line() {
        let bytes = bytes_of(PrinterEncoding::default(), "a-б-в");
        assert!(contains(&bytes, &[b'a', b'-', 0xE1, b'-', 0xE2]));
    }

    #[test]
    fn an_explicit_number_follows_init_and_the_default_adds_nothing() {
        let dir = std::env::temp_dir();
        let make = |encoding: PrinterEncoding, tag: &str| {
            let path = dir.join(format!("pos-enc-unit-{tag}-{}.bin", now_nanos()));
            let mut o = OpenOptions::new();
            o.read(true).write(true).create(true).truncate(true);
            let driver = FileDriver::open_with_options(&path, &o).unwrap();
            let mut p = TextPrinter::new(driver, &encoding, 32);
            p.init().unwrap();
            p.writeln("Привіт").unwrap();
            p.print_cut().unwrap();
            let bytes = std::fs::read(&path).unwrap();
            let _ = std::fs::remove_file(&path);
            bytes
        };

        // ESC @ ESC t 46, then the text in Windows-1251.
        let default = make(PrinterEncoding::default(), "d");
        assert!(default.starts_with(&[0x1b, 0x40, 0x1b, 0x74, 46]));
        assert!(!contains(&default[5..], &[0x1b, 0x74]));
        assert!(contains(&default, &[0xCF, 0xF0, 0xE8, 0xE2, 0xB3, 0xF2]));

        // The profile's number comes right after the standard one and wins.
        let own = make(PrinterEncoding { table: EncodingTable::Windows1251, esc_t: Some(73) }, "n");
        assert!(own.starts_with(&[0x1b, 0x40, 0x1b, 0x74, 46, 0x1b, 0x74, 73]));
        assert!(contains(&own, &[0xCF, 0xF0, 0xE8, 0xE2, 0xB3, 0xF2]));

        // CP866: its standard number, the text through the 866 table with «і» folded.
        let cp866 = make(PrinterEncoding { table: EncodingTable::Cp866, esc_t: None }, "c");
        assert!(cp866.starts_with(&[0x1b, 0x40, 0x1b, 0x74, 17]));
        // П р и в i т in CP866 (Cyrillic at 0x80..) with a Latin «i».
        assert!(contains(&cp866, &[0x8F, 0xE0, 0xA8, 0xA2, b'i', 0xE2]));
    }

    #[test]
    fn the_test_sheet_labels_each_profile_in_ascii_and_switches_the_table_before_its_text() {
        let sheet = build_test_sheet(
            &[
                EncodingCandidate { table: EncodingTable::Windows1251, esc_t: None, label: Some("A".into()) },
                EncodingCandidate { table: EncodingTable::Cp866, esc_t: Some(7), label: Some("B ж".into()) },
            ],
            32,
        )
        .unwrap();
        assert!(contains(&sheet, b"ENCODING TEST"));
        assert!(contains(&sheet, b"[A] WIN-1251 ESC t 46"));
        // The label keeps only ASCII letters and digits: «B ж» -> «B».
        assert!(contains(&sheet, b"[B] CP866 ESC t 7"));
        // Candidate B: its standard ESC t 17, then the override ESC t 7, then its text.
        assert!(contains(&sheet, &[0x1b, 0x74, 17, 0x1b, 0x74, 7]));
        // Candidate A's text is Windows-1251 («П» is 0xCF), B's is CP866 («П» is 0x8F).
        assert!(contains(&sheet, &[0xCF, 0xF0, 0xE8, 0xE2]));
        assert!(contains(&sheet, &[0x8F, 0xE0, 0xA8, 0xA2]));
    }

    #[test]
    fn a_long_list_is_one_line_per_number() {
        let sweep: Vec<EncodingCandidate> = (0..=80u8).map(|n| candidate(EncodingTable::Windows1251, Some(n))).collect();
        let sheet = build_test_sheet(&sweep, 32).unwrap();
        // Each row is the table's standard `ESC t 46`, then its own number.
        for n in [0u8, 17, 46, 73, 80] {
            assert!(contains(&sheet, &[0x1b, 0x74, 46, 0x1b, 0x74, n]), "ESC t {n}");
            assert!(contains(&sheet, format!("{n}: ").as_bytes()), "row for {n}");
        }
        // No block headers in the compact form.
        assert!(!contains(&sheet, b"WIN-1251 ESC t"));
    }

    #[test]
    fn an_empty_or_oversized_sheet_is_refused() {
        assert!(build_test_sheet(&[], 32).is_err());
        let too_many: Vec<EncodingCandidate> =
            (0..=MAX_CANDIDATES).map(|_| candidate(EncodingTable::Cp866, None)).collect();
        assert!(build_test_sheet(&too_many, 32).is_err());
        let exactly: Vec<EncodingCandidate> =
            (0..MAX_CANDIDATES).map(|_| candidate(EncodingTable::Cp866, None)).collect();
        assert!(build_test_sheet(&exactly, 32).is_ok());
    }
}
