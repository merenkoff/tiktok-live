# POS module-remote signing (roadmap #3)

Status: **implemented, dev key only.** A runtime-loaded module remote
(`store.module_remotes`, roadmap #9) is verified against a signed manifest before
`import()`. Fail → the module stays bundled (`remote_verify_error` telemetry).

## What a signed remote looks like

`scripts/sign-remote.mjs <moduleId>` runs after `vite build --config
vite.<id>-remote.config.ts` (wired into `npm run build:<id>-remote`) and writes,
next to `remote-entry.js`:

| file | contents |
|---|---|
| `manifest.json` | `{ schema, moduleId, version, entry, keyId, builtAt, files: { "<name>": "sha384-…" } }` — every `*.js` in the output dir, name-sorted, fixed key order |
| `manifest.json.sig` | base64 Ed25519 **detached** signature over the exact bytes of `manifest.json` |

`serve:<id>-remote` (and any CDN serving the directory) exposes all three.

## What the loader checks

`src/modules/remoteVerify.ts` → `verifyRemoteEntry(url, moduleId)`, called from
`applyModuleRemotes()` before the dynamic `import()`:

1. fetch `<dir>/manifest.json` + `.sig` (`cache: no-store`) and the entry `url`;
2. `manifest.keyId` must be in `TRUSTED_REMOTE_KEYS` (`src/modules/remoteSigningKeys.ts`);
3. Ed25519 `crypto.subtle.verify` of the signature over the received manifest bytes;
4. `sha384(remote-entry.js)` must equal `manifest.files[manifest.entry]`;
5. `manifest.moduleId` / `entry` basename must match what's being loaded.

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
loads locally out of the box. **Not a security boundary.**
`node scripts/sign-remote.mjs --print-dev` prints its `keyId`/pubkey.

**Production key** — generate with `node scripts/sign-remote.mjs --gen-prod`:
- private key (base64 PKCS8 DER) → CI secret `POS_REMOTE_SIGNING_KEY`; the build
  step picks it up automatically when set;
- public key → add its `keyId` entry to `TRUSTED_REMOTE_KEYS` and **remove the
  `dev` entry** before shipping remotes that matter.

Rotation = add the new keyId alongside the old, re-sign, then drop the old entry
once no served manifest uses it.

## Dev escape hatch

`VITE_MODULE_REMOTES=<id>@<url>` **and** `VITE_MODULE_REMOTES_INSECURE=1` at build
time skips verification — for pointing at an unsigned dev server. The per-store
(`store.module_remotes`) path is **always** verified; the flag only affects the
env override.
