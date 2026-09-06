// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `version` stamped from THIS build's `POS_APP_VERSION` — see the note in
// `returns/remote-entry.ts`.
import '../remote-styles.css';
import { POS_APP_VERSION } from '../../platform/version';
import { stockModule } from './manifest';

export const manifest = { ...stockModule, version: POS_APP_VERSION };
