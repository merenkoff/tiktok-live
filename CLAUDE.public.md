# CLAUDE.md

Guidance for Claude Code — or any other coding agent, or a person — working in this repository.

## What this repository is

The open part of **The Live Shop**: the backend, the point-of-sale platform with its bundled modules, the desktop cashier, the retired LIVE admin and the marketing site. It is source-available under the OwnNet Source License 1.1 — read `LICENSE`, `NOTICE` and the licence section of `README.md` before reusing anything.

It is an **automatic export**. Development happens in a private monorepo (`merenkoff/liveshop`); every commit of its `main` is replayed here with the private paths removed and an `Exported-From:` trailer added. What follows from that:

- Nothing is committed to `main` here by hand — the export only fast-forwards, so a stray commit would stop it. A pull request opened here is applied in the source repository and arrives with the next export (inbound terms: `LICENSE`, section 6).
- In a commit message `merenkoff/liveshop#12` is a pull request of the source repository; a pull request of this repository made before the split is written `merenkoff/tiktok-live#399`.
- Comments and documents sometimes point at a design document under `TechDocs/` that is not here. Those stay with the private modules; where one is missing, the code and its tests are the reference.

### What is not here

The **online-only modules** — `pos/private-modules.json` is the list: the flowers, café and grocery verticals, `tables`, `debts`, `tiktok-live`, the two ПРРО cabinets (`fiscal-checkbox`, `fiscal-cashalot`) and their shared `fiscal-core` library. They reach a store as signed bundles named in `pos_stores.module_remotes`; the server routes, services and migrations they call are part of this backend.

- A store runs without them. The clothing vertical ships in the host, and a store whose own vertical module is missing falls back to its catalog (`resolveSalesCatalog`, `pos/src/modules/verticals.ts`).
- `npm run check:private-imports` (in `pos/`) keeps open code from importing a private module; go through `@pos/platform` instead.
- `pos/package.json` still names scripts for those bundles (`build:tables-remote`, …). Their Vite configs are not here, so they fail — that is expected. End-to-end specs that need a private bundle skip themselves.
- You can write a module of your own against `@pos/platform`: start from `TechDocs/POS_MODULE_REMOTE_POC.md` and `TechDocs/POS_MODULE_SLOTS.md`.

## Repo layout — separately deployed apps, one Postgres

- **root (`src/`)** — Fastify + TypeScript backend. Owns the database and serves the REST/WebSocket API for LIVE automation and for the POS. One replica by design (it mounts the uploads volume and keeps in-process caches and limiters): `TechDocs/POS_SINGLE_INSTANCE.md`.
- **`pos/`** — React + Vite SPA for the point of sale, with a Tauri 2 desktop shell («LiveShop POS») for an offline cashier and a tablet PWA for waiters. Own `package.json`.
- **`admin/`** — React + Vite SPA of the TikTok LIVE side. Retired: its login is a notice pointing at the POS. The code and its tests stay.
- **`site/`** — the marketing site (React + Vite + Tailwind, statically prerendered). Not a separate deployment: the `Dockerfile` builds it and the root API serves `site/dist`.

Each of `admin/`, `pos/` and `site/` has its own `node_modules` and dev server — `cd` into it (or use `npm --prefix`). Root `npm` scripts only touch `src/`.

## Commands

### Root backend (`src/`)
```bash
npm run dev          # tsx watch src/index.ts — API on :3000
npm run build        # tsc -> dist/
npm run typecheck
npm run lint
npm test             # vitest, src/__tests__ (needs Postgres)
npx vitest run src/__tests__/parser.test.ts
npm run pos:migrate  # apply the pos_* migrations
npm run pos:seed     # demo store, products and staff; prints the logins
npm run docker:deps  # local Postgres on :5433 (and Redis on :6380, which src/ does not use)
```

### POS (`pos/`)
```bash
npm run dev            # web (admin + cashier) on :3002, proxies the local API on :3000
npm run dev:cashier    # cashier-only entry on :3003 (the one Tauri opens)
npm run build          # tsc --noEmit && vite build -> dist/
npm run lint
npm test
npm run test:coverage  # gate: module platform + pure helpers ≥80 % lines, ≥70 % branches
npm run test:e2e:install && npm run test:e2e   # Playwright against `vite preview`, routes mocked
npm run tauri:dev      # the desktop window
```
`pos/TESTING.md` describes the test stack; `pos/UI_CASHIER.md` the UI conventions.

### Admin (`admin/`) and site (`site/`)
```bash
cd admin && npm run lint && npm test && npm run build
cd site && npm run dev      # :3005
cd site && npm run build    # client build, SSR build, prerender -> dist/
cd site && npm run sitemap:stamp   # after changing what a page says; commit sitemap-lastmod.json
```

### Running the POS locally
```bash
cp .env.example .env     # DB on localhost:5433
npm run docker:deps
npm run pos:migrate
npm run pos:seed         # store `demo`
npm run dev              # API :3000
cd pos && npm run dev    # http://localhost:3002
```
`vite dev` is enough while a store uses only bundled modules. A **runtime-loaded** module resolves `@pos/platform` through the import map that only a build has — for one, use `npm run build:local` and `npm run preview:local`. Mind the trap: a plain `npm run build` bakes `https://the-live.shop` into the shared platform chunk unless `VITE_API_BASE` is set, so a "local" build made that way talks to someone else's production. `build:local` points it at `http://localhost:3002`.

## Architecture, briefly

**LIVE automation** (`src/`): multi-tenant — each seller account has one settings row and at most one running session, held in memory by `SessionManager`. A TikTok comment is parsed (`parser.ts`), reserved (`reservations.ts`), completed through a Telegram bot, and shipped with a Nova Poshta label. Every per-seller setting lives in `user_settings`, never in the environment; environment variables are infrastructure only. Each route awaits its own auth — do not reintroduce a `preHandler` auth hook in `src/api.ts`.

**POS backend** (`src/pos/`): a Fastify plugin at `/api/pos` over `pos_*` tables. Sales are idempotent on `client_uuid`. What a store sells is its **vertical** (`pos_stores.vertical`, definitions in `src/pos/verticals/`): it decides the product attributes, the units and which module draws the catalog half of the sell screen. Every variant write goes through `normalizeVariant`, which derives the stored `label` — a client never sends one. Fiscal (ПРРО) adapters and all their credentials live in the backend (`src/pos/fiscal/`).

**Migrations**: the ordered list is `src/pos/migrations.ts` and nowhere else. The runner keeps no tracking table — **every file is re-applied on every container start**, and the API comes up only if that succeeds. So every migration must be re-runnable, and a later file may not break an earlier one's re-run. `src/__tests__/pos.migrations-idempotent.test.ts` is what remembers this.

**POS front end** (`pos/src/`): three entries sharing components and one store — web (`main.tsx`, everything incl. `/admin`), desktop (`cashier-main.tsx`, the only shell that writes offline: IndexedDB snapshot, local PIN check, an outbox that syncs), tablet (`tablet-main.tsx`, reads offline, writes online). `TechDocs/POS_DESKTOP.md` and `TechDocs/POS_PWA.md`.

**Modules**: features live under `pos/src/modules/*` behind a `ModuleDescriptor`; a store's `enabled_modules` and `module_remotes` decide what it runs. A module — bundled or loaded at runtime — sees the host only through `@pos/platform`, whose surface has a version (`PLATFORM_VERSION`, pinned by `pos/src/platform/surface.test.ts`; bump it when the barrel's exports change). Remote bundles are Ed25519-signed and verified before `import()`. `TechDocs/POS_MODULE_*.md` cover the mechanism, signing, slots, offline data and what a module may reach inside the desktop app.

**Site** (`site/`): one HTML template per page, prerendered at build time (crawlers do not run JavaScript). Everything it claims about the product comes from `src/lib/productFacts.ts`; JSON-LD is built in `src/lib/jsonLd/` and attached in `routes.tsx`, never rendered from a component.

**Releases**: both release workflows read the Actions variable `RELEASE_ROLE`. Here it is `mirror`: «POS Release» starts from an exported `pos-v*` tag, builds the installers and drafts the GitHub Release — it never commits or moves a tag; «Module Release» publishes only open modules.

## Conventions

- Backend: strict TypeScript, ESM throughout — relative imports carry `.js` even though the source is `.ts`.
- ESLint passes with zero warnings in every app and CI enforces it. `_`-prefixed names may be unused; `no-console` allows `warn`/`error` — in the backend use `logger` (`src/logger.ts`).
- Money is integer kopecks; quantities are whole units of the variant's `unit` (250 g is quantity 250).
- DB-backed tests share `src/__tests__/helpers/pos-fixtures.ts` (`createTestStore` / `dropTestStore`, `buildPosTestApp()`); migrations are applied once per run by `vitest.global-setup.ts`.
- A test that moves a row to «yesterday» moves it on the **store's** calendar (`AT TIME ZONE st.timezone`), never by 24 hours of UTC: on the day the clocks change a Kyiv day is 23 or 25 hours long.
- User-facing text of the POS and the site is Ukrainian; code and comments are English.

## Where to read more

`TechDocs/` holds the open design documents: the module platform (`POS_MODULE_*.md`), `POS_API_VERSIONING.md`, `POS_DESKTOP.md`, `POS_PWA.md`, `POS_LICENSING.md`, `POS_SUPER_ADMIN.md`, `POS_ONBOARDING.md`, `RAILWAY_POS.md` (deployment), `POS_CLOTHING.md`, `POS_CASH_ROUNDING.md`, the GTIN pipeline (`POS_GTIN_*.md`), and `guides/` — the owner's and cashier's manuals the site publishes. `TechDocs/archive/` is the single-user MVP's documentation, kept as history only.
