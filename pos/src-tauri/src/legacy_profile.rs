// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

//! The desktop till was «Cloth POS», identifier `shop.cloth.pos`, up to 2.7.x;
//! since 2.8.0 it is «LiveShop POS», `shop.the-live.pos`. Tauri derives every
//! folder of the app from the identifier — the WebView profile (IndexedDB with
//! the offline outbox, localStorage with the login, the device id, the fiscal
//! lease and the printer settings) and the module cache — so under the new
//! name the till would start empty. This module copies the old folders to the
//! new names ONCE, before Tauri opens the window, and never deletes the old
//! ones (TechDocs/POS_DESKTOP.md, «Перейменування 2.8.0»).
//!
//! Rules: a base where the new folder already exists is left alone (Tauri
//! creates it on the first start, so that is also what makes the copy run
//! once); the tree is copied into a staging folder and renamed into place, so
//! a crash mid-copy leaves nothing half-built; a file that cannot be read
//! (the old till still running) is recorded in the marker file and skipped
//! rather than failing the whole copy, because the next start would already
//! find Tauri's fresh folder and never try again; regenerable browser caches
//! are skipped by name — the product-photo cache alone was 474 MB on one Mac,
//! and nothing the till must keep lives in them.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// The identifier the till carried up to 2.7.x.
pub const LEGACY_IDENTIFIER: &str = "shop.cloth.pos";
/// Written into the new folder after a copy: what was copied, what was not.
pub const MARKER_FILE: &str = ".migrated-from-shop.cloth.pos";
/// Browser caches (WebKit and WebView2/Chromium names) that are rebuilt on
/// demand; skipped at any depth.
pub const SKIPPED_DIR_NAMES: &[&str] = &[
    "CacheStorage",
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "GrShaderCache",
    "ShaderCache",
    "blob_storage",
];

#[derive(Debug, Default, PartialEq, Eq)]
pub struct CopyStats {
    pub files: u64,
    pub dirs: u64,
    pub skipped_dirs: u64,
    /// Paths that could not be copied, with the error — the old till holding
    /// a lock, a broken symlink.
    pub failed: Vec<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    /// The old folder was copied; the stats say how far.
    Copied(CopyStats),
    /// The new folder is already there — this base is done (or was never old).
    NewExists,
    /// Nothing to carry over: this machine never ran the old till here.
    OldMissing,
    /// The copy could not be published at all; nothing was left behind.
    Failed(String),
}

#[derive(Debug)]
pub struct BaseReport {
    pub base: PathBuf,
    pub outcome: Outcome,
}

/// Carries `base/old_id` over to `base/new_id` for every base, independently.
pub fn migrate_legacy_profile(old_id: &str, new_id: &str, bases: &[PathBuf]) -> Vec<BaseReport> {
    bases
        .iter()
        .map(|base| BaseReport {
            base: base.clone(),
            outcome: migrate_one(base, old_id, new_id),
        })
        .collect()
}

fn migrate_one(base: &Path, old_id: &str, new_id: &str) -> Outcome {
    let old = base.join(old_id);
    let new = base.join(new_id);
    if new.exists() {
        return Outcome::NewExists;
    }
    if !old.is_dir() {
        return Outcome::OldMissing;
    }
    let staging = base.join(format!("{new_id}.migrating"));
    // An attempt interrupted earlier: start over rather than merge into it.
    let _ = fs::remove_dir_all(&staging);
    let mut stats = CopyStats::default();
    if let Err(error) = copy_tree(&old, &staging, &mut stats) {
        let _ = fs::remove_dir_all(&staging);
        return Outcome::Failed(format!("copy: {error}"));
    }
    let _ = fs::write(staging.join(MARKER_FILE), marker_text(old_id, &stats));
    match fs::rename(&staging, &new) {
        Ok(()) => Outcome::Copied(stats),
        Err(error) => {
            let _ = fs::remove_dir_all(&staging);
            Outcome::Failed(format!("rename: {error}"))
        }
    }
}

/// Copies `src` into `dst` recursively. Only a directory that cannot be
/// created stops the copy; an unreadable entry or file is recorded in
/// `stats.failed` and skipped, symlinks included (none are ours).
fn copy_tree(src: &Path, dst: &Path, stats: &mut CopyStats) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    stats.dirs += 1;
    let entries = match fs::read_dir(src) {
        Ok(entries) => entries,
        Err(error) => {
            stats.failed.push(format!("{}: {error}", src.display()));
            return Ok(());
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                stats.failed.push(format!("{}: {error}", src.display()));
                continue;
            }
        };
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                stats.failed.push(format!("{}: {error}", from.display()));
                continue;
            }
        };
        if file_type.is_dir() {
            let name = entry.file_name();
            if SKIPPED_DIR_NAMES.iter().any(|skipped| name == *skipped) {
                stats.skipped_dirs += 1;
                continue;
            }
            copy_tree(&from, &to, stats)?;
        } else if file_type.is_file() {
            match fs::copy(&from, &to) {
                Ok(_) => stats.files += 1,
                Err(error) => stats.failed.push(format!("{}: {error}", from.display())),
            }
        } else {
            stats.failed.push(format!("{}: symlink skipped", from.display()));
        }
    }
    Ok(())
}

fn marker_text(old_id: &str, stats: &CopyStats) -> String {
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut text = format!(
        "from={old_id} at={at} files={} dirs={} skipped_dirs={} failed={}\n",
        stats.files,
        stats.dirs,
        stats.skipped_dirs,
        stats.failed.len()
    );
    for failed in &stats.failed {
        text.push_str(failed);
        text.push('\n');
    }
    text
}

/// The folders Tauri keys by identifier, resolved the way Tauri resolves them
/// (the `dirs` crate): `data_dir` is `app_data_dir` — the module cache —
/// (Windows `%APPDATA%`, macOS `~/Library/Application Support`, Linux
/// `$XDG_DATA_HOME` or `~/.local/share`); `data_local_dir` is
/// `app_local_data_dir`, where Tauri keeps the WebView profile on Windows
/// (`%LOCALAPPDATA%`, the `EBWebView` folder) and Linux. On macOS the profile
/// is WebKit's default data store, filed by bundle id under `~/Library/WebKit`
/// (no `dataStoreIdentifier` in `tauri.conf.json`).
pub fn platform_base_dirs() -> Vec<PathBuf> {
    let mut bases = Vec::new();
    if let Some(dir) = dirs::data_dir() {
        bases.push(dir);
    }
    if let Some(dir) = dirs::data_local_dir() {
        if !bases.contains(&dir) {
            bases.push(dir);
        }
    }
    #[cfg(target_os = "macos")]
    if let Some(home) = dirs::home_dir() {
        bases.push(home.join("Library").join("WebKit"));
    }
    bases
}

/// Called first thing in `run()`, before Tauri builds anything. Never panics;
/// the outcome goes to stderr (the shell has no logger) and to the marker file.
pub fn run_at_startup(new_id: &str) {
    if new_id == LEGACY_IDENTIFIER {
        return;
    }
    for report in migrate_legacy_profile(LEGACY_IDENTIFIER, new_id, &platform_base_dirs()) {
        match &report.outcome {
            Outcome::Copied(stats) => eprintln!(
                "legacy profile: copied {}/{} -> {}/{} ({} files, {} dirs, {} cache dirs skipped, {} failed)",
                report.base.display(),
                LEGACY_IDENTIFIER,
                report.base.display(),
                new_id,
                stats.files,
                stats.dirs,
                stats.skipped_dirs,
                stats.failed.len()
            ),
            Outcome::Failed(error) => eprintln!(
                "legacy profile: could not copy {}/{}: {error}",
                report.base.display(),
                LEGACY_IDENTIFIER
            ),
            Outcome::NewExists | Outcome::OldMissing => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("lsp-migrate-{name}-{ms}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &Path, bytes: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    }

    fn stats(outcome: &Outcome) -> &CopyStats {
        match outcome {
            Outcome::Copied(stats) => stats,
            other => panic!("expected Copied, got {other:?}"),
        }
    }

    #[test]
    fn copies_nested_tree_writes_marker_and_leaves_old_in_place() {
        let base = scratch("tree");
        let old = base.join("old.id");
        write(&old.join("a.txt"), b"alpha");
        write(&old.join("sub").join("b.bin"), &[1, 2, 3]);
        write(&old.join("sub").join("deep").join("c"), b"");

        let reports = migrate_legacy_profile("old.id", "new.id", &[base.clone()]);
        assert_eq!(reports.len(), 1);
        let stats = stats(&reports[0].outcome);
        assert_eq!((stats.files, stats.dirs, stats.skipped_dirs), (3, 3, 0));
        assert!(stats.failed.is_empty());

        let new = base.join("new.id");
        assert_eq!(fs::read(new.join("a.txt")).unwrap(), b"alpha");
        assert_eq!(fs::read(new.join("sub").join("b.bin")).unwrap(), vec![1, 2, 3]);
        assert!(new.join("sub").join("deep").join("c").is_file());
        let marker = fs::read_to_string(new.join(MARKER_FILE)).unwrap();
        assert!(marker.starts_with("from=old.id at="), "{marker}");
        assert!(marker.contains(" files=3 dirs=3 skipped_dirs=0 failed=0\n"), "{marker}");
        assert_eq!(fs::read(old.join("a.txt")).unwrap(), b"alpha");
        assert!(!base.join("new.id.migrating").exists());

        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn nothing_to_do_without_an_old_folder() {
        let base = scratch("missing");
        let reports = migrate_legacy_profile("old.id", "new.id", &[base.clone()]);
        assert_eq!(reports[0].outcome, Outcome::OldMissing);
        assert!(!base.join("new.id").exists());
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn an_existing_new_folder_is_left_alone() {
        let base = scratch("exists");
        write(&base.join("old.id").join("a.txt"), b"old");
        write(&base.join("new.id").join("keep.txt"), b"keep");
        let reports = migrate_legacy_profile("old.id", "new.id", &[base.clone()]);
        assert_eq!(reports[0].outcome, Outcome::NewExists);
        assert_eq!(fs::read(base.join("new.id").join("keep.txt")).unwrap(), b"keep");
        assert!(!base.join("new.id").join("a.txt").exists());
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn the_second_run_copies_nothing() {
        let base = scratch("twice");
        write(&base.join("old.id").join("a.txt"), b"alpha");
        let first = migrate_legacy_profile("old.id", "new.id", &[base.clone()]);
        assert!(matches!(first[0].outcome, Outcome::Copied(_)));
        let marker = fs::read_to_string(base.join("new.id").join(MARKER_FILE)).unwrap();
        write(&base.join("old.id").join("later.txt"), b"later");
        let second = migrate_legacy_profile("old.id", "new.id", &[base.clone()]);
        assert_eq!(second[0].outcome, Outcome::NewExists);
        assert!(!base.join("new.id").join("later.txt").exists());
        assert_eq!(fs::read_to_string(base.join("new.id").join(MARKER_FILE)).unwrap(), marker);
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn browser_caches_are_skipped_at_any_depth() {
        let base = scratch("caches");
        let old = base.join("old.id");
        write(&old.join("CacheStorage").join("x"), b"x");
        write(&old.join("EBWebView").join("Default").join("Code Cache").join("y"), b"y");
        write(&old.join("EBWebView").join("Default").join("IndexedDB").join("z"), b"z");
        let reports = migrate_legacy_profile("old.id", "new.id", &[base.clone()]);
        let stats = stats(&reports[0].outcome);
        assert_eq!(stats.skipped_dirs, 2);
        assert_eq!(stats.files, 1);
        let new = base.join("new.id");
        assert!(!new.join("CacheStorage").exists());
        assert!(!new.join("EBWebView").join("Default").join("Code Cache").exists());
        assert!(new.join("EBWebView").join("Default").join("IndexedDB").join("z").is_file());
        fs::remove_dir_all(&base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn an_unreadable_file_is_recorded_and_the_rest_is_copied() {
        use std::os::unix::fs::PermissionsExt;
        let base = scratch("locked");
        let old = base.join("old.id");
        write(&old.join("ok.txt"), b"ok");
        write(&old.join("locked.txt"), b"secret");
        fs::set_permissions(old.join("locked.txt"), fs::Permissions::from_mode(0o000)).unwrap();
        let reports = migrate_legacy_profile("old.id", "new.id", &[base.clone()]);
        let stats = stats(&reports[0].outcome);
        assert_eq!(stats.files, 1);
        assert_eq!(stats.failed.len(), 1, "{:?}", stats.failed);
        assert!(stats.failed[0].contains("locked.txt"));
        let new = base.join("new.id");
        assert_eq!(fs::read(new.join("ok.txt")).unwrap(), b"ok");
        let marker = fs::read_to_string(new.join(MARKER_FILE)).unwrap();
        assert!(marker.contains("failed=1\n"), "{marker}");
        assert!(marker.contains("locked.txt"), "{marker}");
        fs::set_permissions(old.join("locked.txt"), fs::Permissions::from_mode(0o644)).unwrap();
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn a_leftover_staging_folder_is_discarded() {
        let base = scratch("staging");
        write(&base.join("old.id").join("a.txt"), b"alpha");
        write(&base.join("new.id.migrating").join("junk"), b"junk");
        let reports = migrate_legacy_profile("old.id", "new.id", &[base.clone()]);
        assert!(matches!(reports[0].outcome, Outcome::Copied(_)));
        assert!(!base.join("new.id").join("junk").exists());
        assert!(!base.join("new.id.migrating").exists());
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn bases_are_independent() {
        let with = scratch("with");
        let without = scratch("without");
        write(&with.join("old.id").join("a.txt"), b"alpha");
        let reports = migrate_legacy_profile("old.id", "new.id", &[with.clone(), without.clone()]);
        assert!(matches!(reports[0].outcome, Outcome::Copied(_)));
        assert_eq!(reports[1].outcome, Outcome::OldMissing);
        assert!(with.join("new.id").join("a.txt").is_file());
        assert!(!without.join("new.id").exists());
        fs::remove_dir_all(&with).unwrap();
        fs::remove_dir_all(&without).unwrap();
    }

    #[test]
    fn the_manifest_carries_the_new_identifier() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let identifier = conf["identifier"].as_str().unwrap();
        assert_eq!(identifier, "shop.the-live.pos");
        assert_ne!(identifier, LEGACY_IDENTIFIER);
        assert_eq!(conf["productName"].as_str().unwrap(), "LiveShop POS");
    }

    #[test]
    fn the_platform_bases_are_absolute_and_distinct() {
        let bases = platform_base_dirs();
        assert!(!bases.is_empty());
        for base in &bases {
            assert!(base.is_absolute(), "{}", base.display());
        }
        let mut sorted = bases.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), bases.len());
    }
}
