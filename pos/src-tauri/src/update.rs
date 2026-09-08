// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

use semver::Version;
use serde::{Deserialize, Serialize};

const RELEASES_LATEST_URL: &str =
    "https://api.github.com/repos/merenkoff/tiktok-live/releases/latest";
const TAG_PREFIX: &str = "pos-v";

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    assets: Vec<GhAsset>,
}

#[derive(Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub download_url: Option<String>,
    pub release_url: Option<String>,
    pub notes: Option<String>,
    /// Whether `install_update` can do the whole thing in place on this
    /// install, i.e. whether the UI offers a button instead of a download
    /// link. False does not mean "no update" — it means "update by hand".
    pub can_self_update: bool,
}

fn no_update(current_version: &Version) -> UpdateInfo {
    UpdateInfo {
        current_version: current_version.to_string(),
        latest_version: None,
        update_available: false,
        download_url: None,
        release_url: None,
        notes: None,
        can_self_update: self_update_supported(),
    }
}

/// Tauri's updater replaces the running bundle in place, and only knows how to
/// do that for two of the five artifacts `pos-release.yml` builds:
///
///   * macOS — swaps the `.app` for the one inside `.app.tar.gz`. Needs the
///     bundle to be writable by the user running it: a `sudo`-installed copy is
///     root-owned and the updater cannot elevate, so probe before offering it.
///   * Linux — AppImage only, rewritten in place. `APPIMAGE` is set by the
///     runtime, so its absence means this is the deb/rpm install instead.
///
/// Windows is deliberately out: the NSIS path wants a code-signed installer,
/// which this build does not have yet. Those installs keep the download link.
fn self_update_supported() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("APPIMAGE").is_some()
    }

    #[cfg(target_os = "macos")]
    {
        // Opening Info.plist for writing touches nothing (no truncate) but
        // fails with PermissionDenied on a root-owned bundle — exactly the
        // case where the update would die halfway through.
        let Ok(exe) = std::env::current_exe() else {
            return false;
        };
        // …/Cloth POS.app/Contents/MacOS/cloth-pos -> …/Cloth POS.app/Contents
        let Some(contents) = exe.parent().and_then(|p| p.parent()) else {
            return false;
        };
        std::fs::OpenOptions::new()
            .write(true)
            .open(contents.join("Info.plist"))
            .is_ok()
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        false
    }
}

/// Picks the installer matching this OS from the release assets. Matches the
/// same per-platform filename convention as the marketing site's download
/// cards (public/app.js's initDownloadOsDetect) and what `pos-release.yml`
/// actually produces (Cloth.POS_*-setup.exe / *.dmg / *.AppImage / *.deb / *.rpm).
fn pick_asset(assets: &[GhAsset]) -> Option<String> {
    let pattern: &str = match std::env::consts::OS {
        "windows" => "-setup.exe",
        "macos" => ".dmg",
        "linux" => ".AppImage",
        _ => return None,
    };
    assets
        .iter()
        .find(|a| a.name.ends_with(pattern))
        .map(|a| a.browser_download_url.clone())
}

#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.clone();

    let client = match reqwest::Client::builder()
        .user_agent(format!("cloth-pos/{current_version}"))
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(client) => client,
        Err(_) => return Ok(no_update(&current_version)),
    };

    let response = match client.get(RELEASES_LATEST_URL).send().await {
        Ok(response) if response.status().is_success() => response,
        _ => return Ok(no_update(&current_version)),
    };

    let release: GhRelease = match response.json().await {
        Ok(release) => release,
        Err(_) => return Ok(no_update(&current_version)),
    };

    let Some(version_str) = release.tag_name.strip_prefix(TAG_PREFIX) else {
        return Ok(no_update(&current_version));
    };
    let Ok(latest_version) = Version::parse(version_str) else {
        return Ok(no_update(&current_version));
    };

    if latest_version <= current_version {
        return Ok(no_update(&current_version));
    }

    Ok(UpdateInfo {
        current_version: current_version.to_string(),
        latest_version: Some(latest_version.to_string()),
        update_available: true,
        download_url: pick_asset(&release.assets),
        release_url: Some(release.html_url),
        notes: release.body,
        can_self_update: self_update_supported(),
    })
}

/// Downloads and installs the update, then restarts into it.
///
/// Everything happens here rather than through `@tauri-apps/plugin-updater` on
/// purpose: the JS plugin would need `updater:default` + `process:allow-restart`
/// on the window, and any runtime-loaded module shares that window. As an app
/// command the reach is the same either way (app commands are not ACL-gated),
/// but the blast radius stays "trigger the real update" instead of "the generic
/// updater and restart APIs" — see TechDocs/POS_MODULE_TAURI_CAPABILITIES.md.
///
/// The update itself is only as trustworthy as its signature: the plugin checks
/// the release manifest against the Ed25519 public key baked into this binary
/// (`plugins.updater.pubkey`), against an endpoint that is also baked in, so
/// neither a module nor a hijacked release page can point it elsewhere.
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    if !self_update_supported() {
        return Err("Ця збірка оновлюється вручну — завантажте нову версію зі сторінки релізу.".into());
    }

    let update = app
        .updater()
        .map_err(|e| format!("Оновлювач недоступний: {e}"))?
        .check()
        .await
        .map_err(|e| format!("Не вдалося перевірити оновлення: {e}"))?;

    let Some(update) = update else {
        return Err("Оновлень немає — встановлена версія вже актуальна.".into());
    };

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("Не вдалося встановити оновлення: {e}"))?;

    app.restart();
}
