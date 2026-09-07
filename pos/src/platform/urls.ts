// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// URL helpers a feature module is allowed to use. Same pattern as `money.ts` /
// `gtin.ts`: a thin re-export of the pure helpers in `lib/urls`, not the whole
// file (`posApiBase` stays host-internal — a module reaches the POS API through
// the `api` client, not by building URLs).
//
// `apiOrigin` is here for modules that talk to a NON-POS surface on the same
// backend and so cannot use the `api` client: the `tiktok-live` module builds
// its `/api/sessions/*` and `ws(s)://…/api/sessions/logs/stream` URLs from it.
// Empty string = same origin.
export { assetUrl, apiOrigin } from '../lib/urls';
