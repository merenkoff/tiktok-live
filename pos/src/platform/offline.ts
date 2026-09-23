// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The mode setters travel through the barrel too, and the shell entries MUST
// call them from here: `offline/enabled.ts` is compiled into this chunk, and a
// relative import from an entry sets a second copy of the flag that nothing in
// the chunk reads — which is how the release desktop till shipped with its
// offline runtime never starting (TechDocs/POS_PWA.md).
export {
  enableOfflinePos,
  enableOfflineReads,
  isOfflinePosEnabled,
  isOfflineReadsEnabled,
  offlineMode,
} from '../offline/enabled';
export type { OfflineMode } from '../offline/enabled';
export { OfflineAuthError, OfflineRefundError, OfflineWriteError } from '../offline/errors';
export { getMeta, setMeta } from '../offline/db';
// Roadmap #12 track 3 — a module with its own offline data reads the till's
// connectivity from the same store the shell's banner uses, and the shell entry
// registers module hooks through THIS path so they land in the one registry the
// platform chunk's sync loop reads (a relative import would get a second copy).
export { useOfflineStatus } from '../offline/status';
export { registerOfflineModules } from '../offline/moduleHooks';
export type { ModuleOfflineHooks } from '../offline/moduleHooks';
// The ПРРО offline reserve's refusal text. `offline/lease.ts` is already a
// static member of this chunk (`platform/sales.ts` -> `offline/cashierApi.ts`
// -> it), so exporting the helper costs nothing and keeps the shell's banner
// off a relative path into the chunk.
export { refusalText } from '../offline/lease';

/**
 * Starts the till's offline runtime: the outbox loop, the connectivity
 * listeners and the per-module sync hooks the shell entry registered.
 *
 * A thin async wrapper rather than a re-export, for two reasons. `offline/sync`
 * is reached lazily everywhere else inside this chunk (`useAuth.ts` does
 * `await import('../offline')`), and re-exporting it here would drag the whole
 * runtime into the eager graph the web shell downloads and never uses. And the
 * shell cannot reach it relatively instead: that copy's module-hooks registry
 * is not the one `registerOfflineModules` above writes to, so every module's
 * offline sync would be driven against an empty registry
 * (`scripts/check-platform-boundary.mjs` now refuses that import).
 */
export async function startOfflineRuntime(): Promise<void> {
  const runtime = await import('../offline/sync');
  runtime.startOfflineRuntime();
}
