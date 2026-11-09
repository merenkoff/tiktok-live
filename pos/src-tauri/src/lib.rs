// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

mod app_menu;
mod hardware;
mod legacy_profile;
mod module_remotes;
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
    let context: tauri::Context<tauri::Wry> = tauri::generate_context!();
    // Before Tauri touches the disk: every folder of the app is keyed by the
    // identifier, and a till that ran as `shop.cloth.pos` keeps its data only
    // if the old folders are copied under the new name first (2.8.0).
    legacy_profile::run_at_startup(&context.config().identifier);

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Only the Rust side ever touches the updater (see update.rs):
        // registering it here costs the window no `updater:*` permission.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Serves the on-disk cache of an online-only feature module so
        // `import('liveshopmodule://localhost/<id>/remote-entry.js')` resolves
        // inside our webview only (roadmap #13 Part B) — not a system scheme.
        .register_uri_scheme_protocol("liveshopmodule", module_remotes::protocol)
        .invoke_handler(tauri::generate_handler![
            hardware::list_hardware,
            hardware::os_printers::list_printers,
            hardware::receipt::print_receipt,
            hardware::kitchen_ticket::print_kitchen_ticket,
            hardware::precheck::print_precheck,
            hardware::slip::print_slip,
            hardware::encoding::print_encoding_test,
            update::check_for_update,
            update::install_update,
            module_remotes::sync_module_remote,
            module_remotes::prune_module_remotes,
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
        });

    // The macOS menu bar with «Про програму» filled in; Windows and Linux
    // have no menu (the kiosk window is undecorated).
    #[cfg(target_os = "macos")]
    let builder = builder.menu(app_menu::build);

    builder
        .run(context)
        .expect("error while running tauri application");
}
