// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Entry point when `returns` ships as a standalone remote (Task B PoC).
// Built by `pos/vite.returns-remote.config.ts` with react + @pos/platform
// left external, so the host provides the singletons.
export { returnsModule as manifest } from './manifest';
