// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Entry point for the standalone `stocktake` remote, built by
// `pos/vite.stocktake-remote.config.ts` with react + react-router + zustand +
// dexie + `@pos/platform` left external so the host provides the singletons.
//
// `version` is stamped from THIS build's `POS_APP_VERSION` (deep import, so it
// is bundled locally) and shows up in the host's `session_manifest` telemetry.
import '../remote-styles.css';
import { POS_APP_VERSION } from '../../platform/version';
import { stocktakeModule } from './manifest';

export const manifest = { ...stocktakeModule, version: POS_APP_VERSION };
