// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Entry point when `returns` ships as a standalone remote (Task B PoC).
// Built by `pos/vite.returns-remote.config.ts` with react + @pos/platform
// left external, so the host provides the singletons.
//
// `version` is stamped from THIS build's `POS_APP_VERSION` (deep import, bundled
// locally — the barrel externalization only externalizes `@pos/platform` itself)
// so the host's `session_manifest` telemetry shows which remote build is live.
import '../remote-styles.css';
import { POS_APP_VERSION } from '../../platform/version';
import { returnsModule } from './manifest';

export const manifest = { ...returnsModule, version: POS_APP_VERSION };
