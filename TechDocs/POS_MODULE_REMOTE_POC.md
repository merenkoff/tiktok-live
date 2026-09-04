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
| Web-only, actually renders (host migrated to `@pos/platform`, working import map, fallback-to-bundled) | ~1 week |
| Web production rollout (versioning, CI publish, SRI, error handling, Tailwind extraction, telemetry) | ~2–4 weeks |
| Desktop parity (signed packages to `appDataDir`, `asset:` protocol loader, CSP change, offline) | ~3–6 weeks on top — recommend **not** doing this; ship desktop module changes through the existing whole-app Tauri updater instead |

Dominant risks: React / Router singleton management across the boundary;
Tailwind class ownership; **backend API-version skew** once a module releases
independently against one unversioned `/api/pos`.

## Recommendation

Keep the Steps 1–5 architecture (it is valuable on its own — per-store toggles,
smaller surface, clean seams, lazy chunks). Treat independent *delivery* as a
future option, not a commitment. If it becomes real: do the **web-only** import-map
route, gate it behind `VITE_MODULE_REMOTES`, and require `/api/pos` versioning
first. Leave the desktop cashier on the whole-app updater.
