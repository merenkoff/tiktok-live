// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Version of the `/api/pos` contract this POS build expects. Sent on every
 * request as `X-POS-API-Version` (see `services/api.ts`); the backend
 * (`src/pos/version.ts`) currently only logs a skew, never rejects.
 *
 * Keep it at the current backend version. Bump it — together with
 * `src/pos/version.ts` — only when a feature module starts shipping on its own
 * cadence and a `/api/pos` change would break an older module build. Until
 * then every build is "v1" and the header is advisory. See
 * `TechDocs/POS_API_VERSIONING.md`.
 */
export const POS_API_CLIENT_VERSION = 2;

/**
 * Version of the `@pos/platform` / `@pos/platform/ui` **surface** this host
 * build exposes to runtime-loaded modules (roadmap #12 track 2,
 * `TechDocs/POS_MODULE_PLATFORM_VERSION.md`). A single integer.
 *
 * A module-remote's signed manifest carries `minHostPlatform` — the value this
 * constant had in the build the module was made from. A host whose
 * `PLATFORM_VERSION` is lower never imports that module: on the web
 * `verifyRemoteEntry` rejects it, on the desktop Rust refuses to download it and
 * the cache check refuses to serve it. That is what stops a module built against
 * a newer platform from failing to *link* (a `SyntaxError` on a missing export)
 * inside a till that has not updated in weeks.
 *
 * Bump it — by hand, +1 — whenever the surface changes in a way a module could
 * depend on: an export added or removed from either barrel, or a signature's
 * meaning changed. Internal refactors that keep the surface do not bump it.
 * `src/platform/surface.test.ts` pins the export set to a snapshot and refuses
 * to update it without a bump. Never bump `POS_API_CLIENT_VERSION` for this —
 * that is the `/api/pos` contract, a different thing.
 */
// 2 (2026-09-09): `useOfflineStatus`, `registerOfflineModules` — roadmap #12 track 3.
// 3 (2026-09-17): sales verticals — `useVertical` (the store's attribute
//     schema and units) and `AttributeFields` (the inputs built from it).
// 4 (2026-09-17): the sell-screen slot — `useSalesCatalog` plus the catalog
//     components a vertical module renders with (`ProductTile`,
//     `TagFolderTile`, `VariantPicker`, `CatalogTagBar`, `ScanWedge`).
// 5 (2026-09-17): `startOfflineRuntime` and `refusalText` — the two names the
//     cashier shell was still reaching relatively, i.e. through a second copy
//     of the offline runtime and its module-hooks registry.
// 6 (2026-09-17): the florist's bench groundwork. `useCartStore` gained
//     `addAssembled`, and — the reason this is a bump and not a no-op —
//     `setQty` and `remove` now take a line's `uid`, not a `variant_id`. The
//     snapshot test compares export NAMES, so it cannot see that; a module
//     built against 5 calling `setQty(123, 2)` would silently do nothing.
//     `CatalogItem` also carries `kind`/`stock_mode`/`components` now.
// 7 (2026-09-17): the florist's bench. `withLabour`, `priceOfComponents` and
//     `customBouquetLabel` — a vertical module prices a bouquet with the
//     host's arithmetic instead of a third copy of it — plus the
//     `CartLineComponent` / `AssembledLineInput` types `addAssembled` takes.
//     `ProductTile` also gained an optional `count` badge.
// 8 (2026-09-17): the bench's second ending — a bouquet made for the window.
//     `buildPriceTags` / `expandCopies` / `defaultCopies` / `triggerPrint` and
//     `PriceTagsPrintable`, so a vertical module prints the tag that ties the
//     flowers in the bucket to the card in the database. `triggerPrint`
//     especially: `window.print()` silently no-ops in WKWebView, and a module
//     that called it directly would work everywhere but on the shop's Mac.
// 9 (2026-09-17): the window's write-off. `api.writeOffShowcase` and
//     `CatalogItem.one_off` — the flag that tells a bouquet made at the bench
//     for one object from a catalogue bouquet assembled in batches, which are
//     otherwise both composite+own. A module built against 9 calling
//     `writeOffShowcase` on an older host would hit undefined, which is the
//     case this guard exists for.
// 10 (2026-09-17): the bouquet's photo. `api.uploadBouquetPhoto` and
//     `api.setShowcasePhoto` — staff-level, because `/uploads` is owner-only
//     and takes a picture for any product in the catalogue, which is a
//     different thing.
// 11 (2026-09-17): `api.saveBouquetRecipe` — the bench's third ending, keeping
//     a composition as a catalogue template instead of selling or displaying it.
// 12 (2026-09-18): `api.getFlowerAnalytics` — the florist's own numbers, read
// by the flowers module's admin page (фаза B7).
// 13 (2026-09-19): modifiers at the till (café, К2a). `useCartStore.addItem`
//     takes a third argument — the line's modifier ids and kitchen note — and
//     `CartLine` carries `modifiers` / `note`; the pure mirrors of the server's
//     arithmetic (`resolveLineModifiers`, `lineCaption`, `cartLineUid`,
//     `defaultModifierIds`, `needsModifierSheet`…) are exported so a module
//     never copies them; `@pos/platform/ui` gains `ModifierSheet`, `ProductTile`
//     an `onMore` corner action; `Coffee` joins the nav icons;
//     `VerticalPublicConfig.maxCompositionDepth` is on the wire.
// 14 (2026-09-21): `printPrecheck` — the pre-bill the `tables` module hands the
//     guests (К4h). The Tauri command stays the host's: a module that reached
//     `invoke` itself would bundle a second copy of the Tauri API and step
//     outside this contract entirely.
// 15 (2026-09-22): the purchase pack (К5b). `packOf` / `packToBase` /
//     `baseToPack` / `toBase` / `packHint` / `defaultPackMode` — how many base
//     units are in one bottle, and how a screen that types a quantity in
//     converts what the person typed BEFORE it leaves. Three modules need the
//     same arithmetic (`products`, `stock`, `stocktake`), so it is handed out
//     rather than compiled into each of them.
// 16 (2026-09-23): the tablet PWA (TechDocs/POS_PWA.md). `PosShell` gains a
//     third value, `'tablet'` — a module that tests `shell === 'cashier'` to
//     mean "the desktop till" is still right, one that tests `=== 'web'` to
//     mean "not the till" is not. `enableOfflineReads` / `isOfflineReadsEnabled`
//     / `offlineMode` join `isOfflinePosEnabled`: the tablet reads its mirror
//     but never queues a write, and `OfflineWriteError` is what a write with no
//     network throws there.
// 17 (2026-09-24): the glyph set replaces lucide (design/icons, drawn in the
//     style of Things). `@pos/platform/ui` re-exports every glyph — colour ones
//     on a 24 px grid, UI ones on 20 (with 16 px drawings) — and `Glyph` /
//     `GlyphProps` / `COLOR_GLYPHS` / `UI_GLYPHS`; `NAV_ICONS` keeps its keys
//     (stored in `nav_overrides` / `module_remotes`) but resolves to glyphs and
//     gains `ChefHat`, `Table`, `ShieldCheck`, `UtensilsCrossed`. A module that
//     drew lucide keeps working on this host — nothing it imported went away.
export const PLATFORM_VERSION = 17;

/**
 * Build version of this bundle — the host web/cashier build, or a module-remote
 * built from its own checkout. Stamped by every Vite config as
 * `__POS_APP_VERSION__` (`pos/scripts/pkg-version.mjs`, reads `package.json`);
 * `0.0.0-dev` under `vite dev`, where nothing is defined.
 *
 * Reported per module in the boot `session_manifest` telemetry event (roadmap
 * #6) so a version skew between the host and a runtime-loaded remote is visible.
 */
export const POS_APP_VERSION: string =
  typeof __POS_APP_VERSION__ === 'string' ? __POS_APP_VERSION__ : '0.0.0-dev';
