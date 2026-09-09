# POS module-remote signing (roadmap #3)

Status: **implemented; prod key in both allowlists (web `remoteSigningKeys.ts`
and desktop `module_remotes.rs`), CI signs with it (`module-release.yml`).** A
runtime-loaded module remote (`store.module_remotes`, roadmap #9) is verified
against a signed manifest before `import()`. Fail → the module stays bundled
(`remote_verify_error` telemetry). On the desktop the same check runs in Rust
before anything is written to the cache.

## What a signed remote looks like

`scripts/sign-remote.mjs <moduleId>` runs after `vite build --config
vite.<id>-remote.config.ts` (wired into `npm run build:<id>-remote`) and writes,
next to `remote-entry.js`:

| file | contents |
|---|---|
| `manifest.json` | `{ schema, moduleId, version, minHostPlatform, entry, keyId, builtAt, files: { "<name>": "sha384-…" } }` — every `*.js` **and `*.css`** in the output dir, name-sorted, fixed key order. `minHostPlatform` = the checkout's `PLATFORM_VERSION`; a host with a lower one refuses the remote ([POS_MODULE_PLATFORM_VERSION.md](POS_MODULE_PLATFORM_VERSION.md)). `schema` stays `1` — older hosts ignore the field. |
| `manifest.json.sig` | base64 Ed25519 **detached** signature over the exact bytes of `manifest.json` |

`serve:<id>-remote` (and any CDN serving the directory) exposes all three.

## What the loader checks

`src/modules/remoteVerify.ts` → `verifyRemoteEntry(url, moduleId)`, called from
`applyModuleRemotes()` before the dynamic `import()`:

1. fetch `<dir>/manifest.json` + `.sig` (`cache: no-store`) and the entry `url`;
2. `manifest.keyId` must be in `TRUSTED_REMOTE_KEYS` (`src/modules/remoteSigningKeys.ts`);
3. Ed25519 `crypto.subtle.verify` of the signature over the received manifest bytes;
4. `sha384(remote-entry.js)` must equal `manifest.files[manifest.entry]`;
5. `manifest.moduleId` / `entry` basename must match what's being loaded;
6. if `manifest.files['style.css']` exists (roadmap #4), fetch `<dir>/style.css`,
   sha384-check it, and return its text so `registry.injectModuleStyle` can
   append a `<style data-module-remote="<id>">` before the first render.

Any failure throws `RemoteVerifyError` → `remote_verify_error` +
`remote_load_fallback` telemetry → the bundled descriptor is kept.

**Scope / residual risk (not closed here):**
- **Sub-chunks** (`StockHubPage-*.js`, the hashed `remote-entry-*.js` facade
  target, …) are *not* fetched+hashed at load time. They're covered indirectly:
  their filenames are content-hashed and listed in the signed `files` map, and
  the entry that imports them is verified. A CDN able to serve arbitrary bytes at
  an exact hashed path defeats this — closing it needs import-map `integrity`
  (multi-map) or a verifying Service Worker.
- **TOCTOU**: we `fetch(entry)` to hash it, then `import(url)` refetches (from the
  HTTP cache). HTTPS + cache reuse make the window small, not zero. A `blob:`
  import would remove it but breaks the remotes' relative sub-chunk imports.
- **Browser support**: `crypto.subtle` Ed25519 (Chromium 137+, Node 20+). A
  browser without it fails **closed** — the remote is rejected, the module stays
  bundled.

## Keys

`keyId` = first 16 hex of `sha256(rawEd25519PublicKey)`. `TRUSTED_REMOTE_KEYS`
maps `keyId → base64(raw 32-byte public key)`.

**Dev key** — deterministic, derived from a fixed seed in `sign-remote.mjs`
(`sha256('the-live.shop pos module-remote — dev signing key v1')`). Nothing
secret is committed; every clone signs identically, so `build:<id>-remote` output
loads locally out of the box. **Not a security boundary** — anyone can sign
with it, so since 2026-09-09 it is trusted only where that is harmless:
- web: under `vite dev` / vitest (`import.meta.env.DEV`), or a build made with
  `VITE_REMOTE_ALLOW_DEV_KEY=1`;
- desktop: debug builds (`tauri:dev`, `cargo test`), or a release compiled with
  `POS_REMOTE_ALLOW_DEV_KEY=1` in the environment of the `tauri build` /
  `cargo` invocation itself (`option_env!` — compile time, not runtime).
Neither Railway nor `pos-release.yml` sets those, so what ships trusts the prod
key only. For a local end-to-end run against a dev-signed module on a *release*
cashier build, set the flag for that build (see the desktop check in
[POS_LIVE_SELLING_MODULE.md](POS_LIVE_SELLING_MODULE.md)).
`node scripts/sign-remote.mjs --print-dev` prints its `keyId`/pubkey.

**Production key** — generated 2026-09-07 with `node scripts/sign-remote.mjs
--gen-prod` (`keyId 2a73632c13044371`):
- private key (base64 PKCS8 DER) → CI secret `POS_REMOTE_SIGNING_KEY`; the build
  step picks it up automatically when set, and `module-release.yml` refuses to
  publish anything signed with another key;
- public key is in both allowlists (`remoteSigningKeys.ts` `PROD_REMOTE_KEYS`,
  `module_remotes.rs` `PROD_REMOTE_KEYS`). Keep them identical — the first
  prod-signed module failed on the desktop precisely because the Rust side was
  missed.

Rotation = add the new keyId alongside the old, re-sign, then drop the old entry
once no served manifest uses it.

## Dev escape hatch

`VITE_MODULE_REMOTES=<id>@<url>` **and** `VITE_MODULE_REMOTES_INSECURE=1` at build
time skips verification — for pointing at an unsigned dev server. The per-store
(`store.module_remotes`) path is **always** verified; the flag only affects the
env override.
