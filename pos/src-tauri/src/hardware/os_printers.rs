use serde::Serialize;

#[derive(Serialize)]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn list_printers() -> Vec<PrinterInfo> {
    let default_name = printers::get_default_printer().map(|p| p.name);
    printers::get_printers()
        .into_iter()
        .map(|p| PrinterInfo {
            is_default: Some(&p.name) == default_name.as_ref(),
            name: p.name,
        })
        .collect()
}
