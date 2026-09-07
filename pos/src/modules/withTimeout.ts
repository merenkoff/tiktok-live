// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Bound on every remaining unguarded await in `applyModuleRemotes()` — the
 * desktop `syncRemote` bridge (a Tauri `invoke`, no cancellation API) and the
 * dynamic `import()` of a verified module (no browser-exposed abort for a
 * module-script fetch either). `remoteVerify.ts`'s own `fetch()` calls carry
 * their own `AbortSignal.timeout`; this covers what that can't reach.
 *
 * `applyModuleRemotes()` runs before the app's first render (`main.tsx`) — an
 * operation here that hangs forever (a host that accepts the connection and
 * never answers, rather than refusing it) freezes the whole site for every
 * visitor, not just the one module. A live incident, not a hypothetical.
 */
export const MODULE_LOAD_TIMEOUT_MS = 10_000;

/**
 * Races `promise` against a timeout. The loser's promise is left running —
 * neither `invoke` nor a module fetch can be cancelled from here — but nothing
 * awaits it once this settles, so an eventual late resolution is harmless.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
