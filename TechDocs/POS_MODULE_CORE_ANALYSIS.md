# POS module-remote — core / cashier module analysis (roadmap #11)

Research spike, not implementation. Question: which of the not-yet-extracted
modules can be made into real, self-contained modules (own folder, own
`manifest`, `check-platform-boundary` clean), and what stops the rest.

## TL;DR

- **Runtime-remote is off the table for every cashier-facing module.** The Tauri
  shell is offline-first with CSP `script-src 'self'` — you cannot `import(url)`
  when offline and CSP forbids the external script (that's #12, "won't do"). So
  #11's only payoff is *code organization*: modules that stay **bundled** but
  have an honest boundary.
- **Cheap wins:** `qr-payment`, `live-selling` (no code), `customers` (needs one
  new `@pos/platform` re-export). ~0.5–1 day total.
- **Leave as platform-core:** `catalog-checkout` (it *is* the cashier platform),
  `hardware` (irreducibly Tauri-native), `settings` (drives the toggles).
- **Right mental model:** `@pos/platform` + a bundled cashier core
  (`catalog-checkout` + `hardware`) + independently-deliverable **web/admin**
  feature modules. The module-remote mechanism is an admin-features delivery
  tool, not a cashier one — that was always the realistic ceiling.

## Where these modules stand today

`stock` / `returns` / `products` were physically moved into
`src/modules/<id>/{pages,components,hooks}` and rewired to import only from
`@pos/platform`. The remaining six are **manifest-only shells** pointing at pages
still under `src/pages/`:

| module | page | shells | flags |
|---|---|---|---|
| `catalog-checkout` | `src/pages/register/RegisterPage.tsx` (eager) | web, cashier | `core` |
| `customers` | `src/pages/customers/CustomersPage.tsx` | web, cashier | defaultEnabled |
| `hardware` | `src/pages/HardwarePage.tsx` | cashier | `core`, `coreInShell: cashier` |
| `settings` | `src/pages/admin/SettingsPage.tsx` | web | `core`, ownerOnly |
| `qr-payment` | — (feature gate only) | web, cashier | defaultEnabled |
| `live-selling` | — (reserved slot) | web, cashier | off |

## The two blockers

### A. Offline / Dexie surface (`src/offline/`, ~1200 LOC)

`repository.ts` (557 — Dexie schema, catalog/customer snapshot, sale/customer
write queue), `sync.ts`, `auth-local.ts` (PBKDF2 local PIN verifier), `db.ts`
(Dexie instance + `meta`), `cashierApi.ts`, `photos.ts`, `catalog-filter.ts`.

`cashierApi` is a **clean facade** — every method is
`isOfflinePosEnabled() ? repo.X() : api.X()`. `catalog-checkout` and `customers`
call `cashierApi.*` (not raw `api.*`) so writes queue offline.

`@pos/platform` already re-exports part of the offline layer via
`src/platform/offline.ts`: `isOfflinePosEnabled`, `getMeta` / `setMeta`,
`OfflineAuthError` / `OfflineRefundError`. **The only gap is `cashierApi`
itself** — 3 files reach for it by relative path:
`RegisterPage.tsx`, `CustomersPage.tsx`, `components/cashier/CustomerPicker.tsx`
(the last is already exported from `@pos/platform/ui`).

Adding `export { cashierApi } from '../offline/cashierApi'` to
`platform/offline.ts` closes the boundary for `customers` and most of
`catalog-checkout`'s data path. Cost: it pulls `repository.ts` + Dexie into the
`@pos/platform` graph — but Dexie already ships in the web build
(`dist/assets/vendor-dexie-*.js`, because `catalog-checkout` is `shells:['web']`
and eager), so there's no new byte cost, only a firmer "offline lives in the
shared layer" stance.

### B. Tauri-native

`@tauri-apps/plugin-opener` (`HardwarePage`), `@tauri-apps/api/core` `invoke()`
in `lib/printer.ts`, `lib/hardware.ts`, `lib/updates.ts`. Reachable only from
`hardware` and the receipt-print path of `catalog-checkout`. These are `invoke`
stubs — they don't run on web at all. Not portable, not remoteable, by nature.

## Per-module verdict

| module | separable as a bundled module? | effort | worth it? |
|---|---|---|---|
| `qr-payment` | yes — no code, just the descriptor; logic already lives as feature checks in `CheckoutModal` / `SettingsPage` | ~1 h | marginal (tidiness) |
| `live-selling` | yes — reserved empty slot | ~0 | already is |
| `customers` | yes, **after** `cashierApi` joins `@pos/platform`; small page, 3 imports (`services/api`→barrel, `cashierApi`→barrel, `useDragScroll`→`@pos/platform/ui`); dual-mounted (cashier + admin) | ~0.5 day | modest — honest boundary, still bundled |
| `settings` | yes technically (`services/api`→barrel is the only non-platform import) | ~2 h | **no** — `core`, and it renders the module checklist itself |
| `hardware` | dir move + rewire possible, but every dep is Tauri `invoke` / `offline/db` | ~0.5 day | **no** — irreducibly desktop; nothing to gain |
| `catalog-checkout` | not really — 15 local imports: `cashierApi`, `offline/db`, `lib/printer`, `lib/receipt`, `usePrintableReceipt`, 7 `components/cashier/*`, cross-module `modules/returns` (`useCancelRungSale`). `core`, eager, both shells | 2–4 days, **mostly boundary-definition** not mechanical | **no** — this is the definition of the cashier platform |

The `components/cashier/*` that `RegisterPage` uses (`ProductTile`,
`TagFolderTile`, `SaleSidebar`, `VariantPicker`, `MobileCartSheet`) only import
`lib/{money,urls,tagColors}`, `hooks/useDragScroll`, `types` — all already in
`@pos/platform` / `@pos/platform/ui`. So the *component* rewiring is the same
mechanical work as the earlier migrations; it's the **`catalog-checkout` ↔
offline ↔ cart ↔ returns** knot that isn't a "module" boundary, it's the core.

## Recommendation

1. **Do the cheap, low-risk tidy** if/when convenient (not urgent): add
   `cashierApi` to `platform/offline.ts`; move `customers` /
   `qr-payment` / `live-selling` into `src/modules/<id>/` for consistency with
   `stock` et al. Keeps `check-platform-boundary` meaningful for them. All stay
   bundled.
2. **Freeze `catalog-checkout` + `hardware` as platform-core.** Document them as
   "not modules in the deliverable sense" rather than chasing an extraction that
   only re-labels the same coupling.
3. **Stop here on the module-remote track for cashier.** The mechanism
   (#3/#4/#6/#9) is complete for its real audience: web/admin feature modules on
   independent cadence. The cashier stays a single offline bundle — which is the
   correct design, not a limitation to fix.

## Related

- `TechDocs/POS_MODULE_REMOTE_ROADMAP.md` — #11, #12 (desktop parity — won't do)
- `TechDocs/POS_MODULE_REMOTE_POC.md` — the extracted-module pattern
- `pos/src/platform/offline.ts` — current offline re-export surface
- `pos/src/offline/cashierApi.ts` — the online/offline facade
