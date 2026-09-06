// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

//! Online-only module remotes on the desktop cashier (roadmap #13 Part B).
//!
//! The web path (`src/modules/remoteVerify.ts` → `import(https://…)`) can't work
//! here: the Tauri CSP is `script-src 'self'` (no CDN `import()`), and the
//! cashier has to keep working offline. So this module:
//!
//!  1. `sync_module_remote` — an async command the shell calls at boot for each
//!     `store.module_remotes` entry. Fetches the signed `manifest.json` +
//!     `.sig`, Ed25519-verifies it against an allowlisted key (same scheme as
//!     `scripts/sign-remote.mjs` / `src/modules/remoteSigningKeys.ts`), and if
//!     the advertised version is newer than what's cached, downloads every
//!     listed file, sha384-checks each, and atomically swaps it into
//!     `<appDataDir>/modules/<id>/<version>/`. A failed sync never touches the
//!     installed cache — the last good version stays live.
//!  2. `protocol` — a `liveshopmodule://` URI-scheme handler that serves those
//!     cached bytes back to the webview so `import('liveshopmodule://…')`
//!     resolves (relative sub-chunks included, which `blob:` can't do). The
//!     scheme is registered only inside our own WKWebView / WebView2 — it is
//!     NOT a system URL-scheme registration.
//!
//! Verification lives here; the webview only ever imports from our on-disk cache.

use std::borrow::Cow;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha384};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime, UriSchemeContext};

const B64: base64::engine::general_purpose::GeneralPurpose = base64::engine::general_purpose::STANDARD;

/// Ed25519 public keys trusted to sign module-remote manifests (roadmap #3).
///
/// **MUST stay in sync with `pos/src/modules/remoteSigningKeys.ts`.**
/// `keyId` = first 16 hex of `sha256(rawPubKey)`; value = base64 raw 32-byte key.
/// The `dev` entry is deterministic and not secret (see `scripts/sign-remote.mjs`
/// `--print-dev`); drop it before shipping remotes that matter.
const TRUSTED_REMOTE_KEYS: &[(&str, &str)] = &[
    // dev (deterministic — `node scripts/sign-remote.mjs --print-dev`)
    ("a5dae462a776005d", "iTxt7d1E3eJAWDaCKKiOksLNjdnPwmLgayjSJVRsIYM="),
];

/// The signed manifest a remote build ships next to `remote-entry.js`
/// (`scripts/sign-remote.mjs`). Field names mirror `RemoteManifest` in
/// `src/modules/remoteVerify.ts`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteManifest {
    schema: u32,
    module_id: String,
    version: String,
    entry: String,
    key_id: String,
    files: BTreeMap<String, String>,
}

/// `<appDataDir>/modules/<id>/installed.json` — points at the active `<version>`
/// dir and records what was verified so `protocol` and the "is it current?"
/// check don't need the network.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Installed {
    version: String,
    entry: String,
    key_id: String,
    files: BTreeMap<String, String>,
    source_url: String,
    installed_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleSyncResult {
    /// `"updated"` | `"current"` | `"offline"` | `"error"`.
    status: String,
    /// The version now live in the cache (`None` only when offline with nothing
    /// cached yet).
    active: Option<String>,
    previous: Option<String>,
    error: Option<String>,
}

impl ModuleSyncResult {
    fn offline(installed: Option<&Installed>) -> Self {
        Self {
            status: "offline".into(),
            active: installed.map(|i| i.version.clone()),
            previous: None,
            error: None,
        }
    }
}

/// A single path segment we're willing to touch on disk / in a URL: non-empty,
/// `[A-Za-z0-9._-]` only, and never `.` / `..`. Blocks traversal and separators.
fn is_safe_segment(s: &str) -> bool {
    !s.is_empty()
        && s != "."
        && s != ".."
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'_')
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn sha384_b64(bytes: &[u8]) -> String {
    let mut h = Sha384::new();
    h.update(bytes);
    format!("sha384-{}", B64.encode(h.finalize()))
}

fn content_type(name: &str) -> &'static str {
    if name.ends_with(".js") || name.ends_with(".mjs") {
        "text/javascript"
    } else if name.ends_with(".css") {
        "text/css"
    } else if name.ends_with(".json") || name.ends_with(".map") {
        "application/json"
    } else {
        "application/octet-stream"
    }
}

fn modules_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("modules"))
        .map_err(|e| format!("app_data_dir: {e}"))
}

fn read_installed(mod_dir: &Path) -> Option<Installed> {
    let raw = fs::read(mod_dir.join("installed.json")).ok()?;
    serde_json::from_slice(&raw).ok()
}

/// Every file in `files` exists under `dir` and still hashes to the recorded
/// sha384 — i.e. the cache wasn't tampered with or half-deleted.
fn cache_intact(dir: &Path, files: &BTreeMap<String, String>) -> bool {
    files.iter().all(|(name, expected)| {
        fs::read(dir.join(name))
            .map(|b| sha384_b64(&b) == *expected)
            .unwrap_or(false)
    })
}

/// `…/remote-entry.js` → (`…/manifest.json`, `…/manifest.json.sig`, `…/`).
/// Mirrors `remoteVerify.ts` `url.replace(/[^/]+$/, 'manifest.json')`.
fn derive_urls(base_url: &str) -> Result<(String, String, String), String> {
    let cut = base_url.rfind('/').ok_or("base_url has no path")?;
    let dir = &base_url[..=cut]; // keeps the trailing '/'
    Ok((
        format!("{dir}manifest.json"),
        format!("{dir}manifest.json.sig"),
        dir.to_string(),
    ))
}

fn verify_manifest_sig(pubkey_b64: &str, sig_b64: &str, manifest_bytes: &[u8]) -> Result<bool, String> {
    let pk: [u8; 32] = B64
        .decode(pubkey_b64.trim())
        .map_err(|e| format!("pubkey b64: {e}"))?
        .try_into()
        .map_err(|_| "pubkey is not 32 bytes".to_string())?;
    let sig: [u8; 64] = B64
        .decode(sig_b64.trim())
        .map_err(|e| format!("sig b64: {e}"))?
        .try_into()
        .map_err(|_| "signature is not 64 bytes".to_string())?;
    let key = VerifyingKey::from_bytes(&pk).map_err(|e| format!("bad pubkey: {e}"))?;
    Ok(key.verify(manifest_bytes, &Signature::from_bytes(&sig)).is_ok())
}

async fn fetch_bytes(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    Ok(resp.bytes().await.map_err(|e| e.to_string())?.to_vec())
}

/// Download + verify + cache the module named `id` from `base_url` (its
/// `module_remotes[id]`, pointing at `remote-entry.js`). See the module docs.
#[tauri::command]
pub async fn sync_module_remote(
    app: AppHandle,
    id: String,
    base_url: String,
) -> Result<ModuleSyncResult, String> {
    if !is_safe_segment(&id) {
        return Err(format!("unsafe module id {id:?}"));
    }
    let mod_dir = modules_root(&app)?.join(&id);
    let installed = read_installed(&mod_dir);

    let (manifest_url, sig_url, dir_url) = derive_urls(&base_url)?;
    let client = reqwest::Client::builder()
        .user_agent(concat!("cloth-pos-modules/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    // Network down / server unreachable → run from whatever is already cached.
    let (manifest_bytes, sig_text) =
        match (fetch_bytes(&client, &manifest_url).await, fetch_bytes(&client, &sig_url).await) {
            (Ok(m), Ok(s)) => (m, String::from_utf8_lossy(&s).into_owned()),
            _ => return Ok(ModuleSyncResult::offline(installed.as_ref())),
        };

    let manifest: RemoteManifest =
        serde_json::from_slice(&manifest_bytes).map_err(|e| format!("manifest parse: {e}"))?;
    if manifest.schema != 1 {
        return Err(format!("unsupported manifest schema {}", manifest.schema));
    }
    if manifest.module_id != id {
        return Err(format!(
            "manifest moduleId {:?} != {:?}",
            manifest.module_id, id
        ));
    }
    let pubkey = TRUSTED_REMOTE_KEYS
        .iter()
        .find(|(k, _)| *k == manifest.key_id)
        .map(|(_, v)| *v)
        .ok_or_else(|| format!("untrusted keyId {}", manifest.key_id))?;
    if !verify_manifest_sig(pubkey, &sig_text, &manifest_bytes)? {
        return Err("bad manifest signature".into());
    }
    if !manifest.files.contains_key(&manifest.entry) {
        return Err(format!("manifest has no hash for entry {}", manifest.entry));
    }

    let new_ver =
        semver::Version::parse(&manifest.version).map_err(|e| format!("bad manifest version: {e}"))?;

    // Already have this (or newer) and the cache is intact → nothing to do.
    if let Some(inst) = &installed {
        if let Ok(cur) = semver::Version::parse(&inst.version) {
            if new_ver <= cur && cache_intact(&mod_dir.join(&inst.version), &inst.files) {
                return Ok(ModuleSyncResult {
                    status: "current".into(),
                    active: Some(inst.version.clone()),
                    previous: None,
                    error: None,
                });
            }
        }
    }

    // Download into a scratch dir; only publish it once every hash checks out.
    let partial = mod_dir.join(format!("{}.partial", manifest.version));
    let _ = fs::remove_dir_all(&partial);
    fs::create_dir_all(&partial).map_err(|e| format!("mkdir: {e}"))?;

    for (name, expected) in &manifest.files {
        if !is_safe_segment(name) {
            let _ = fs::remove_dir_all(&partial);
            return Err(format!("unsafe file name in manifest: {name:?}"));
        }
        let bytes = match fetch_bytes(&client, &format!("{dir_url}{name}")).await {
            Ok(b) => b,
            Err(e) => {
                let _ = fs::remove_dir_all(&partial);
                return Err(format!("download {name}: {e}"));
            }
        };
        if sha384_b64(&bytes) != *expected {
            let _ = fs::remove_dir_all(&partial);
            return Err(format!("hash mismatch for {name}"));
        }
        if let Err(e) = fs::write(partial.join(name), &bytes) {
            let _ = fs::remove_dir_all(&partial);
            return Err(format!("write {name}: {e}"));
        }
    }

    // Publish: swap the version dir, rewrite installed.json, drop stale versions.
    let final_dir = mod_dir.join(&manifest.version);
    let _ = fs::remove_dir_all(&final_dir);
    fs::rename(&partial, &final_dir).map_err(|e| format!("publish: {e}"))?;

    let record = Installed {
        version: manifest.version.clone(),
        entry: manifest.entry.clone(),
        key_id: manifest.key_id.clone(),
        files: manifest.files.clone(),
        source_url: base_url.clone(),
        installed_at_ms: now_ms(),
    };
    fs::write(
        mod_dir.join("installed.json"),
        serde_json::to_vec_pretty(&record).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("write installed.json: {e}"))?;
    prune_other_versions(&mod_dir, &manifest.version);

    Ok(ModuleSyncResult {
        status: "updated".into(),
        active: Some(manifest.version),
        previous: installed.map(|i| i.version),
        error: None,
    })
}

/// Delete every `modules/<id>/<dir>` that isn't the active version (or its
/// `installed.json`). Best-effort — a leftover dir is harmless.
fn prune_other_versions(mod_dir: &Path, keep: &str) {
    let Ok(entries) = fs::read_dir(mod_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == "installed.json" || name == keep {
            continue;
        }
        if entry.path().is_dir() {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

/// `liveshopmodule://localhost/<id>/<file>` (macOS/Linux) or
/// `http://liveshopmodule.localhost/<id>/<file>` (Windows) → the cached bytes
/// of the active version. Host is ignored; only the two path segments matter.
pub fn protocol<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    req: Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let not_found = || {
        Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Cow::Borrowed(&b"not found"[..]))
            .unwrap()
    };

    let path = req.uri().path();
    let segs: Vec<&str> = path.trim_matches('/').split('/').collect();
    if segs.len() != 2 || !is_safe_segment(segs[0]) || !is_safe_segment(segs[1]) {
        return not_found();
    }
    let (id, file) = (segs[0], segs[1]);

    let mod_dir = match modules_root(ctx.app_handle()) {
        Ok(root) => root.join(id),
        Err(_) => return not_found(),
    };
    let Some(inst) = read_installed(&mod_dir) else {
        return not_found();
    };
    let Ok(bytes) = fs::read(mod_dir.join(&inst.version).join(file)) else {
        return not_found();
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type(file))
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Cow::Owned(bytes))
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use sha2::Sha256;

    /// Reproduces the deterministic dev signing key from `scripts/sign-remote.mjs`
    /// (`sha256("the-live.shop pos module-remote — dev signing key v1")` as the
    /// Ed25519 seed).
    fn dev_signing_key() -> SigningKey {
        let seed: [u8; 32] =
            Sha256::digest(b"the-live.shop pos module-remote \xe2\x80\x94 dev signing key v1").into();
        SigningKey::from_bytes(&seed)
    }

    #[test]
    fn dev_pubkey_matches_the_allowlist() {
        let vk = dev_signing_key().verifying_key();
        assert_eq!(B64.encode(vk.to_bytes()), TRUSTED_REMOTE_KEYS[0].1);
    }

    #[test]
    fn verify_manifest_sig_accepts_good_and_rejects_tampered() {
        let sk = dev_signing_key();
        let pub_b64 = B64.encode(sk.verifying_key().to_bytes());
        let manifest = br#"{"schema":1,"moduleId":"demo"}"#;
        let sig_b64 = B64.encode(sk.sign(manifest).to_bytes());

        assert!(verify_manifest_sig(&pub_b64, &sig_b64, manifest).unwrap());
        assert!(!verify_manifest_sig(&pub_b64, &sig_b64, br#"{"schema":1,"moduleId":"evil"}"#).unwrap());
    }

    #[test]
    fn sha384_b64_matches_the_manifest_format() {
        // printf 'hello' | openssl dgst -sha384 -binary | base64
        assert_eq!(
            sha384_b64(b"hello"),
            "sha384-WeF0h3dEjGnea4ANejO7+5/xtGPkQ1TDVTvNucZm+pASWjx5+QOXvfX2oT3oKGhP"
        );
    }

    #[test]
    fn is_safe_segment_blocks_traversal_and_separators() {
        for good in ["remote-entry.js", "chunk_ABC.123.js", "style.css", "1.2.3"] {
            assert!(is_safe_segment(good), "{good}");
        }
        for bad in ["", ".", "..", "a/b", "../x", "a\\b", "a b", "a\0b", "föö.js"] {
            assert!(!is_safe_segment(bad), "{bad}");
        }
    }

    #[test]
    fn derive_urls_swaps_the_last_segment() {
        let (m, s, d) = derive_urls("https://cdn.example.test/mods/demo/remote-entry.js").unwrap();
        assert_eq!(m, "https://cdn.example.test/mods/demo/manifest.json");
        assert_eq!(s, "https://cdn.example.test/mods/demo/manifest.json.sig");
        assert_eq!(d, "https://cdn.example.test/mods/demo/");
    }

    #[test]
    fn content_type_by_extension() {
        assert_eq!(content_type("a.js"), "text/javascript");
        assert_eq!(content_type("a.css"), "text/css");
        assert_eq!(content_type("a.bin"), "application/octet-stream");
    }

    #[test]
    fn cache_intact_detects_a_flipped_byte() {
        let dir = std::env::temp_dir().join(format!("lsm-test-{}", now_ms()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("remote-entry.js"), b"console.log(1)").unwrap();
        let mut files = BTreeMap::new();
        files.insert("remote-entry.js".to_string(), sha384_b64(b"console.log(1)"));
        assert!(cache_intact(&dir, &files));

        fs::write(dir.join("remote-entry.js"), b"console.log(2)").unwrap();
        assert!(!cache_intact(&dir, &files));
        let _ = fs::remove_dir_all(&dir);
    }
}
