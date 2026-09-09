# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout — three independent apps, one Postgres

This repo actually contains **three separately-deployed apps** that share one Postgres database:

- **root (`src/`)** — Fastify + TypeScript backend. Owns the DB, serves the REST/WebSocket API for both LIVE automation and POS. Deployed as its own Railway service.
- **`admin/`** — React + Vite SPA for the TikTok LIVE side (session control, live logs). **Retired 2026-09-09**: its nickname-only login endpoint was removed and the login screen is now a notice pointing at the POS, whose `tiktok-live` module owns the broadcast desk (`/live`) and its settings (`/admin/live`). The code and its CI workflow stay; nothing can sign in. Talks to the root API.
- **`pos/`** — React + Vite SPA for the clothing-store point of sale, with a Tauri 2 desktop shell for an offline cashier kiosk. Own `package.json`, no CI workflow yet.

Each of `admin/` and `pos/` has its own `node_modules`, `tsconfig.json`, and dev server — always `cd` into the subdirectory (or use `npm --prefix`) before running its scripts. Root `npm` scripts only touch `src/`.

## Commands

### Root backend (`src/`)
```bash
npm run dev              # tsx watch src/index.ts — API on :3000
npm run build             # tsc -> dist/
npm start                 # node dist/index.js
npm run typecheck         # tsc --noEmit
npm run lint               # eslint src --ext .ts
npm test                   # vitest (root test suite, src/__tests__)
npx vitest run src/__tests__/parser.test.ts   # single test file
npx vitest run -t "name of test"              # single test by name

npm run pos:migrate       # tsx src/pos/migrate.ts — run pos_* migrations
npm run pos:seed          # tsx src/pos/seed.ts — demo store/products/staff PIN

npm run docker:deps       # docker compose up -d postgres redis (local infra only)
```
Local Postgres/Redis via `docker-compose up -d` expose Postgres on `5433` and Redis on `6380` (see `.env.example`), not the default ports.
CI: `.github/workflows/backend-tests.yml` runs `typecheck`, `lint` and `vitest run` against a `postgres:16` service on PRs/pushes touching `src/**`, `migrations/**` or the root build/test config. `vitest.global-setup.ts` applies the `pos_*` migrations to that DB; the LIVE-automation schema (`001_create_schema.sql`) is not needed because no test touches those tables.

### Admin SPA (`admin/`)
```bash
cd admin
npm run dev                # Vite dev server
npm run build               # tsc && vite build
npm run lint                 # eslint src --ext .ts,.tsx (legacy .eslintrc.cjs, eslint 8 + @typescript-eslint v8 — same stack as root and pos/)
npm test                     # vitest run
npm run test:watch
npm run test:coverage        # coverage gate: src/services & src/hooks ≥80% lines/fn/stmt, ≥70% branches
npm run test:e2e:install     # once: install Playwright Chromium
npm run test:e2e             # Playwright against `vite preview`, routes mocked
```
Also runnable from repo root: `npm run test:admin`, `npm run test:admin:coverage`.
CI: `.github/workflows/admin-tests.yml` runs lint, unit+coverage and e2e on PRs/pushes touching `admin/**`.

### POS SPA + desktop (`pos/`)
```bash
cd pos
npm run dev                  # web (admin+cashier), :3002, proxies local API :3000
npm run dev:cashier           # cashier-only entry, :3003 (same entry Tauri opens)
npm run build                 # tsc --noEmit && vite build -> dist/
npm run build:cashier          # -> dist-cashier/
npm run lint                   # eslint src --ext .ts,.tsx (legacy .eslintrc.cjs, eslint 8 + @typescript-eslint v8)
npm run tauri:dev              # opens Tauri window (runs dev:cashier itself)
npm run tauri:build            # native installer -> pos/src-tauri/target/release/bundle/
npm test                       # vitest run
npm run test:watch
npm run test:coverage          # coverage gate: narrow include (module platform + pure helpers) ≥80% lines/fn/stmt, ≥70% branches
npm run test:e2e:install       # once: install Playwright Chromium
npm run test:e2e               # Playwright against `vite preview`, routes mocked
```
Also runnable from repo root: `npm run test:pos`, `npm run test:pos:coverage`.
CI: `.github/workflows/pos-tests.yml` runs lint, unit+coverage and e2e on PRs/pushes touching `pos/**`.
All three apps lint with the same stack — legacy `.eslintrc.*`, eslint 8 + `@typescript-eslint` v8 (root: `.eslintrc.json`; `admin/` and `pos/`: `.eslintrc.cjs` with the React-hooks/refresh plugins). See `pos/TESTING.md` for the test stack, P0 list and mocking notes.

## Architecture

### Multi-tenant LIVE automation (root `src/`, `admin/`)

The system is **multi-user**, not single-stream: each `User` (a TikTok seller account) has one `UserSettings` row and can run one `Session` at a time. `SessionManager` (`src/sessions/sessions.manager.ts`) keeps an in-memory `Map<user_id, ActiveSession>` holding the live TikTok connector and Telegram bot instance for that user; `sessions.controller.ts` exposes start/stop over HTTP, and `src/api/websocket.ts` streams `SessionLog`s to the admin UI live. Auth for this side is in `src/core/auth.ts`.

Order flow per session: TikTok comment → `parser.ts` (regex product-code/size extraction, EN/UK/RU) → `reservations.ts` (ACID reservation, race-safe, scoped by `user_id`) → `telegram/telegram.instance.ts` bot collects customer details → `orders.ts` → admin confirms payment → `novaposhta.ts` generates a TTN and notifies the customer. A cron job in `src/index.ts` marks expired reservations `expired` every minute; a daily one there also prunes `pos_gtin_lookup_events` past `GTIN_EVENTS_RETENTION_DAYS`, keeping owner corrections.

**All LIVE per-seller configuration lives in `user_settings`, never in the environment** — Telegram bot token/channel, Nova Poshta key/merchant name, and the reservation hold time. The admin SPA's Settings page writes them; `sessionManager.startSession` snapshots the row into the in-memory `ActiveSession` and passes it down to `TikTokInstance` / `TelegramInstance` / `createNovaPoshtaClient`. That snapshot is deliberate: one broadcast runs on one consistent set of settings, and edits take effect only after a stop/start. The `tiktok-live` POS module resolves to the same `users` row through the auth bridge, so it sees exactly the same settings — there is no second copy. Env vars in this backend are infrastructure only (`DATABASE_URL`/`DB_*`, `AUTH_SECRET`, `API_PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, the POS `OPENDATABOT_*` keys, and `POS_SECRETS_KEY`); the single-user MVP's `TIKTOK_USERNAME` / `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHANNEL_ID` / `NOVAPOSHTA_*` / `RESERVATION_TIMEOUT_MINUTES` are gone, along with the `src/tiktok.ts` and `src/telegram.ts` singletons that read them.

Routes in `src/api.ts` each `await` auth themselves via the local `requireAuth` helper (same pattern as the settings/sessions/POS controllers) and scope their queries by `userId`. Do not reintroduce a `preHandler` auth hook there: the previous one enforced nothing, because it was registered inside `fastify.register(...)` (so its scope covered no routes) and called `ensureAuth` without awaiting.

**Note:** `TechDocs/archive/` holds the design + onboarding docs for the earlier single-user/single-stream MVP (`ARCHITECTURE.md`, `PROJECT_SUMMARY.md`, `IMPLEMENTATION_GUIDE.md`, `START_HERE.md`, `FILE_MANIFEST.md`, `QUICKSTART.md`, `DEPLOYMENT.md`, `fix-instructions.md` — all moved out of the repo root 2026-09-06). They include an `inventory` table that does not exist and predate multi-tenancy, the POS subsystem and the Railway deploy. Treat them as historical notes — `TechDocs/archive/README.md` explains the drift, `TechDocs/NOTES.md` tracks known drift. Prefer reading `src/core/types.ts` and the service files directly. The only current root docs are `README.md`, this file, and `ИНСТРУКЦИЯ.md` (Russian operator guide).

### POS (root `src/pos/`, `pos/`)

Independent subsystem sharing the same Postgres via `pos_*`-prefixed tables (migrations `002`–`024`). Backend is a Fastify plugin (`src/pos/pos.plugin.ts`) mounted at `/api/pos`, registered from `src/index.ts` alongside the LIVE routes; product photo uploads are served statically from `data/pos-uploads` under `/pos-uploads/*` (needs a persistent volume in prod — see `TechDocs/RAILWAY_POS.md`). Route surface (`src/pos/pos.controller.ts`) covers: owner/staff PIN auth, products/variants/tags, customers, stock (adjustments, low-stock, suppliers, stock documents with post/reverse), GTIN barcode lookup/enrichment/learning jobs (plus an owner repair surface over the shared `pos_gtin_cache` — `GET /gtin/cache`, `PATCH /gtin/:code` to correct an entry as `manual`, `DELETE /gtin/:code` to tombstone it, and a supplier price-list import on `/admin/gtin` that feeds `learn/batch` under the `supplier` source; see `TechDocs/POS_GTIN_ENRICHMENT.md`), sales (complete/void/refund, idempotent via `client_uuid`), analytics, and QR payment (`payment method 'qr'`; per-store settings on `pos_stores`; `POST /qr/invoice` proxies Opendatabot for the dynamic-mode QR, `POST /qr/webhook` is the HMAC-verified payment-confirmation callback + a daily `reconcileQrPayments` cron — needs `OPENDATABOT_QR_KEY` / `OPENDATABOT_QR_NAME`). Every `/api/pos` request/response carries an advisory `X-POS-API-Version` header (single integer per side: `src/pos/version.ts`, `pos/src/platform/version.ts`); a mismatch is logged, not rejected, unless `POS_API_STRICT_VERSION=1` — see `TechDocs/POS_API_VERSIONING.md`. `pos_stores.enabled_modules` / `pos_stores.module_remotes` drive the per-store feature-module set and per-module remote-bundle sources; a `module_remotes` value is a bare URL string (override a bundled module's code — web **and** the desktop cashier, which skips web-only modules) or a `ModuleRemoteEntry` object `{ url, title, routePath, nav, icon? }` declaring a new **online-only** module the desktop cashier downloads (roadmap #13). A host imports a remote only if its `PLATFORM_VERSION` (`pos/src/platform/version.ts`, the `@pos/platform` surface version, pinned by `src/platform/surface.test.ts` + `npm run platform:snapshot`) is ≥ the manifest's `minHostPlatform` — see `TechDocs/POS_MODULE_PLATFORM_VERSION.md`; bump it by hand when the barrel's exports change (2 since 2026-09-09). A module that keeps **its own offline data** declares `offline: { pendingCount, sync }` on its descriptor; the shell entries register those hooks via `registerOfflineModules` from `@pos/platform` and the offline runtime drives them after its own outbox — first such module is `stocktake` (`pos/src/modules/stocktake/`, till-side inventory count → draft `inventory` document via the staff-level `POST /api/pos/stock/counts`, idempotent on `client_uuid`, migration `025`); see `TechDocs/POS_MODULE_OFFLINE_DATA.md`. `POST /api/pos/client-telemetry` is a dormant module/version-skew sink. A cross-store **super admin** lives at `/super` on the POS web (`pos/src/super/`, routes `src/pos/routes/super.routes.ts`): password from env `POS_SUPER_PASSWORD` (≥ 12 chars, unset = page disabled), stateless 12 h token in the `X-POS-Super-Token` header, edits any store's `enabled_modules` / `module_remotes` through the same validation as the owner's `PATCH /store`, and re-points a module release URL across stores — see `TechDocs/POS_SUPER_ADMIN.md`. The module-remote architecture (feature modules under `pos/src/modules/*`, buildable as standalone runtime chunks that carry their own Tailwind CSS — shared `.sq-*`/token layer in `pos/src/styles/tokens.css` — Ed25519-signed via `pos/scripts/sign-remote.mjs` and verified before `import()`; on the Tauri cashier downloaded + verified in Rust and served from an on-disk cache via the `liveshopmodule://` URI scheme) is documented in `TechDocs/POS_MODULE_REMOTE_POC.md` / `POS_MODULE_REMOTE_ROADMAP.md` / `POS_MODULE_REMOTE_SIGNING.md`; what a runtime-loaded module can reach inside the Tauri cashier (app commands are **not** ACL-gated, so the window's `capabilities/default.json` is a minimal one-permission set guarded by `npm run check:tauri-capabilities`) is `TechDocs/POS_MODULE_TAURI_CAPABILITIES.md`. The first real online-only module is **`tiktok-live`** ("Прямий ефір" — the TikTok LIVE comment feed + session start/stop inside the POS shell): source in `pos/src/modules/tiktok-live/`, built by `pos/vite.tiktok-live-remote.config.ts`, and reaching a store only through an object entry in `pos_stores.module_remotes` — the shell ships none of its code. It authenticates through the one deliberate POS→LIVE bridge, `POST /api/pos/live/session-token` (`src/pos/routes/live.routes.ts`), which swaps an authenticated POS session for a LIVE token minted from `pos_stores.live_tiktok_username` (migration `017`, owner-writable via `PATCH /store`); see `TechDocs/POS_LIVE_SELLING_MODULE.md`.

**Ukrainian ПРРО fiscalisation** is in progress — `TechDocs/POS_FISCAL_PRRO.md` is the design doc *and the resume point* (it carries a phase-progress table; update it as phases land). Shape: provider adapters and all credentials live in the backend (`src/pos/fiscal/`, migration `024`: `pos_fiscal_settings` / `pos_fiscal_shifts` / `pos_fiscal_receipts`, plus a denormalised `fiscal_status` on `pos_sales`/`pos_refunds`), the provider is a per-store setting, and each provider additionally gets its own online-only UI bundle (`fiscal-checkbox`, …) owning just `/admin/fiscal` and `/fiscal`. Credentials are AES-256-GCM encrypted at rest by `src/pos/core/secrets.ts` (env `POS_SECRETS_KEY`, AAD binds the envelope to `storeId:provider`) and reported on the wire only as `secrets_set` — never echoed. Fiscal *results* (status, fiscal number, QR) are ordinary domain fields the host renders; there is deliberately **no** module-extends-module mechanism. The whole **backend** is now in place (phases 0–4): settings (`GET`/`PATCH /api/pos/fiscal/settings`, owner-only), the `FiscalProvider` adapter contract + error taxonomy (`src/pos/fiscal/{types,errors,mapping,rateLimit}.ts`), the shift lifecycle (`shifts.service.ts` + a `*/5` auto-close cron), the document ledger (`ledger.ts`) and checkout orchestration (`fiscal.service.ts`, wired from `checkout.routes.ts`, + a `*/2` retry cron). **No real provider adapter exists yet** (`providers/index.ts`'s `BUILT_IN` is empty), so the whole thing is dormant — and a store that enabled fiscalisation before an adapter ships would 503 on every sale, so check `select store_id from pos_fiscal_settings where enabled` is empty before deploying. Two rules that are easy to get backwards: the provider owns the shift and `pos_fiscal_shifts` is a mirror; and a committed sale is voided **only** when the document cannot exist at the provider (`mayExistAtProvider`) — voiding on an ambiguous timeout double-fiscalises the cashier's re-ring. The client (phase 5) is in too: the till distinguishes three checkout outcomes (503 wrote nothing / 502 voided the sale / 502 kept it — the last is a **success** screen with a warning, because the customer paid and left), a fiscalising store refuses to queue an offline sale (`OfflineFiscalError`) and probes idempotently on a timeout (`FiscalSaleUnknownError`), the offline outbox gained a terminal `'dead'` status with backoff measured from the last attempt, and `pos/src/pages/admin/FiscalSettingsCard.tsx` owns the ПРРО switch. Still missing before a store can actually fiscalise: a provider adapter (phase 2b) and its UI bundle (phase 6). Receipt printing (phase 8a) follows `pos_fiscal_settings.receipt_source`: `'local'` prints our ESC/POS layout plus a fiscal block (number, date, tax-office QR via the printer's native `GS ( k`); `'provider'` prints the provider's own text, fetched once at fiscalisation time at the store's `receipt_width` (32 = 58mm, 48 = 80mm, migration `026`) and stored as `pos_fiscal_receipts.receipt_text`. The till decides by presence of `receipt_text` only — a failed text fetch (`attachProviderReceiptText` in `fiscal.service.ts`, own 2.5s sub-budget, never fails the document) silently falls back to the local layout.

Frontend (`pos/src/`) has **two entry points sharing the same components/pages/Zustand store**:
| | Web | Desktop (Tauri) |
|---|---|---|
| HTML/entry | `index.html` / `main.tsx` | `cashier.html` / `cashier-main.tsx` |
| Router | `BrowserRouter` | `HashRouter` |
| Routes | full SPA incl. `/admin` | only `/login`, `/register`, `/customers` |
| Shell context | `PosShellContext = 'web'` | `'cashier'` |

`pos/src/shell.tsx` is the context that branches shell-specific behavior. The desktop cashier is the **only** offline-capable surface (`pos/src/offline/`, IndexedDB via Dexie): it snapshots catalog/tags/customers on first online login, verifies PIN/password locally via a PBKDF2 verifier (never stores the raw PIN), queues sales/customer writes while offline, and syncs (customers first, then sales) once a JWT and network are available. Web admin always talks to the API directly — no offline path there. `VITE_API_BASE` is baked in at build time (`pos/src/lib/urls.ts`); the desktop build defaults to the production API (`https://the-live.shop`) unless overridden via `pos/.env`. See `TechDocs/POS_DESKTOP.md` for the full offline/sync/CORS/kiosk story and `TechDocs/RAILWAY_POS.md` for deployment.

Design tokens/UI conventions for the POS UI — including price-tag printing to a receipt roll — are documented in `pos/UI_CASHIER.md`; discount/customer rules in `TechDocs/POS_DISCOUNTS_AND_CUSTOMERS.md`; GTIN enrichment pipeline — including the canonical GTIN-14 cache key and the sticky-`manual` merge rule — in `TechDocs/POS_GTIN_ENRICHMENT.md` / `POS_GTIN_SETUP.md` / `POS_GTIN_LEARNING_API.md`.

### CORS

`CORS_ORIGINS` (comma-separated, no trailing slash) env var on the API service allowlists POS/admin web origins. The Tauri desktop cashier's origins (`https://tauri.localhost`, `http://tauri.localhost`) are hardcoded in `src/api.ts`, not env-driven.

## Conventions

- Root backend is strict TypeScript (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` all on) compiled with `tsc`; ESM throughout (`"type": "module"`, `.js` extensions in relative imports even though source is `.ts`).
- ESLint: all three apps share one ruleset — `@typescript-eslint/no-unused-vars` warns and allows `_`-prefixed names, `no-explicit-any` is off, `no-console` allows `warn`/`error` only (root CLI scripts `src/pos/{migrate,seed}.ts` + `gtin/seed-from-dump.ts` override it off; in the rest of the backend use `logger`, `src/logger.ts`, Winston). `admin/` and `pos/` add the `react-hooks` (error) / `react-refresh` (warn) plugins. `npm run lint` passes with zero warnings in all three and is enforced in CI.
- Admin SPA has a real test suite (Vitest + Testing Library + MSW for HTTP mocks, class-mocked WebSocket, Playwright for e2e) — when touching `admin/src/services` or `admin/src/hooks`, keep coverage above the gate. See `admin/TESTING.md` for what's considered P0.
- Root backend tests (`src/__tests__/`) are mostly POS-focused (crypto, money, GTIN normalization/orchestration, sales logic, stock race conditions, stock reports/documents, tags, the products/customers/suppliers/uploads/auth services, and the whole `/api/pos` route surface) plus the order parser. `vitest.config.ts` scopes the root suite to `src/__tests__` — without it vitest's default glob also picks up `admin/` and `pos/`.
- DB-backed tests run against the database in `.env` and share `src/__tests__/helpers/pos-fixtures.ts`: `applyPosMigrations()`, per-file store isolation (`createTestStore` / `dropTestStore`), and `buildPosTestApp()` for driving the real Fastify POS plugin through `app.inject()`. Migrations are applied once per run by `vitest.global-setup.ts`; the ordered list lives in `src/pos/migrations.ts` and is shared with `npm run pos:migrate` — add new migrations there and nowhere else.
