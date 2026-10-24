// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's names the host keys device settings by. Here rather than in the
// manifest so a screen can name them without importing the manifest (which
// imports the screens lazily — a cycle).

export const DEBTS_MODULE_ID = 'debts';

/** «Обладнання» keeps this station's printer under `stationPrinter:debts:slips`. */
export const DEBTS_SLIP_STATION = 'slips';
