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
        // …/LiveShop POS.app/Contents/MacOS/liveshop-pos -> …/LiveShop POS.app/Contents
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
/// actually produces (LiveShop.POS_*-setup.exe / *.dmg / *.AppImage / *.deb / *.rpm).
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
        .user_agent(format!("liveshop-pos/{current_version}"))
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

/// The header the feed reads the deployment's delivery token from — the other
/// half is `src/pos/license/updateGate.ts`. Lower-case, as `http` stores names.
const UPDATE_TOKEN_HEADER: &str = "x-delivery-token";

/// Longest token the backend keeps (`moduleToken.ts` accepts 20..=600 of these
/// characters from the author's server); the real ones are 55 characters.
const UPDATE_TOKEN_MIN: usize = 20;
const UPDATE_TOKEN_MAX: usize = 600;

/// The token the webview handed over, if it is shaped like one.
///
/// The argument comes from JavaScript, and any script in the window can call
/// this command (app commands are not ACL-gated), so it is checked rather than
/// trusted: only `[A-Za-z0-9._-]`, so it can be nothing but a header value —
/// no whitespace, no control characters, nothing that could split a request.
/// A token that fails is treated as none, never as an error: an unlicensed copy
/// asks the feed without one (which, while the gate is off, is simply what it
/// has always done) and a garbled token must not be what stops an update.
fn clean_update_token(raw: Option<String>) -> Option<String> {
    let token = raw?;
    let token = token.trim();
    let well_formed = (UPDATE_TOKEN_MIN..=UPDATE_TOKEN_MAX).contains(&token.len())
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'));
    well_formed.then(|| token.to_string())
}

/// Downloads and installs the update, then restarts into it.
///
/// `update_token` is the deployment's delivery token (`GET /api/pos/license/update-token`,
/// fetched by the webview at the moment of the press — TechDocs/POS_LICENSING.md
/// 2D-B). It goes to the update feed in an `X-Delivery-Token` header so the
/// author's feed can tell which deployment is asking when `LICENSE_UPDATE_GATE`
/// is on. It is NOT the licence key, which never leaves the server.
///
/// Everything happens here rather than through `@tauri-apps/plugin-updater` on
/// purpose: the JS plugin would need `updater:default` + `process:allow-restart`
/// on the window, and any runtime-loaded module shares that window. As an app
/// command the reach is the same either way (app commands are not ACL-gated),
/// but the blast radius stays "trigger the real update" instead of "the generic
/// updater and restart APIs" — see TechDocs/POS_MODULE_TAURI_CAPABILITIES.md.
/// (For 2D-B that is also why the header is added here, in Rust, and not by
/// switching to the plugin's JS `check({ headers })`.)
///
/// The update itself is only as trustworthy as its signature: the plugin checks
/// the release manifest against the Ed25519 public key baked into this binary
/// (`plugins.updater.pubkey`), against an endpoint that is also baked in, so
/// neither a module nor a hijacked release page can point it elsewhere — and the
/// token can only ever be sent to that endpoint.
#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    update_token: Option<String>,
) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    if !self_update_supported() {
        return Err("Ця збірка оновлюється вручну — завантажте нову версію зі сторінки релізу.".into());
    }

    let mut builder = app.updater_builder();
    if let Some(token) = clean_update_token(update_token) {
        builder = builder
            .header(UPDATE_TOKEN_HEADER, token)
            .map_err(|e| format!("Оновлювач недоступний: {e}"))?;
    }
    let updater = builder
        .build()
        .map_err(|e| format!("Оновлювач недоступний: {e}"))?;

    let mut update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return Err("Оновлень немає — встановлена версія вже актуальна.".into()),
        // The plugin hides the status code: a refusal (403 — the feed did not
        // recognise this copy's licence) and a feed that is down (502) both end
        // here. Say both, and what to do, instead of the plugin's English.
        Err(tauri_plugin_updater::Error::ReleaseNotFound) => {
            return Err(
                "Сервер оновлень не віддав нову версію: він недоступний або не підтвердив ліцензію цієї копії. \
                 Спробуйте пізніше або завантажте нову версію зі сторінки релізу вручну."
                    .into(),
            )
        }
        Err(e) => return Err(format!("Не вдалося перевірити оновлення: {e}")),
    };

    // The plugin sends the check's headers to the artifact's URL too, and that
    // one is GitHub's, not ours: the token is for the feed and stays there.
    update.headers.remove(UPDATE_TOKEN_HEADER);

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("Не вдалося встановити оновлення: {e}"))?;

    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL_SHAPE: &str = "v1.q83vEjRWeJq83vEjRWeJqwNd5g7O.AbCdEfGhIjKlMnOpQrStUv";

    #[test]
    fn a_token_shaped_like_the_backends_passes_untouched() {
        assert_eq!(clean_update_token(Some(REAL_SHAPE.into())), Some(REAL_SHAPE.into()));
    }

    #[test]
    fn surrounding_whitespace_is_dropped() {
        assert_eq!(clean_update_token(Some(format!("  {REAL_SHAPE}\n"))), Some(REAL_SHAPE.into()));
    }

    #[test]
    fn nothing_and_empty_are_none() {
        assert_eq!(clean_update_token(None), None);
        assert_eq!(clean_update_token(Some(String::new())), None);
        assert_eq!(clean_update_token(Some("   ".into())), None);
    }

    #[test]
    fn too_short_or_too_long_is_none() {
        assert_eq!(clean_update_token(Some("v1.short".into())), None);
        assert_eq!(clean_update_token(Some("a".repeat(UPDATE_TOKEN_MIN - 1))), None);
        assert!(clean_update_token(Some("a".repeat(UPDATE_TOKEN_MIN))).is_some());
        assert!(clean_update_token(Some("a".repeat(UPDATE_TOKEN_MAX))).is_some());
        assert_eq!(clean_update_token(Some("a".repeat(UPDATE_TOKEN_MAX + 1))), None);
    }

    #[test]
    fn anything_that_could_split_a_request_is_none() {
        for bad in [
            "v1.aaaaaaaaaaaaaaaaaaaa bbbb",
            "v1.aaaaaaaaaaaaaaaaaaaa\r\nX-Evil: 1",
            "v1.aaaaaaaaaaaaaaaaaaaa\0bbbb",
            "v1.aaaaaaaaaaaaaaaaaaaa:bbbb",
            "v1.aaaaaaaaaaaaaaaaaaaaїїїї",
        ] {
            assert_eq!(clean_update_token(Some(bad.into())), None, "{bad:?}");
        }
    }

    #[test]
    fn what_passes_is_always_a_valid_header_value() {
        let token = clean_update_token(Some(REAL_SHAPE.into())).unwrap();
        assert!(reqwest::header::HeaderValue::from_str(&token).is_ok());
        assert!(reqwest::header::HeaderName::from_bytes(UPDATE_TOKEN_HEADER.as_bytes()).is_ok());
    }
}
