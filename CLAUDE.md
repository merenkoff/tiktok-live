# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout — three independent apps, one Postgres

This repo actually contains **three separately-deployed apps** that share one Postgres database:

- **root (`src/`)** — Fastify + TypeScript backend. Owns the DB, serves the REST/WebSocket API for both LIVE automation and POS. Deployed as its own Railway service.
- **`admin/`** — React + Vite SPA for the TikTok LIVE side (session control, live logs). Talks to the root API. Own `package.json`, own test suite, own CI workflow.
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

Order flow per session: TikTok comment → `parser.ts` (regex product-code/size extraction, EN/UK/RU) → `reservations.ts` (ACID reservation with 5-min auto-expiry, race-safe) → `telegram.ts` bot collects customer details → `orders.ts` → admin confirms payment → `novaposhta.ts` generates a TTN and notifies the customer. A cron job in `src/index.ts` sweeps expired reservations every minute.

**Note:** `TechDocs/archive/` holds the design + onboarding docs for the earlier single-user/single-stream MVP (`ARCHITECTURE.md`, `PROJECT_SUMMARY.md`, `IMPLEMENTATION_GUIDE.md`, `START_HERE.md`, `FILE_MANIFEST.md`, `QUICKSTART.md`, `DEPLOYMENT.md`, `fix-instructions.md` — all moved out of the repo root 2026-09-06). They include an `inventory` table that does not exist and predate multi-tenancy, the POS subsystem and the Railway deploy. Treat them as historical notes — `TechDocs/archive/README.md` explains the drift, `TechDocs/NOTES.md` tracks known drift. Prefer reading `src/core/types.ts` and the service files directly. The only current root docs are `README.md`, this file, and `ИНСТРУКЦИЯ.md` (Russian operator guide).

### POS (root `src/pos/`, `pos/`)

Independent subsystem sharing the same Postgres via `pos_*`-prefixed tables (migrations `002`–`016`). Backend is a Fastify plugin (`src/pos/pos.plugin.ts`) mounted at `/api/pos`, registered from `src/index.ts` alongside the LIVE routes; product photo uploads are served statically from `data/pos-uploads` under `/pos-uploads/*` (needs a persistent volume in prod — see `TechDocs/RAILWAY_POS.md`). Route surface (`src/pos/pos.controller.ts`) covers: owner/staff PIN auth, products/variants/tags, customers, stock (adjustments, low-stock, suppliers, stock documents with post/reverse), GTIN barcode lookup/enrichment/learning jobs, sales (complete/void/refund, idempotent via `client_uuid`), analytics, and QR payment (`payment method 'qr'`; per-store settings on `pos_stores`; `POST /qr/invoice` proxies Opendatabot for the dynamic-mode QR, `POST /qr/webhook` is the HMAC-verified payment-confirmation callback + a daily `reconcileQrPayments` cron — needs `OPENDATABOT_QR_KEY` / `OPENDATABOT_QR_NAME`). Every `/api/pos` request/response carries an advisory `X-POS-API-Version` header (single integer per side: `src/pos/version.ts`, `pos/src/platform/version.ts`); a mismatch is logged, not rejected, unless `POS_API_STRICT_VERSION=1` — see `TechDocs/POS_API_VERSIONING.md`. `pos_stores.enabled_modules` / `pos_stores.module_remotes` drive the per-store feature-module set and per-module remote-bundle sources; a `module_remotes` value is a bare URL string (override a bundled module's code — web) or a `ModuleRemoteEntry` object `{ url, title, routePath, nav, icon? }` declaring a new **online-only** module the desktop cashier downloads (roadmap #13). `POST /api/pos/client-telemetry` is a dormant module/version-skew sink. The module-remote architecture (feature modules under `pos/src/modules/*`, buildable as standalone runtime chunks that carry their own Tailwind CSS — shared `.sq-*`/token layer in `pos/src/styles/tokens.css` — Ed25519-signed via `pos/scripts/sign-remote.mjs` and verified before `import()`; on the Tauri cashier downloaded + verified in Rust and served from an on-disk cache via the `liveshopmodule://` URI scheme) is documented in `TechDocs/POS_MODULE_REMOTE_POC.md` / `POS_MODULE_REMOTE_ROADMAP.md` / `POS_MODULE_REMOTE_SIGNING.md`; what a runtime-loaded module can reach inside the Tauri cashier (app commands are **not** ACL-gated, so the window's `capabilities/default.json` is a minimal one-permission set guarded by `npm run check:tauri-capabilities`) is `TechDocs/POS_MODULE_TAURI_CAPABILITIES.md`.

Frontend (`pos/src/`) has **two entry points sharing the same components/pages/Zustand store**:
| | Web | Desktop (Tauri) |
|---|---|---|
| HTML/entry | `index.html` / `main.tsx` | `cashier.html` / `cashier-main.tsx` |
| Router | `BrowserRouter` | `HashRouter` |
| Routes | full SPA incl. `/admin` | only `/login`, `/register`, `/customers` |
| Shell context | `PosShellContext = 'web'` | `'cashier'` |

`pos/src/shell.tsx` is the context that branches shell-specific behavior. The desktop cashier is the **only** offline-capable surface (`pos/src/offline/`, IndexedDB via Dexie): it snapshots catalog/tags/customers on first online login, verifies PIN/password locally via a PBKDF2 verifier (never stores the raw PIN), queues sales/customer writes while offline, and syncs (customers first, then sales) once a JWT and network are available. Web admin always talks to the API directly — no offline path there. `VITE_API_BASE` is baked in at build time (`pos/src/lib/urls.ts`); the desktop build defaults to the production API (`https://the-live.shop`) unless overridden via `pos/.env`. See `TechDocs/POS_DESKTOP.md` for the full offline/sync/CORS/kiosk story and `TechDocs/RAILWAY_POS.md` for deployment.

Design tokens/UI conventions for the POS UI are documented in `pos/UI_CASHIER.md`; discount/customer rules in `TechDocs/POS_DISCOUNTS_AND_CUSTOMERS.md`; GTIN enrichment pipeline in `TechDocs/POS_GTIN_ENRICHMENT.md` / `POS_GTIN_SETUP.md` / `POS_GTIN_LEARNING_API.md`.

### CORS

`CORS_ORIGINS` (comma-separated, no trailing slash) env var on the API service allowlists POS/admin web origins. The Tauri desktop cashier's origins (`https://tauri.localhost`, `http://tauri.localhost`) are hardcoded in `src/api.ts`, not env-driven.

## Conventions

- Root backend is strict TypeScript (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` all on) compiled with `tsc`; ESM throughout (`"type": "module"`, `.js` extensions in relative imports even though source is `.ts`).
- ESLint: all three apps share one ruleset — `@typescript-eslint/no-unused-vars` warns and allows `_`-prefixed names, `no-explicit-any` is off, `no-console` allows `warn`/`error` only (root CLI scripts `src/pos/{migrate,seed}.ts` + `gtin/seed-from-dump.ts` override it off; in the rest of the backend use `logger`, `src/logger.ts`, Winston). `admin/` and `pos/` add the `react-hooks` (error) / `react-refresh` (warn) plugins. `npm run lint` passes with zero warnings in all three and is enforced in CI.
- Admin SPA has a real test suite (Vitest + Testing Library + MSW for HTTP mocks, class-mocked WebSocket, Playwright for e2e) — when touching `admin/src/services` or `admin/src/hooks`, keep coverage above the gate. See `admin/TESTING.md` for what's considered P0.
- Root backend tests (`src/__tests__/`) are mostly POS-focused (crypto, money, GTIN normalization/orchestration, sales logic, stock race conditions, stock reports/documents, tags, the products/customers/suppliers/uploads/auth services, and the whole `/api/pos` route surface) plus the order parser. `vitest.config.ts` scopes the root suite to `src/__tests__` — without it vitest's default glob also picks up `admin/` and `pos/`.
- DB-backed tests run against the database in `.env` and share `src/__tests__/helpers/pos-fixtures.ts`: `applyPosMigrations()`, per-file store isolation (`createTestStore` / `dropTestStore`), and `buildPosTestApp()` for driving the real Fastify POS plugin through `app.inject()`. Migrations are applied once per run by `vitest.global-setup.ts`; the ordered list lives in `src/pos/migrations.ts` and is shared with `npm run pos:migrate` — add new migrations there and nowhere else.
