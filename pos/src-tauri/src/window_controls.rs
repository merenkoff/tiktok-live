// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

//! The three window buttons the login screen draws (TechDocs/POS_DESKTOP.md,
//! «Вікно каси»). A release build opens the till fullscreen, undecorated, not
//! resizable and not closable (`lib.rs`, the kiosk), so on Windows and Linux
//! there was no way out of it short of the task manager. These commands are
//! that way out, and only the host's login screen draws buttons for them.
//!
//! They are app commands, not `core:window:*` permissions, on purpose: the
//! window's capability set stays the one permission it is
//! (TechDocs/POS_MODULE_TAURI_CAPABILITIES.md §4). Like every app command they
//! are callable by a runtime-loaded module too; the worst one can do with them
//! is hide or close the till — the checklist answer is in §7 there.

use tauri::{AppHandle, WebviewWindow};

/// «Згорнути». A fullscreen window cannot be minimised on macOS (the system
/// refuses), so there the app hides itself, as Cmd+H does; the Dock icon brings
/// it back.
#[tauri::command]
pub fn window_minimize(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = window;
        app.hide().map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        window.minimize().map_err(|e| e.to_string())
    }
}

/// «На весь екран» / «У вікні». Leaving fullscreen gives an ordinary window
/// with the system's own frame — it can be moved, resized and closed like any
/// other; going back is the kiosk the till starts in.
#[tauri::command]
pub fn window_toggle_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    let fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    if fullscreen {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        window.set_decorations(true).map_err(|e| e.to_string())?;
        window.set_resizable(true).map_err(|e| e.to_string())?;
        window.set_closable(true).map_err(|e| e.to_string())?;
        window.maximize().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.unmaximize().map_err(|e| e.to_string())?;
        window.set_decorations(false).map_err(|e| e.to_string())?;
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
        Ok(true)
    }
}

/// Whether the window is fullscreen now — what the middle button's icon says.
#[tauri::command]
pub fn window_is_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    window.is_fullscreen().map_err(|e| e.to_string())
}

/// «Закрити». `set_closable(false)` stops the window from being closed, not
/// the app from exiting. Nothing is lost: the offline outbox lives in the
/// WebView's IndexedDB, and the login screen holds no session.
#[tauri::command]
pub fn window_close(app: AppHandle) {
    app.exit(0);
}
