// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Entry point for the standalone `vertical-cafe` remote, built by
// `pos/vite.vertical-cafe-remote.config.ts`. Like `vertical-flowers`, this is
// the only copy of this code — the shell ships none of it.
//
// `version` comes from THIS build's `POS_APP_VERSION` (deep import, so it is
// bundled locally rather than taken from the host) and shows up in the host's
// `session_manifest` telemetry.
import '../remote-styles.css';
import { POS_APP_VERSION } from '../../platform/version';
import { verticalCafeModule } from './manifest';

export const manifest = { ...verticalCafeModule, version: POS_APP_VERSION };
