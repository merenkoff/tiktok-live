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
}

fn no_update(current_version: &Version) -> UpdateInfo {
    UpdateInfo {
        current_version: current_version.to_string(),
        latest_version: None,
        update_available: false,
        download_url: None,
        release_url: None,
        notes: None,
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
    })
}
