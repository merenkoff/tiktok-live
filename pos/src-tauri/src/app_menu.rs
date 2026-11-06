// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

//! The macOS menu bar — Tauri's default one (app, Edit, Window) with the
//! «Про програму» panel filled in: name and version from the package,
//! copyright from `bundle.copyright`, and the developer, the sites and the
//! licence as the panel's credits (what the «Про програму» card shows in the
//! till; `pos/src/lib/about.ts` is the same text for the web). Only macOS has
//! a menu bar worth drawing: on Windows and Linux the kiosk window is
//! undecorated and Tauri adds no default menu there.
#![cfg(target_os = "macos")]

use tauri::menu::{AboutMetadataBuilder, Menu, MenuBuilder, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

/// Keep in step with `pos/src/lib/about.ts` (`ABOUT`) — one text, two homes.
const CREDITS: &str = "Розробник — ТОВ «Технології» (ЄДРПОУ 46288273)\n\
https://technologies.llc\n\
\n\
Сайт програми — https://the-live.shop\n\
\n\
Ліцензія — OwnNet Source License 1.1 (Source Available Edition)\n\
https://own-net.com\n\
\n\
Зв'язок — mer.sergei@gmail.com";

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg = app.package_info();
    let about = AboutMetadataBuilder::new()
        .name(Some(pkg.name.clone()))
        .version(Some(pkg.version.to_string()))
        .copyright(app.config().bundle.copyright.clone())
        .credits(Some(CREDITS.to_string()))
        .build();

    let app_menu = SubmenuBuilder::new(app, pkg.name.clone())
        .about_with_text(format!("Про {}", pkg.name), Some(about))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit_with_text(format!("Завершити {}", pkg.name))
        .build()?;
    // Cmd+C/V/X/Z reach the webview only through these predefined items.
    let edit = SubmenuBuilder::new(app, "Правка")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let window = SubmenuBuilder::new(app, "Вікно")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    MenuBuilder::new(app).items(&[&app_menu, &edit, &window]).build()
}
