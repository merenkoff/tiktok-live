// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Entry point for the standalone `fiscal-checkbox` remote, built by
// `pos/vite.fiscal-checkbox-remote.config.ts`. Same shape as
// `tiktok-live/remote-entry.ts` — react + react-router + zustand +
// `@pos/platform` external, `version` deep-imported so it is bundled locally
// and shows up in the host's `session_manifest` telemetry.
import '../remote-styles.css';
import { POS_APP_VERSION } from '../../platform/version';
import { fiscalCheckboxModule } from './manifest';

export const manifest = { ...fiscalCheckboxModule, version: POS_APP_VERSION };
