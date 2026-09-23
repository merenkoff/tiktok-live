// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * How much of the offline runtime this shell runs.
 *
 *  - `off`   — the web shell: every read and write goes to the server.
 *  - `full`  — the desktop till: local mirror, outbox queue, ПРРО code reserve,
 *              a device id the server keys the register holder on.
 *  - `reads` — the waiter's tablet (PWA): local login and the mirror are read
 *              without a network, but nothing is ever queued — a write with no
 *              connection is refused on the spot. No device id either: the
 *              server treats any valid `X-POS-Device-ID` as a till that can hold
 *              the ПРРО register (TechDocs/POS_PWA.md).
 *
 * One module-level value, reached ONLY through `@pos/platform`: this file is
 * compiled into the external platform chunk, and a shell entry that imported it
 * relatively would flip a second copy the chunk never reads. That was live on
 * the desktop build before the tablet track — `cashier-main.tsx` set a host-
 * local flag while `cashierApi` read the chunk's, so the release till never
 * started its offline runtime (`scripts/check-platform-boundary.mjs` names this
 * file for that reason).
 */
export type OfflineMode = 'off' | 'full' | 'reads';

let mode: OfflineMode = 'off';

/** Call only from the cashier shell entry (`cashier-main.tsx`), through the barrel. */
export function enableOfflinePos(): void {
  mode = 'full';
}

/** Call only from the tablet shell entry (`tablet-main.tsx`), through the barrel. */
export function enableOfflineReads(): void {
  mode = 'reads';
}

/** The till may queue writes and stamp receipts: the desktop cashier only. */
export function isOfflinePosEnabled(): boolean {
  return mode === 'full';
}

/** Reads come from the local mirror and login may fall back to the local unlock. */
export function isOfflineReadsEnabled(): boolean {
  return mode !== 'off';
}

export function offlineMode(): OfflineMode {
  return mode;
}
