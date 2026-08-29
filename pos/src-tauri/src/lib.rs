// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

mod hardware;
mod update;

// WKWebView on macOS silently no-ops on the JS `window.print()` call (no
// native print delegate wired up), so the PDF-fallback print path routes
// through this command there instead — it drives the same print pipeline
// via AppKit. Windows/Linux keep using `window.print()` directly, where it
// works fine.
#[tauri::command]
fn print_webview(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            hardware::list_hardware,
            hardware::os_printers::list_printers,
            hardware::receipt::print_receipt,
            update::check_for_update,
            print_webview
        ])
        .setup(|_app| {
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    let _ = window.set_fullscreen(true);
                    let _ = window.set_decorations(false);
                    let _ = window.set_resizable(false);
                    let _ = window.set_closable(false);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
