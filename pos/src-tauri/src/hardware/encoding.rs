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
//!
//! One more mode overrides `ESC t` altogether: a printer sold for the Chinese
//! market (Xprinter XP-58IIH, among others) starts in its Chinese character
//! mode, where every PAIR of bytes from 0x80 up is one GB2312/GBK character and
//! no table is consulted — every Cyrillic word comes out as hieroglyphs, the same
//! on every row of a table sweep, while ASCII still prints. `ESC @` does not
//! leave that mode (it is the firmware's stored default), so `FS .` — «cancel
//! Kanji character mode» — follows it in every document we print. A printer
//! without such a mode ignores it.

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

/// The character tables we can encode text for: the three that hold the whole
/// Ukrainian alphabet or most of it (CP866 misses і/І/ґ/Ґ and is folded, see
/// `fold`).
///
/// The bytes are OURS (`high_half` below), not the escpos crate's: its tables
/// are wrong in three slots (Windows-1251 has an ASCII hyphen at 0xAD, CP1125
/// has «÷» and «±» where «·» and «√» are), and a character a table lacks it
/// sends as raw UTF-8 — two or three wrong symbols for one «ʼ». The crate
/// still sends `ESC @` and `ESC t`; every byte of text goes out through
/// `put_line`.
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

    /// Bytes 0x80..=0xFF of this table, in order (0x00..=0x7F is ASCII in all
    /// three). Written out from the code pages themselves; the test compares
    /// Windows-1251 and CP866 with `encoding_rs`.
    fn high_half(self) -> &'static [char; 128] {
        match self {
            EncodingTable::Windows1251 => &WINDOWS_1251_HIGH,
            EncodingTable::Cp866 => &CP866_HIGH,
            EncodingTable::Cp1125 => &CP1125_HIGH,
        }
    }

    /// The byte `c` is in this table, or None when the table lacks it.
    pub(crate) fn encode_char(self, c: char) -> Option<u8> {
        if c.is_ascii() {
            return Some(c as u8);
        }
        self.high_half().iter().position(|&t| t == c).map(|i| 0x80 + i as u8)
    }

    /// Text as this table can carry it: after this, every character is one
    /// byte of the table.
    ///
    ///   * a character the table has stays — so Windows-1251 text that worked
    ///     before profiles is untouched;
    ///   * one it lacks becomes the nearest thing it does have (`substitute`):
    ///     Ukrainian «і» reads as the Latin «i» it is drawn like, «ґ» as «г»,
    ///     the modifier-letter apostrophe «ʼ» a phone keyboard types as «'»,
    ///     «₴» as «грн»;
    ///   * anything else is «?» — one wrong symbol, never the two or three a
    ///     character's UTF-8 bytes would be;
    ///   * a soft hyphen is dropped (it is invisible on screen, a «-» or «¡» on
    ///     paper) and an ASCII control character becomes a space, so text an
    ///     owner typed can never carry a printer command.
    pub(crate) fn fold(self, text: &str) -> Cow<'_, str> {
        let keeps = |c: char| c != SOFT_HYPHEN && !c.is_ascii_control() && self.encode_char(c).is_some();
        if text.chars().all(keeps) {
            return Cow::Borrowed(text);
        }
        let mut out = String::with_capacity(text.len());
        for c in text.chars() {
            if keeps(c) {
                out.push(c);
            } else if c == SOFT_HYPHEN {
                // dropped
            } else if c.is_ascii_control() {
                out.push(' ');
            } else {
                match substitute(c) {
                    Some(s) if s.chars().all(|r| self.encode_char(r).is_some()) => out.push_str(s),
                    _ => out.push('?'),
                }
            }
        }
        Cow::Owned(out)
    }
}

const SOFT_HYPHEN: char = '\u{00AD}';

/// What a character is printed as on a table that lacks it. Used only for a
/// character the table does not have, so «і» stays «і» in Windows-1251.
fn substitute(c: char) -> Option<&'static str> {
    match c {
        'і' => Some("i"),
        'І' => Some("I"),
        'ґ' => Some("г"),
        'Ґ' => Some("Г"),
        '«' | '»' | '“' | '”' | '„' | '‟' => Some("\""),
        '’' | 'ʼ' | '‘' | '‚' | '′' | 'ʹ' => Some("'"),
        '—' | '–' | '‒' | '−' | '‑' => Some("-"),
        '\u{00A0}' | '\u{2009}' | '\u{202F}' | '\u{2007}' => Some(" "),
        '…' => Some("..."),
        '×' => Some("x"),
        '•' | '∙' => Some("*"),
        '№' => Some("N"),
        '₴' => Some("грн"),
        '€' => Some("EUR"),
        _ => None,
    }
}

/// Windows-1251, bytes 0x80..=0xFF. 0x98 is unassigned (`'\0'` never matches:
/// it is ASCII and handled before the table is read).
#[rustfmt::skip]
const WINDOWS_1251_HIGH: [char; 128] = [
    'Ђ', 'Ѓ', '‚', 'ѓ', '„', '…', '†', '‡', '€', '‰', 'Љ', '‹', 'Њ', 'Ќ', 'Ћ', 'Џ', // 0x80
    'ђ', '‘', '’', '“', '”', '•', '–', '—', '\0', '™', 'љ', '›', 'њ', 'ќ', 'ћ', 'џ', // 0x90
    '\u{00A0}', 'Ў', 'ў', 'Ј', '¤', 'Ґ', '¦', '§', 'Ё', '©', 'Є', '«', '¬', '\u{00AD}', '®', 'Ї', // 0xA0
    '°', '±', 'І', 'і', 'ґ', 'µ', '¶', '·', 'ё', '№', 'є', '»', 'ј', 'Ѕ', 'ѕ', 'ї', // 0xB0
    'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'Й', 'К', 'Л', 'М', 'Н', 'О', 'П', // 0xC0
    'Р', 'С', 'Т', 'У', 'Ф', 'Х', 'Ц', 'Ч', 'Ш', 'Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я', // 0xD0
    'а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и', 'й', 'к', 'л', 'м', 'н', 'о', 'п', // 0xE0
    'р', 'с', 'т', 'у', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ъ', 'ы', 'ь', 'э', 'ю', 'я', // 0xF0
];

/// CP866 (DOS Cyrillic), bytes 0x80..=0xFF.
#[rustfmt::skip]
const CP866_HIGH: [char; 128] = [
    'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'Й', 'К', 'Л', 'М', 'Н', 'О', 'П', // 0x80
    'Р', 'С', 'Т', 'У', 'Ф', 'Х', 'Ц', 'Ч', 'Ш', 'Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я', // 0x90
    'а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и', 'й', 'к', 'л', 'м', 'н', 'о', 'п', // 0xA0
    '░', '▒', '▓', '│', '┤', '╡', '╢', '╖', '╕', '╣', '║', '╗', '╝', '╜', '╛', '┐', // 0xB0
    '└', '┴', '┬', '├', '─', '┼', '╞', '╟', '╚', '╔', '╩', '╦', '╠', '═', '╬', '╧', // 0xC0
    '╨', '╤', '╥', '╙', '╘', '╒', '╓', '╫', '╪', '┘', '┌', '█', '▄', '▌', '▐', '▀', // 0xD0
    'р', 'с', 'т', 'у', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ъ', 'ы', 'ь', 'э', 'ю', 'я', // 0xE0
    'Ё', 'ё', 'Є', 'є', 'Ї', 'ї', 'Ў', 'ў', '°', '∙', '·', '√', '№', '¤', '■', '\u{00A0}', // 0xF0
];

/// CP1125 (RUSCII, the Ukrainian DOS table): CP866 except 0xF2..=0xF9, where
/// it carries Ґ ґ Є є І і Ї ї instead of Є є Ї ї Ў ў ° ∙.
#[rustfmt::skip]
const CP1125_HIGH: [char; 128] = [
    'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'Й', 'К', 'Л', 'М', 'Н', 'О', 'П', // 0x80
    'Р', 'С', 'Т', 'У', 'Ф', 'Х', 'Ц', 'Ч', 'Ш', 'Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я', // 0x90
    'а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и', 'й', 'к', 'л', 'м', 'н', 'о', 'п', // 0xA0
    '░', '▒', '▓', '│', '┤', '╡', '╢', '╖', '╕', '╣', '║', '╗', '╝', '╜', '╛', '┐', // 0xB0
    '└', '┴', '┬', '├', '─', '┼', '╞', '╟', '╚', '╔', '╩', '╦', '╠', '═', '╬', '╧', // 0xC0
    '╨', '╤', '╥', '╙', '╘', '╒', '╓', '╫', '╪', '┘', '┌', '█', '▄', '▌', '▐', '▀', // 0xD0
    'р', 'с', 'т', 'у', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ъ', 'ы', 'ь', 'э', 'ю', 'я', // 0xE0
    'Ё', 'ё', 'Ґ', 'ґ', 'Є', 'є', 'І', 'і', 'Ї', 'ї', '·', '√', '№', '¤', '■', '\u{00A0}', // 0xF0
];

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
///   * `init` — `ESC @`, the table's standard `ESC t`, `FS .` (out of a Chinese
///     printer's double-byte mode), then the profile's own number when it
///     differs;
///   * `writeln` — the text folded for the table and encoded by `put_line`.
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
        self.inner.custom(&CANCEL_KANJI)?;
        if let Some(n) = self.encoding.esc_t {
            self.inner.custom(&select_table(n))?;
        }
        Ok(&mut self.inner)
    }

    pub(crate) fn writeln(&mut self, text: &str) -> EscResult<&mut Printer<FileDriver>> {
        put_line(&mut self.inner, self.encoding.table, text)
    }
}

/// The bytes of `text` in `table`: one byte per character, folded first.
/// ASCII is itself in every table a printer has — which is also what keeps a
/// hyphen a hyphen (the escpos crate sent `-` as Windows-1251's 0xAD, «¡» on a
/// printer that stayed on CP437: every divider, «R-00001» and fiscal code).
pub(crate) fn encode_text(table: EncodingTable, text: &str) -> Vec<u8> {
    table
        .fold(text)
        .chars()
        .map(|c| table.encode_char(c).unwrap_or(b'?'))
        .collect()
}

/// One line of text and a line feed, in `table`.
fn put_line<'a>(
    printer: &'a mut Printer<FileDriver>,
    table: EncodingTable,
    text: &str,
) -> EscResult<&'a mut Printer<FileDriver>> {
    let bytes = encode_text(table, text);
    if !bytes.is_empty() {
        printer.custom(&bytes)?;
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

/// `FS .` — cancel Kanji (Chinese double-byte) character mode, so bytes from
/// 0x80 up are read one at a time through the `ESC t` table. See the module
/// header.
const CANCEL_KANJI: [u8; 2] = [0x1c, 0x2e];

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
    // Before anything else: on a printer in Chinese mode no row of the sheet
    // would differ from the next.
    printer.custom(&CANCEL_KANJI).map_err(e)?;
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
        let text = "Привіт, «Тест» ’ — ґ № M · вівсяне";
        assert!(matches!(EncodingTable::Windows1251.fold(text), Cow::Borrowed(_)));
    }

    #[test]
    fn the_tables_are_the_code_pages() {
        for (table, encoding) in [
            (EncodingTable::Windows1251, encoding_rs::WINDOWS_1251),
            (EncodingTable::Cp866, encoding_rs::IBM866),
        ] {
            for b in 0x80u8..=0xFF {
                let byte = [b];
                let (decoded, _, had_errors) = encoding.decode(&byte);
                let ours = table.high_half()[(b - 0x80) as usize];
                // WHATWG decodes Windows-1251's unassigned 0x98 as the C1 control U+0098.
                let unassigned = had_errors || decoded.chars().all(|c| c.is_control());
                if unassigned {
                    assert_eq!(ours, '\0', "{table:?} 0x{b:02X} is unassigned");
                } else {
                    assert_eq!(decoded.chars().next(), Some(ours), "{table:?} 0x{b:02X}");
                }
            }
        }
        // CP1125 is not in encoding_rs: CP866 everywhere but 0xF2..=0xF9.
        for b in 0x80u8..=0xFF {
            if !(0xF2..=0xF9).contains(&b) {
                let i = (b - 0x80) as usize;
                assert_eq!(CP1125_HIGH[i], CP866_HIGH[i], "CP1125 0x{b:02X}");
            }
        }
        let ukrainian: String = CP1125_HIGH[0x72..=0x79].iter().collect();
        assert_eq!(ukrainian, "ҐґЄєІіЇї");
        // Every character is in its table once, so a byte decodes back to it.
        for table in [EncodingTable::Windows1251, EncodingTable::Cp866, EncodingTable::Cp1125] {
            for (i, &c) in table.high_half().iter().enumerate() {
                if c != '\0' {
                    assert_eq!(table.encode_char(c), Some(0x80 + i as u8), "{table:?} {c}");
                }
            }
        }
    }

    #[test]
    fn the_slots_the_escpos_crate_had_wrong() {
        // Windows-1251 0xAD is the soft hyphen, never `-`.
        assert_eq!(EncodingTable::Windows1251.encode_char('-'), Some(b'-'));
        assert_eq!(EncodingTable::Windows1251.encode_char('\u{00AD}'), Some(0xAD));
        // CP1125 0xFA/0xFB are «·» and «√», not «÷» and «±».
        assert_eq!(EncodingTable::Cp1125.encode_char('·'), Some(0xFA));
        assert_eq!(EncodingTable::Cp1125.encode_char('√'), Some(0xFB));
        assert_eq!(EncodingTable::Cp1125.encode_char('÷'), None);
    }

    #[test]
    fn a_character_a_table_lacks_is_folded_or_a_question_mark_never_utf8() {
        // «ʼ» (U+02BC) is what a phone's Ukrainian keyboard types; Windows-1251
        // lacks it, and its UTF-8 bytes used to print «Мʼясо» as «МКјясо».
        assert_eq!(EncodingTable::Windows1251.fold("Мʼясо"), "М'ясо");
        assert_eq!(EncodingTable::Windows1251.fold("100 ₴"), "100 грн");
        assert_eq!(EncodingTable::Windows1251.fold("2×3 − 1"), "2x3 - 1");
        assert_eq!(EncodingTable::Windows1251.fold("Café 😀"), "Caf? ?");
        for table in [EncodingTable::Windows1251, EncodingTable::Cp866, EncodingTable::Cp1125] {
            let text = "Мʼясо 100 ₴ … × é 😀 «Тест» — ґ і M · вівсяне";
            let bytes = encode_text(table, text);
            assert_eq!(bytes.len(), table.fold(text).chars().count(), "{table:?}: one byte per character");
            assert!(table.fold(text).chars().all(|c| table.encode_char(c).is_some()), "{table:?}");
        }
        // «M · вівсяне», a modifier caption, keeps its dot in every table.
        assert!(contains(&encode_text(EncodingTable::Windows1251, "M · в"), &[b'M', b' ', 0xB7, b' ', 0xE2]));
        assert!(contains(&encode_text(EncodingTable::Cp866, "M · в"), &[b'M', b' ', 0xFA, b' ', 0xA2]));
        assert!(contains(&encode_text(EncodingTable::Cp1125, "M · в"), &[b'M', b' ', 0xFA, b' ', 0xA2]));
    }

    #[test]
    fn a_soft_hyphen_is_dropped_and_a_control_character_cannot_reach_the_printer() {
        assert_eq!(EncodingTable::Windows1251.fold("пере\u{00AD}нос"), "перенос");
        // ESC i (cut) typed into a product name prints as a space and an «i».
        assert_eq!(encode_text(EncodingTable::Windows1251, "a\u{1b}i\tb"), b"a i b".to_vec());
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

        // ESC @ ESC t 46 FS ., then the text in Windows-1251.
        let default = make(PrinterEncoding::default(), "d");
        assert!(default.starts_with(&[0x1b, 0x40, 0x1b, 0x74, 46, 0x1c, 0x2e]));
        assert!(!contains(&default[5..], &[0x1b, 0x74]));
        assert!(contains(&default, &[0xCF, 0xF0, 0xE8, 0xE2, 0xB3, 0xF2]));

        // The profile's number comes right after the standard one and wins.
        let own = make(PrinterEncoding { table: EncodingTable::Windows1251, esc_t: Some(73) }, "n");
        assert!(own.starts_with(&[0x1b, 0x40, 0x1b, 0x74, 46, 0x1c, 0x2e, 0x1b, 0x74, 73]));
        assert!(contains(&own, &[0xCF, 0xF0, 0xE8, 0xE2, 0xB3, 0xF2]));

        // CP866: its standard number, the text through the 866 table with «і» folded.
        let cp866 = make(PrinterEncoding { table: EncodingTable::Cp866, esc_t: None }, "c");
        assert!(cp866.starts_with(&[0x1b, 0x40, 0x1b, 0x74, 17, 0x1c, 0x2e]));
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
        // Out of a Chinese printer's double-byte mode before the first line.
        let cancel = sheet.windows(2).position(|w| w == CANCEL_KANJI).expect("FS .");
        let title = sheet.windows(13).position(|w| w == b"ENCODING TEST").unwrap();
        assert!(cancel < title);
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
