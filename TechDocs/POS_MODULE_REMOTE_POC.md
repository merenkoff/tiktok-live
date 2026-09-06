# POS module remotes — Task B proof-of-concept

**Status: evaluation only. Not wired for production. Do not deploy.**

Goal of this PoC: find out what it actually costs to ship one POS feature
module (`returns`) on its own release cadence — downloaded at runtime instead
of bundled — now that Steps 1–5 have made modules data-driven, capability-gated,
code-split, physically isolated, and backed by the `@pos/platform` contract.

## What is in the tree

| Piece           | File                                                                 | What it does                                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descriptor swap | `pos/src/modules/registry.ts` → `applyModuleRemotes()`               | Reads `VITE_MODULE_REMOTES` (`id@url,…`), `import()`s each URL, replaces that entry in `MODULES` with the descriptor it exports. Unset → no-op.                                                                              |
| Boot hook       | `pos/src/main.tsx`                                                   | `await applyModuleRemotes()` before the first render, so routes/nav see the swapped descriptor.                                                                                                                              |
| Remote entry    | `pos/src/modules/returns/remote-entry.ts`                            | `export { returnsModule as manifest }`                                                                                                                                                                                       |
| Remote build    | `pos/vite.returns-remote.config.ts` + `npm run build:returns-remote` | Builds `src/modules/returns` as one self-contained ESM file with `react`, `react-dom`, `react/jsx-runtime`, `react-router-dom`, `zustand`, `@pos/platform` **external**. Output: `pos/dist-remotes/returns/remote-entry.js`. |
| Static host     | `npm run serve:returns-remote`                                       | Serves `dist-remotes/returns` on `:5001` with CORS.                                                                                                                                                                          |

## How to run it locally

```bash
cd pos
npm run build:returns-remote           # -> dist-remotes/returns/remote-entry.js  (~7.6 kB gzip)
npm run serve:returns-remote           # :5001, CORS on
# separate shell — point the host at the remote:
VITE_MODULE_REMOTES="returns@http://localhost:5001/remote-entry.js" npm run dev
```

## What the PoC proves (verified)

1. **The registry accepts a runtime descriptor.** `applyModuleRemotes()` swaps a
   `MODULES` entry from a URL; `renderRoutes` / `<Nav>` / `useEnabledModules`
   consume it unchanged. Type-checks; the normal build (`VITE_MODULE_REMOTES`
   unset) is byte-identical — zero risk when the flag is off.
2. **`returns` compiles to a standalone artifact.** `remote-entry.js` is
   **32.6 kB / 7.6 kB gzip**. Its *entire* contract with the host is the set of
   bare imports at the top of the file:
   ```
   import … from "react";
   import … from "react/jsx-runtime";
   import … from "react-router-dom";
   import { cashierApi, api, useAuthStore, usePrintableReceipt, refundLineAmount,
            formatUah, getMeta, printReceipt, DEFAULT_RECEIPT_PAPER_WIDTH,
            buildRefundReceiptPayload, OfflineRefundError, saleRowFromDetail } from "@pos/platform";
   ```
   Nothing leaks past `@pos/platform` + the three shared libs. That is the
   contract Step 4 set out to establish, and it holds.
3. **Independent build/publish is a one-liner.** `build:returns-remote` is a
   separate Vite config with its own `outDir`; a module CI job would be a copy of
   it plus an upload step.

## What the PoC does NOT solve (the real cost)

**Shared singletons across the host↔remote boundary.** For the remote's pages to
render *inside* the host React tree they must use the **same** React instance,
the same React Router context, and the same Zustand stores (`useAuthStore`,
`useCartStore`, `useOfflineStatus`) as the host. Today they would not:

- The host bundles its own `react` and imports stores directly from
  `src/hooks/*` (`App.tsx`, `Nav.tsx`, `renderRoutes.tsx`, `RegisterPage.tsx`,
  `useEnabledModules.ts` all do `import … from '../hooks/useAuth'`, not from
  `@pos/platform`).
- A naive fix — externalise `react`/`zustand`/`@pos/platform` from the host
  build and resolve them through an `index.html` import map (esm.sh for the libs,
  a host-emitted `assets/platform.js` for the contract) — was tried and
  **does not work as-is**: Rollup with `@pos/platform` both aliased and external
  collapses the emitted `platform.js` to a 0.2 kB self-referential stub and the
  host entry to ~8 kB, i.e. the graph stops being traced. Making it real needs:
  - every host file that touches a shared lib/store/hook to import it **only**
    via `@pos/platform` (enforced by an ESLint `no-restricted-imports` rule over
    `src/**` outside `src/platform/`), and
  - `@pos/platform` emitted as a proper standalone ESM entry with `react` et al.
    external, plus a correct, version-pinned import map, plus SRI, plus a
    fallback-to-bundled path when the remote 404s / is offline.

Also omitted here (each is real work, not a config tweak):

- **Signing / integrity** — no SRI, no signature check on the fetched module.
- **Version negotiation** — nothing checks that remote `returns@x` is compatible
  with host `@pos/platform@y` *or* with the unversioned `/api/pos` backend. The
  backend has no API versioning at all; that is a hard prerequisite before a
  module ships on its own cadence.
- **Rollback / pinning / staged rollout.**
- **Offline** — the remote won't load with no network, so the desktop cashier
  (the only offline surface) can't use this path. Desktop module delivery would
  need the signed-package-to-disk route (Tauri CSP is `script-src 'self'`, which
  blocks a CDN `import()` outright) — a second updater, ~3–6 weeks on its own.
- **CSS** — the remote assumes the host's compiled Tailwind is present; it ships
  no stylesheet.
- **Error boundaries / retry / telemetry** around the dynamic `import()`.

## Effort / risk read

| Scope | Estimate |
|---|---|
| This PoC (mechanism + standalone artifact + doc) | done |
| Web-only, actually renders (host migrated to `@pos/platform`, working import map, fallback-to-bundled) | done — see "Update: the singleton fix" below |
| Web production rollout (versioning, CI publish, SRI, error handling, Tailwind extraction, telemetry) | ~2–4 weeks |
| Desktop parity (signed packages to `appDataDir`, `asset:` protocol loader, CSP change, offline) | ~3–6 weeks on top — recommend **not** doing this; ship desktop module changes through the existing whole-app Tauri updater instead |

Dominant risks: React / Router singleton management across the boundary (now
proven working — see below); Tailwind class ownership; **backend API-version
skew** once a module releases independently against one unversioned `/api/pos`.

## Recommendation

Keep the Steps 1–5 architecture (it is valuable on its own — per-store toggles,
smaller surface, clean seams, lazy chunks). Treat independent *delivery* as a
future option, not a commitment. If it becomes real: do the **web-only** import-map
route (done, below), gate it behind `VITE_MODULE_REMOTES`, and require `/api/pos`
versioning first. Leave the desktop cashier on the whole-app updater.

## Update: the singleton fix (2026-09-04)

Closed the one item the original PoC round left unproven: that a remote
module's pages can render *inside* the host's live React tree — same React,
same Router, same `useAuthStore`/`useCartStore` — not two disconnected copies.
Still evaluation only; nothing here is wired into the default `npm run build` /
`build:cashier` (verified byte-behavior unchanged — same test suite, 159 tests
green, before and after).

**What changed:**

- Host files that touched `useAuthStore`/`useCartStore` via a relative
  `../hooks/useAuth` import now go through `@pos/platform` instead (`App.tsx`,
  `renderRoutes.tsx`, `LoginPage.tsx`, `HardwarePage.tsx`, `CustomersPage.tsx`,
  `RegisterPage.tsx`, `AdminLayout.tsx`, `SettingsPage.tsx`, `CheckoutModal.tsx`,
  `SaleSidebar.tsx`, `MobileCartSheet.tsx`). This is a no-op for the default
  build (`@pos/platform` still aliases to local source there) — it only
  matters once `@pos/platform` is built as its own external chunk.
- **New, load-bearing discovery**: `@pos/platform`'s `ui.ts` re-exports `Nav`,
  and `Nav` reads the *full* module registry to render nav links — including
  `returns`' own manifest. Building `@pos/platform` standalone therefore hit a
  genuine circular dependency (`@pos/platform → Nav → registry → returns'
  pages → @pos/platform`), not the Rollup config quirk the first PoC round
  assumed. Fix: split the barrel. `@pos/platform` (`index.ts`) is now
  state/data only (stores, api client, money/receipt/sales helpers, offline
  errors) — the part that must be one shared instance. `@pos/platform/ui`
  (unchanged `ui.ts`) holds the components (`Nav`, `AppRail`, `BottomNav`,
  `BarcodeScanner`, `ProductPhotoField`, `CustomerPicker`, `OfflineStatusBanner`,
  `useDragScroll`) — bundled locally by every consumer instead of shared,
  which is fine, since components aren't singletons; they just read the
  shared stores.
- `pos/vite.platform-remote.config.ts` (new) builds `@pos/platform` as its own
  chunk: **91 modules, ~70 kB gzip total** across `platform.js` + a couple of
  async chunks — small, because it no longer reaches `ui.ts`.
- `pos/vite.web-remote-demo.config.ts` (new) is a host build variant that
  externalises `react`, `react-dom`, `react-router-dom`, `zustand`, and
  `@pos/platform`, and injects an `importmap` (vendor libs pinned to the
  installed versions via esm.sh, `@pos/platform` → same-origin
  `/assets/platform.js`) into the emitted `index.html`. `@pos/platform/ui`
  stays locally aliased here (and in `vite.returns-remote.config.ts`) — never
  external, never shared.
- `npm run demo:module-remote` builds all three artifacts and copies
  `dist-remotes/platform/` into `dist-remote-demo/assets/`.
- Added a regression test (`registry.remotes.test.ts`) asserting
  `applyModuleRemotes()` leaves `MODULES` untouched when the remote fetch
  fails or the entry is malformed — the fallback-to-bundled path already
  existed structurally, it just wasn't asserted.

**What the browser actually proved:** served `dist-remote-demo` (:4174) and
`dist-remotes/returns` (:5001) together, drove it with Playwright. From the
page's own JS context, dynamically `import('@pos/platform')` a second time
and mutated `useAuthStore`'s state directly — the **host's already-rendered
React UI updated live off that external mutation** (login screen → cashier
shell), proving the browser resolved `@pos/platform` to one shared module
instance, not two. Then navigated (client-side, no reload) to `/sales`:
`TillReceiptsPage`, loaded entirely from the `:5001` remote, rendered inside
the same tree with the same authenticated session — no redirect to `/login`,
same store state. That's the mechanism *and* the singleton, both confirmed
together.

**The cost this surfaced, not previously visible:** because `returns`' pages
render `AppRail`/`BottomNav` via `@pos/platform/ui`, and that bundles `Nav` →
the full registry → *every* module's lazily-loaded pages locally,
`TillReceiptsPage`'s own chunk in the remote build first measured at
**~1 MB / 238 kB gzip** — not the ~7.6 kB the first PoC round claimed (that
number was only true when `@pos/platform` was purely external and never
actually built). Fixed in the next round below — see "chrome ownership."

**Still open**, unchanged from the original list: SRI/signing, `/api/pos`
versioning, CI publish of the remote artifact, Tailwind CSS extraction (the
demo host and the remote still rely on the host's compiled stylesheet being
present), error boundaries/retry/telemetry around the dynamic `import()`,
and all of desktop/Tauri.

## Update: chrome ownership + a Rollup barrel gotcha (2026-09-05)

Closed the "~1 MB" problem from the previous round. Two separate fixes were
needed — the first was the actual design fix, the second was an unrelated
Rollup surprise found while measuring it.

**1. Host renders nav chrome, not the module.** `AppRail`/`BottomNav` need
the full module registry (to render links to every module) — a module
should never need that just to show its own content. New
`pos/src/components/cashier/CashierLayout.tsx` renders the chrome once, in
`pos/src/modules/renderRoutes.tsx` (host-only, never part of any remote
build) — `element={<Guard><CashierLayout>{node}</CashierLayout></Guard>}`
for every "root"-mount route, mirroring how `AdminLayout` already wraps the
`/admin` mount. `RegisterPage`, `HardwarePage`, `CustomersPage`, and
`TillReceiptsPage` went back to rendering only their own content — no more
`AppRail`/`BottomNav`/`OfflineStatusBanner`/`useAuthStore().logout` in any of
them. `@pos/platform/ui` no longer re-exports `Nav`/`AppRail`/`BottomNav`/
`OfflineStatusBanner` at all, specifically so a future module can't reach
for them and reintroduce the same coupling.

This is the general answer to "can a module bring its own UI, or must it use
the host's": a module can render **whatever it wants**, custom design system
included — nothing requires touching `@pos/platform/ui`. The only cost is
for a module that wants to look like *part of the app* (same nav chrome) —
that chrome has to come from the host wrapping the route, not from the
module importing it, or independent delivery isn't actually independent.

**2. The barrel didn't tree-shake — a real Rollup limitation, not a
mechanism problem.** Even after (1), `TillReceiptsPage`'s chunk was still
**~860 kB / 205 kB gzip** — barely smaller than before, because
`TillReceiptsPage` still imports `useDragScroll` from `@pos/platform/ui`,
and that barrel *also* re-exports `BarcodeScanner` (→ `html5-qrcode`,
~200 kB) — unused, but Rollup wasn't eliminating the unused re-export when
building a code-split library bundle. Traced with a temporary
`moduleParsed` debug plugin to confirm `html5-qrcode` was really being
pulled in through `ui.ts`, not through anything `returns` itself imports.
Fix: `"sideEffects": false` in `pos/package.json` — tells Rollup none of
this app's own source has import-time side effects, which is true (grepped
for bare side-effect-only imports; only `.css`, which Vite's own CSS
pipeline handles separately from JS tree-shaking either way) — and that was
enough for Rollup to drop the unused `BarcodeScanner`/`ProductPhotoField`/
`CustomerPicker` re-exports on its own. This is a general fix, not a
per-file workaround: it protects every current and future module that
imports one thing from a shared barrel.

**Result:** `TillReceiptsPage-*.js` is now **21.25 kB / 5.47 kB gzip** —
in line with the original ~7.6 kB claim. Re-ran the same Playwright check
from the previous round (mutate `useAuthStore` via a second
`import('@pos/platform')`, client-side nav to `/sales`) — still renders
correctly, same shared session, chrome now supplied by the host layout
instead of the module. Full verification: `npx tsc --noEmit`, `npm run
build`, `npm run build:cashier`, `npm test` (159 tests) all green,
confirming `sideEffects: false` didn't silently break anything relying on
import-time side effects in the default app.

## Update: Tailwind class coverage, verified (2026-09-05)

The "CSS" line under "What the PoC does NOT solve" above says the remote
ships no stylesheet and assumes the host's compiled Tailwind is present.
Checked what that actually means today: `tailwind.config.js`'s `content`
glob is `./src/**/*.{js,ts,jsx,tsx}` — since `returns`' source still lives
inside `pos/src/modules/returns` at build time, the host's own `npm run
build` already scans it when generating `dist/assets/*.css`, independent of
whether any *other* page happens to use the same classes. Verified this
empirically rather than trusting the glob on paper: extracted every
Tailwind-like token (`bg-`, `text-`, `sq-`, `lg:`, etc.) from `returns`'
source and confirmed all 106 of them are present in the built CSS.

This only holds because the module's source is co-located with the host's.
The day `returns` (or any future module) is built from outside `pos/src` —
a separate package, a separate repo — this breaks silently: a class used
only in that module and nowhere else in the host would never be generated,
and the failure mode is a missing style in production, not a build error.

Added `pos/scripts/check-module-css-coverage.mjs` to make this a checkable
fact instead of a thing to remember: run `npm run build` then
`npm run check:returns-css-coverage` (or point the script at any other
module dir) — it fails with the exact missing class names if the module
ever drifts out of coverage. Verified the failure path by temporarily
injecting a bogus class into `TillReceiptsPage.tsx` and confirming the
script catches it (exit 1, names the class), then reverting.

## Update: `stock` as the second module-remote (2026-09-05)

Applied the same pattern to a second, real module — not another PoC
fixture — to check the convention holds beyond `returns`. Picked `stock`
(`pos/src/modules/stock/`): web-only (no desktop/offline complication at
all), not core, and the largest non-core module (6 pages, ~1750 lines).

Two things made this cheaper than `returns`:
- All of `stock`'s routes are `mount: 'admin'`. `AdminLayout`
  (`pos/src/pages/admin/AdminLayout.tsx`) already renders `Nav`/sidebar
  chrome once via React Router's `<Outlet/>` — the chrome-ownership problem
  fixed for the cashier-root routes never existed for admin-mounted modules.
- `api`, `formatUah`/`uahInputToCents`, and `useDragScroll` were already
  reachable through `@pos/platform`/`@pos/platform/ui` (`stock`'s pages just
  hadn't been switched over yet, a leftover from before the platform split).

Moved `stock`'s 6 pages from `pos/src/pages/admin/stock/*` into
`pos/src/modules/stock/pages/*`, and `pos/src/components/ManageStockModal.tsx`
(used only by `StockHubPage`) into `modules/stock/components/` — mirroring
how `returns` owns `RefundSaleDialog`. One dependency didn't fit that
pattern: `pos/src/lib/gtinLookup.ts` is used by `StockActionPage` **and** by
the host's `SettingsPage` (GTIN-enrichment settings section), so it couldn't
move into the module. Added `pos/src/platform/gtin.ts` — same treatment as
`platform/money.ts` — so both the module and the host reach it through
`@pos/platform` instead of `stock` reaching past its own boundary into
`../../../lib/gtinLookup`.

New `vite.stock-remote.config.ts` mirrors `vite.returns-remote.config.ts`
exactly (same `external` list, same local `@pos/platform/ui` alias, same
no-`inlineDynamicImports` reasoning). `pos/src/modules/registry.ts` needed
**zero** edits — it already imported `stockModule` from `./stock/manifest`,
and that import path didn't change.

**Result:** built clean on the first attempt — no repeat of the
`BarcodeScanner`/barrel surprise from `returns`, because `stock` never
touches anything in `@pos/platform/ui` beyond `useDragScroll`. Per-page
remote chunks: `StockHubPage` 14.33 kB/4.04 kB gzip, `StockActionPage`
28.51 kB/6.36 kB gzip (the biggest page, 857 lines), the other four pages
between 1.5–7.4 kB/0.5–2.4 kB gzip. `npm run check:stock-css-coverage`
passed clean (109 classes, all present in the host's built CSS). Re-ran the
Playwright singleton check against `dist-remotes/stock` +
`VITE_MODULE_REMOTES=stock@http://localhost:5002/remote-entry.js`: after
mutating `useAuthStore` via a second `import('@pos/platform')` and
client-side navigation to `/admin/stock`, the remote-loaded `StockHubPage`
rendered inside the host's `AdminLayout`/`Outlet`/sidebar chrome, sharing
the same store instance — confirms the singleton-sharing and
chrome-ownership mechanisms both hold for a module that wasn't built
hand-in-hand with the PoC. Full verification: `npx tsc --noEmit`, `npm run
build`, `npm run build:cashier`, `npm test` (159 tests, unchanged — nothing
under `pos/src` currently has a test referencing the stock page components)
all green.

## Update: `@pos/platform` externalised in the *default* web build (2026-09-05)

Roadmap item #7. Everything above proved the singleton via
`vite.web-remote-demo.config.ts` — a throwaway variant that also pulled
vendor libs from `esm.sh` at runtime. This change makes the **default**
`npm run build` (`vite.config.ts` → `dist/`) the one that externalises
`react` / `react-dom` / `react-dom/client` / `react/jsx-runtime` /
`react-router-dom` / `zustand` / `@pos/platform` and boots through an
injected `<script type="importmap">`, with every shared chunk **self-hosted**
from `dist/assets/` (no third-party runtime dependency — folds in item #8).
The desktop/Tauri build (`vite.cashier.config.ts`) is untouched: it stays
fully bundled (CSP `script-src 'self'`, offline).

**Pipeline** (`npm run build`): `tsc --noEmit` → `scripts/build-vendor.mjs`
(repackages the installed CJS/ESM `node_modules` copies to six ESM vendor
chunks, each with the *other* vendors external — no network) → `vite build
--config vite.platform-remote.config.ts` (the `@pos/platform` chunk, already
existed) → `vite build` (default config; `rollupOptions.external` on
`command === 'build'` only, so `npm run dev` still bundles normally via the
`resolve.alias`) → `scripts/assemble-web-dist.mjs` (content-hashes the seven
shared chunks, copies them into `dist/assets/{vendor,platform}/`, injects the
import map into `dist/index.html` with `sha384` SRI per entry, writes
`dist/.importmap.json`).

**What building it surfaced** — `export * from '<cjs module>'` in a Rollup
`lib` build silently emits *nothing* for `react`, `react-dom`,
`react-dom/client`, `react/jsx-runtime` (their npm entries are
`module.exports = require('./cjs/…')`, which the CJS lexer can't see
through). The vendor stubs under `scripts/vendor-stubs/` therefore list the
named exports explicitly (React 18's public API is a fixed set; this is what
every CDN ESM build of React does). `react-router-dom` and `zustand` ship
real ESM, so `export *` works for them. Caught by the Playwright e2e suite
failing to render (`does not provide an export named 'createPortal'` etc.),
not by the build.

**The `useEnabledModules` trap** — `src/components/Nav.tsx` still imported
`useAuthStore` **and** `useEnabledModules` from local relative paths. Once
`@pos/platform` is an external chunk, the host bundle got a *second*,
never-bootstrapped copy of the auth store, so `Nav`'s module-visibility
filter always fell back to "show everything". Fixed by routing `Nav`
(and `main.tsx` / `cashier-main.tsx` / `CashierApp.tsx`) through
`@pos/platform`, and by `scripts/check-platform-boundary.mjs` +
`npm run check:platform-boundary` (no ESLint in `pos/`), which fails if any
file outside `src/platform/**` reaches for `useAuthStore` / `useCartStore` /
the offline-status store / `PosShellContext` / `useEnabledModules` by a
local path. Wired into `pos-tests.yml`.

**Result:** entry chunk `dist/assets/index-*.js` **472 kB / 146 kB gzip**
(react/router/zustand/`@pos/platform` no longer in it — verified: zero
`scheduler.production` / `__SECRET_INTERNALS` occurrences). Self-hosted
shared payload: vendors ~90 kB gzip (`react-dom` 49, `react-router-dom` 34,
`react` 3.4, `zustand` 1.9, jsx-runtime 0.7, client 0.2), `@pos/platform`
~73 kB gzip (`platform.js` + its async chunks; includes Dexie/axios/offline).
`vendor-dexie` (~32 kB gzip) is still emitted in the host bundle too —
`HardwarePage`/others import `../offline/db` directly rather than via
`@pos/platform`, so Dexie is currently duplicated host-side; harmless
(IndexedDB is the shared state, not the JS object), worth cleaning up later.

**Verified:** `npm run check:platform-boundary`, `npx tsc --noEmit`,
`npm test` (159), `npm run test:e2e` (8 Playwright specs, **no network
egress** — proves the vendors are self-hosted, not `esm.sh`), `npm run
build:cashier` (Tauri path unchanged) all green. Singleton smoke test from
the previous rounds re-run against `dist/` + a served `dist-remotes/returns`:
mutating `useAuthStore` via a second `import('@pos/platform')` updates the
already-rendered host UI, and client-side nav to `/sales` renders the remote
`TillReceiptsPage` with the same session.

**Still open** (unchanged): full artifact **signing** (#3 — only SRI here),
`/api/pos` **versioning** (#1), **CI publish** of remote artifacts (#2),
per-module **Tailwind CSS extraction** (#4), full **error-boundary / retry /
telemetry** around the module-remote `import()` (#5 — the vendor/platform
chunks are same-origin same-deploy, so their failure is the entry-chunk
failure class, accepted), and all of **desktop/Tauri**.

## Update: `products` as the 3rd module-remote + `import()` resilience (2026-09-06)

Roadmap #10 + #5.

**`products` migrated** — `src/pages/admin/ProductsPage.tsx` (935 lines, the
biggest single module page; uses photo upload + tag-colour UI) →
`src/modules/products/pages/`, `TagColorSwatches` (products-only) →
`src/modules/products/components/`. `src/modules/registry.ts` unchanged.
`pos/vite.products-remote.config.ts` mirrors the `stock`/`returns` configs;
`build:products-remote` / `serve:products-remote` (:5003) /
`check:products-css-coverage` added.

Two shared deps `ProductsPage` reached past the boundary for — same fix as
`stock`'s `platform/gtin.ts`:
- `pos/src/platform/urls.ts` re-exports `assetUrl` (`lib/urls` also holds
  build-time API-base plumbing a module must not import).
- `pos/src/platform/tag-colors.ts` re-exports the `lib/tagColors` tokens
  (shared with the host's `TagFolderTile`).

**The `ProductPhotoField` trap** — it's re-exported from `@pos/platform/ui`
(bundled *into* every remote that uses it) but imported `api` from
`../services/api` and `assetUrl` from `../lib/urls` by relative path. `stock`
never rendered it so `sideEffects:false` dropped it; `products` uses it, which
would have pulled a **second axios `api` instance** (own auth, own version
header) into the `products` remote chunk. Fixed by pointing `ProductPhotoField`
at `@pos/platform` (external in a remote build → the shared instance). No
cycle: `@pos/platform/index.ts` does not re-export `ui.ts`.

**Result** — `build:products-remote` clean on the first try. Remote chunk:
grep-verified **no `html5-qrcode`** (unused `BarcodeScanner` re-export dropped)
and **no second `axios`**. `check:products-css-coverage` passes. Playwright
singleton smoke against `dist-remotes/products` + `VITE_MODULE_REMOTES=products@…`
renders `/admin/products` from the remote inside the host `AdminLayout`/`Outlet`
with the shared auth store.

**`import()` resilience (#5)** — first `ErrorBoundary` in the app:
- `pos/src/modules/lazyWithRetry.ts` — `import()` with exponential backoff
  (2 retries). Used in the three module-remote manifests (`returns`, `stock`,
  `products`) and by `applyModuleRemotes()`'s boot-time descriptor fetch.
- `pos/src/components/RouteErrorBoundary.tsx` — wraps every lazy route in
  `renderRoutes.tsx`. A chunk 404 / render throw now shows
  "Не вдалося завантажити розділ «…»" with **Повторити** (soft remount), then
  **Перезавантажити застосунок** on a second failure (`React.lazy` caches a
  rejected import for the session), plus **На головну** — instead of a blank
  screen.
- `pos/src/modules/telemetry.ts` — `reportModuleEvent` (`remote_load_ok` /
  `_error` / `_fallback`, `route_render_error`) + `onModuleEvent` /
  `getModuleEventLog`. Replaces the raw `console.*` in `applyModuleRemotes`.
  No network sink — that's the seam #6 attaches to.

**Verified:** `check:platform-boundary`, `npx tsc --noEmit`, `npm test`
(167, +7), `npm run build`, `npm run build:cashier`, `npm run test:e2e` (8)
all green.

## Update: runtime version telemetry (2026-09-06)

Roadmap #6 — closes the loop #1 (versioning seam) and #5 (telemetry seam) left open.

**Every module carries a build version.** `pos/scripts/pkg-version.mjs` reads
`pos/package.json`; every Vite config (`vite.config.ts`, `vite.cashier.config.ts`,
`vite.{platform,returns,stock,products}-remote.config.ts`) stamps it as
`__POS_APP_VERSION__` → `POS_APP_VERSION` in `pos/src/platform/version.ts`
(`0.0.0-dev` under `vite dev`). `ModuleDescriptor` gained `version?`. Bundled
modules are stamped with `POS_APP_VERSION` at registration (`registry.ts`); a
**separately-built** remote reports **its own** build version because
`remote-entry.ts` now does `export const manifest = { ...<id>Module, version:
POS_APP_VERSION }` and the deep `../../platform/version` import is bundled locally
(only the `@pos/platform` barrel is externalised). Trade-off: `returns`/`products`
`remote-entry.js` is now a thin re-export facade over a sibling hashed chunk —
harmless, the whole `dist-remotes/<id>/` dir is served anyway.

**One `session_manifest` telemetry event per boot** —
`{ appVersion, apiClientVersion, modules: [{ id, version, source: 'bundled' |
'remote', url? }] }`. Emitted from `applyModuleRemotes()` on web (always, even
with `VITE_MODULE_REMOTES` unset) and `reportSessionManifest()` from
`cashier-main.tsx` on Tauri. The `/api/pos` version skew (`services/api.ts`) now
also emits `api_version_skew` into the same `reportModuleEvent` seam instead of
just a lone `console.warn`. `window.__POS_TELEMETRY__` = `{ log, subscribe }`
debug handle.

**Dormant network sink.** `pos/src/modules/telemetryBeacon.ts` forwards a
whitelist (`session_manifest`, `api_version_skew`, `remote_load_error` /
`_fallback`, `route_render_error` — never `remote_load_ok`) via
`navigator.sendBeacon` → `POST /api/pos/client-telemetry`
(`src/pos/routes/telemetry.routes.ts`: no auth, no module gate, no DB, 16 KiB
body cap, `logger.info` + `204`). **Off unless** `VITE_POS_TELEMETRY_BEACON=1`
or `localStorage['pos_telemetry_beacon']='1'` — symmetrical to
`POS_API_STRICT_VERSION`.

**Verified:** `check:platform-boundary`, `npx tsc --noEmit` (pos + root),
`npm test` (pos 177, +10; root `src/__tests__` +3 telemetry, pre-existing
DB-dependent failures unchanged), `npm run build` (`__POS_APP_VERSION__` folds to
`"1.0.4"`, no dangling identifier; import-map/SRI unaffected), `npm run
build:cashier`, `npm run build:{returns,stock,products,platform}-remote`,
`npm run test:e2e` (8) — all green.

## Update: per-store runtime remote registration (2026-09-06)

Roadmap #9 — the `id@url` list moves from the build-time `VITE_MODULE_REMOTES`
env to a **per-store setting**, editable by the owner in Settings.

**Storage** — `pos_stores.module_remotes jsonb` (`{ moduleId: url }`, migration
`016`), carried on `AuthResponse.store` / `StoreConfig` next to `enabled_modules`,
so it's in the cached `pos_auth` for free. Backend gate
(`src/pos/core/modules.ts`): `sanitizeModuleRemotes` keeps only known non-core
ids with `isAllowedRemoteUrl` values — `https://`, root-relative `/…`, or
`http://localhost|127.0.0.1[:port]/…`. `updateStore` jsonb-casts it
(`$N::jsonb` + `JSON.stringify`, like `customers.service.ts`).

**Resolution** — `pos/src/modules/moduleRemotesSource.ts` `resolveModuleRemotes(knownIds)`
runs pre-React: `VITE_MODULE_REMOTES` if set (build/QA override, wins), else
`JSON.parse(localStorage['pos_auth']).store.module_remotes`. Same client-side URL
filter as the backend (defence against a mangled cache; backend is the real
gate). `applyModuleRemotes()` iterates the resolved map instead of splitting an
env string — everything else (`importWithRetry`, `remote_load_*` telemetry,
`session_manifest`) unchanged.

**Apply timing** — boot only. `pos/src/modules/appliedRemotes.ts` records the
resolved intent; `useAuth.ts` compares each fresh server auth's
`store.module_remotes` to it and flips `moduleRemotesStale`, which `App.tsx`
surfaces as a dismissible "Перезавантажити" banner (web only). `SettingsPage`
shows the same prompt right after a save that changed the map. No auto-reload, no
mid-session lazy-component swap.

**Web only** — `cashier-main.tsx` never calls `applyModuleRemotes`; `useAuth`'s
staleness check early-returns when `isOfflinePosEnabled()`. Web `dist/index.html`
has no CSP meta, so a third-party remote origin loads there; the cashier keeps
`script-src 'self'` + offline and ignores the setting.

**Verified:** `check:platform-boundary`, `tsc --noEmit` (pos + root),
`npm test` (pos 186, +9), `npx vitest run src/__tests__/pos.modules.test.ts`
(+`sanitizeModuleRemotes`/`isAllowedRemoteUrl`), `npm run build` +
`build:cashier`, `npm run test:e2e` (8) — all green. `pos-store-settings.test.ts`
gains a `module_remotes` round-trip (DB-gated).

## Update: signed remote artifacts + verify before `import()` (2026-09-06)

Roadmap #3 — #9 made `import(url)` from a per-store DB setting real; #3 verifies
the artifact first. See `TechDocs/POS_MODULE_REMOTE_SIGNING.md` for the full
scheme, key handling, and residual risks.

- `scripts/sign-remote.mjs <id>` (folded into `build:<id>-remote`) → sibling
  `manifest.json` (`sha384` of every `*.js`, name-sorted, fixed key order) +
  `manifest.json.sig` (Ed25519 detached over the manifest bytes).
- `src/modules/remoteVerify.ts` `verifyRemoteEntry(url, moduleId)` — called by
  `applyModuleRemotes()` before `importWithRetry(import(url))`: fetch
  manifest+sig+entry, check `keyId` against `remoteSigningKeys.ts`,
  `crypto.subtle` Ed25519 verify, `sha384(remote-entry.js)` vs the signed map,
  `moduleId`/`entry` match. Throw → `remote_verify_error` +
  `remote_load_fallback` → bundled module kept.
- Key: deterministic **dev** key (fixed seed in the script — nothing secret in
  the repo, `build:*-remote` output loads out of the box); prod key from
  `POS_REMOTE_SIGNING_KEY` (CI). `--print-dev` / `--gen-prod` helpers.
- Escape hatch: `VITE_MODULE_REMOTES` + `VITE_MODULE_REMOTES_INSECURE=1` skips
  verify (env override only; the per-store path is always verified).
- Entry-only: sub-chunks trusted via content-hashed names in the signed
  manifest, not re-hashed on load (documented residual risk).

**Verified:** `check:platform-boundary`, `tsc --noEmit`, `npm test` (pos 193,
+7 — `remoteVerify.test.ts` + registry verify-path cases), `npm run build` /
`build:cashier` / `build:{returns,stock,products}-remote` (emit + sign),
`npm run test:e2e` (8), WebCrypto sign↔verify round-trip against the built
`dist-remotes/*` — all green.

## Update: per-module CSS extraction (2026-09-06)

Roadmap #4 — a remote no longer depends on the host having compiled its classes.

- **Shared layer split out** — `pos/src/styles/tokens.css` (new): the
  hand-written `.sq-*` / `.pos-*` classes, `:root` tokens, `@media print`,
  `@keyframes`, moved verbatim out of `src/index.css` (now just the three
  `@tailwind` directives). Framework-agnostic — imported by `main.tsx` /
  `cashier-main.tsx` next to `index.css`, and standalone enough to vendor.
- **Per-module utilities sheet** — `src/modules/remote-styles.css`
  (`@tailwind utilities;`), imported only by each `remote-entry.ts`. Each
  `vite.<id>-remote.config.ts` uses `scripts/module-tailwind.mjs` `moduleCss('<id>')`
  → Tailwind over just `src/modules/<id>/**` with `presets:[tailwind.config.js]`
  (theme → `sq-*` resolve) and `corePlugins.preflight = false`. Output
  `dist-remotes/<id>/style.css` (pinned via `assetFileNames`) — only the utilities
  that module uses, no reset, no globals.
- **Signed + verified + injected** — `sign-remote.mjs` now hashes `.css` too, so
  `manifest.files['style.css']` is covered by the Ed25519 signature.
  `verifyRemoteEntry` (`Promise<void>` → `Promise<{ styleCss? }>`) fetches
  `style.css`, sha384-checks it against the manifest, returns the text;
  `registry.injectModuleStyle(id, css)` appends one
  `<style data-module-remote="<id>">` before the first render (no FOUC). Bad /
  missing `style.css` → `remote_verify_error` → bundled fallback.
- `check:<id>-css-coverage` retargeted to `dist-remotes/<id>/style.css`
  (folds in `src/styles/tokens.css` so host-provided `.sq-*` classes aren't
  false positives).

Bundled path unchanged — `tokens.css` merges into the one host sheet on build;
`@tailwind utilities` over the full `content` glob still covers in-tree modules.

**Verified:** `check:platform-boundary`, `tsc --noEmit`, `npm test` (pos 198,
+5), `npm run build` / `build:cashier` (tokens present in the single sheet),
`build:{returns,stock,products}-remote` → `style.css` (utilities only, no
preflight, `sq-*` resolve to real hex) + `check:*-css-coverage` pass,
`npm run test:e2e` (8), live-served full verify chain incl. `style.css` hash —
all green.
