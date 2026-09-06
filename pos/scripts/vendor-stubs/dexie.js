// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Self-hosted `dexie` vendor chunk. `@pos/platform` re-exports `getMeta` /
// `setMeta` from `offline/db`, which `new Dexie()`s at module load — sharing
// this one instance keeps the cashier bundle and the standalone `platform.js`
// on a single Dexie / IndexedDB connection instead of two (broken offline).
export * from 'dexie';
export { default } from 'dexie';
