/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** `1` opts this build into the client-telemetry network beacon — see roadmap #6. */
  readonly VITE_POS_TELEMETRY_BEACON?: string;
  /** `id@url,…` build override for module remotes (roadmap #9); wins over the per-store setting. */
  readonly VITE_MODULE_REMOTES?: string;
  /** `1` + `VITE_MODULE_REMOTES` set → skip the signed-manifest check (dev only — roadmap #3). */
  readonly VITE_MODULE_REMOTES_INSECURE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Build version of this bundle, stamped by every Vite config via `define`
 * (see `pos/scripts/pkg-version.mjs`). Absent under `vite dev` — read it
 * through `POS_APP_VERSION` in `src/platform/version.ts`, which falls back.
 */
declare const __POS_APP_VERSION__: string | undefined;
