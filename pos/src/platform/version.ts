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
export const POS_API_CLIENT_VERSION = 1;

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
