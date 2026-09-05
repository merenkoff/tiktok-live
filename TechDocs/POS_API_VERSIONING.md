# `/api/pos` versioning

Status: **seam only, advisory.** This exists so a POS feature module released
on its own cadence (see `POS_MODULE_REMOTE_POC.md` / `POS_MODULE_REMOTE_ROADMAP.md`
item #1) is not silently talking to an unversioned backend. It is **not** a
negotiation scheme yet and is expected to change.

## How it works today

- **One integer per side:**
  - backend — `src/pos/version.ts` → `POS_API_VERSION` (currently `1`)
  - client — `pos/src/platform/version.ts` → `POS_API_CLIENT_VERSION` (currently `1`), also re-exported from `@pos/platform`
- Every `/api/pos/*` **response** carries `X-POS-API-Version: <n>`
  (`src/pos/pos.versioning.ts`, an `onRequest` hook scoped to the `/api/pos`
  prefix — nothing on the LIVE API is touched).
- Every request the POS client makes sends `X-POS-API-Version: <n>`
  (`pos/src/services/api.ts` request interceptor).
- On a mismatch the backend logs `POS API version skew` and **still serves the
  request**. The client logs one `[pos-api] version skew` warning to the
  console. No user-facing behaviour.
- `GET /api/pos/version` → `{ "version": 1 }`, no auth — a module-remote
  loader can preflight it before deciding whether its build is compatible.
- CORS: `X-POS-API-Version` is in `allowedHeaders` and `exposedHeaders`
  (`src/api.ts`) so the cross-origin POS deploy can send and read it.

## The dormant strict switch

`POS_API_STRICT_VERSION=1` on the API service flips a mismatched request header
from "log and serve" to `409 { error: "pos_api_version_mismatch", expected, got }`.
Off by default; there is intentionally no CI coverage of the 409 path beyond one
unit test — it's the lever to pull once real pinning lands, not a feature to
rely on now.

## When to bump the version

Leave both constants at `1` while modules still ship bundled with the host.

Bump them (backend first, then the client, or together) the **first time a
feature module is handed off for independent upgrades** and a `/api/pos` change
would break an older module build. At that point:

1. decide whether the change is actually breaking for a shipped module;
2. if yes: `POS_API_VERSION = 2`, update the client, note the delta in this
   file, and — when there are real out-of-tree modules — turn on
   `POS_API_STRICT_VERSION` and add a compatibility window (`min_supported`)
   to `posApiVersionInfo()`.

Until that first hand-off, breaking `/api/pos` freely is fine — everything is
built and released together.

## Not done on purpose (future)

- URL-prefixed routes (`/api/pos/v1/*`). The header scheme was chosen first
  because it needs zero route/test churn and is reversible; a prefix can be
  layered on top later without removing the header.
- `min_supported` / deprecation window in `posApiVersionInfo()`.
- Wiring the client-side skew warning into real telemetry (roadmap #6).
- Rejecting by default (`POS_API_STRICT_VERSION` on).
