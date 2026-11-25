// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Entry point for the standalone `remote-kitchen` remote, built by
// `pos/vite.remote-kitchen-remote.config.ts` with react + react-router +
// zustand + `@pos/platform` left external so the host provides the singletons.
//
// `version` is stamped from THIS build's `POS_APP_VERSION` (deep import, so it
// is bundled locally) and shows up in the host's `session_manifest` telemetry.
import '@host/modules/remote-styles.css';
import { POS_APP_VERSION } from '@host/platform/version';
import { remoteKitchenModule } from './manifest';

export const manifest = { ...remoteKitchenModule, version: POS_APP_VERSION };
