# POS testing

## Stack

- **Unit / integration:** Vitest + jsdom + Testing Library + MSW
- **E2E:** Playwright (Chromium) against `vite preview` with `page.route` mocks
- **Coverage gate:** a deliberately narrow include (module platform + pure helpers) at
  lines/functions/statements ≥ 80%, branches ≥ 70% — see `vitest.config.ts`

## Commands

```bash
cd pos
npm test                 # vitest run
npm run test:watch       # watch mode
npm run test:coverage    # vitest + coverage thresholds
npm run test:e2e:install # once: install Chromium
npm run test:e2e         # Playwright smoke (builds + previews on :4173)
```

From repo root:

```bash
npm run test:pos
npm run test:pos:coverage
```

## What is P0

1. **Module registry invariants** — one descriptor per id, unique route paths per mount,
   core/default sets matching `src/modules/constants.ts` (`src/modules/registry.test.ts`)
2. **`enabled_modules` resolution** — server set unioned with the core ids, and the
   full-defaults fallback for an absent field (`src/modules/useEnabledModules.test.tsx`)
3. **Route gating** by shell / role / enabled set, plus the `/login` and catch-all
   redirects (`src/modules/renderRoutes.test.ts{,x}`)
4. **Nav filtering** — admin sidebar vs cashier rail vs bottom bar
   (`src/modules/selectNav.test.ts`, `src/components/Nav.test.tsx`)
5. **Money maths** — `formatUah`, `uahInputToCents`, cumulative `refundLineAmount`, and the
   refund receipt built on it (`src/lib/money.test.ts`, `src/lib/receipt.test.ts`)
6. **Cart reducers** — stock clamping, merge-on-rescan, cart-discount eligibility
   (`src/hooks/useCart.test.ts`)
7. **Offline seam** — catalog filtering (`src/offline/catalog-filter.test.ts`) and the
   local-mirror-vs-API delegation in `src/offline/cashierApi.test.ts`
8. **Auth persistence** — `saveAuth`/`loadAuth`/`hasLiveJwt` and the Bearer interceptor,
   including never sending an `offline:` token (`src/services/api.test.ts`)

The frontend/backend module lists are asserted against each other in
`src/modules/constants.test.ts` (cross-imports `../../../src/pos/core/modules`), and the
backend helpers themselves are covered by the root suite in `src/__tests__/pos.modules.test.ts`.

## Mocking notes

- **HTTP:** MSW handlers in `src/test/msw/handlers.ts` (unit) and `e2e/helpers.ts`
  (Playwright `page.route('**/api/pos/**')`).
- **API base:** `vitest.config.ts` forces `VITE_API_BASE=''` so `posApiBase()` returns the
  relative `/api/pos` that msw/node can intercept — `pos/.env` points at a local API and
  would otherwise leak into tests.
- **Native deps:** `src/test/setup.ts` globally mocks `@tauri-apps/api/core` and
  `html5-qrcode`; the registry eagerly reaches the till screen, which imports both.
- **Stores:** zustand stores (`useAuthStore`, `useCartStore`, `useUpdateStore`) are reset in
  `beforeEach`; drive them with `setState` instead of mocking the hooks.
- **Rendering:** `renderWithProviders(ui, { route, shell })` wraps in `PosShellContext` +
  `MemoryRouter`; fixtures (`makeAuthResponse`, `makeCatalogItem`, `makeSaleDetail`, …) live
  next to it in `src/test/utils.tsx`.

## CI

GitHub Action `.github/workflows/pos-tests.yml` runs unit + coverage and the Playwright
suite on PRs and pushes to `main` that touch `pos/**`.
