// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export { isOfflinePosEnabled } from '../offline/enabled';
export { OfflineAuthError, OfflineRefundError } from '../offline/errors';
export { getMeta, setMeta } from '../offline/db';
// Roadmap #12 track 3 — a module with its own offline data reads the till's
// connectivity from the same store the shell's banner uses, and the shell entry
// registers module hooks through THIS path so they land in the one registry the
// platform chunk's sync loop reads (a relative import would get a second copy).
export { useOfflineStatus } from '../offline/status';
export { registerOfflineModules } from '../offline/moduleHooks';
export type { ModuleOfflineHooks } from '../offline/moduleHooks';
