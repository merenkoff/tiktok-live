// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export { useAuthStore, loadLastStoreSlug } from '../hooks/useAuth';
export { PosShellContext, usePosShell } from '../shell';
export type { PosShell } from '../shell';
export { useEnabledModules } from '../modules/useEnabledModules';
export type { ModuleId } from '../modules/types';
// `getAppliedRemotes`/`setAppliedRemotes` hold module-level state
// (`applied`, in `modules/appliedRemotes.ts`) that must be ONE instance
// shared with `useAuthStore` above — both live inside this same externalised
// chunk. A host-app file (`registry.ts`, `SettingsPage.tsx`) importing
// `../modules/appliedRemotes` directly instead gets its OWN copy of that
// module-level `let`, permanently out of sync with the one `useAuth.ts`
// reads here: the "module source changed" banner then never clears, no
// matter how many times the page reloads, because the write and the read
// land in two different closures. See `check-platform-boundary.mjs`.
export { getAppliedRemotes, setAppliedRemotes, sameRemoteMap } from '../modules/appliedRemotes';
