// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// URL helpers a feature module is allowed to use. `lib/urls` also holds
// build-time API-base plumbing the module never needs — this re-exports only
// the asset-path resolver. Same pattern as `money.ts` / `gtin.ts`.
export { assetUrl } from '../lib/urls';
