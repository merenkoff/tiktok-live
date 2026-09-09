// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { CashierApp } from './CashierApp';
import { PosShellContext } from '@pos/platform';
import { enableOfflinePos } from './offline/enabled';
import { applyModuleRemotes } from './modules/registry';
import { getAppliedRemotes } from '@pos/platform';
import { createCacheFirstSync, startModuleRemoteUpdateChecks } from './modules/desktopRemotes';
import { syncModuleRemote, moduleRemoteUrl, pruneModuleRemotes } from './lib/moduleRemotes';
import { maybeStartTelemetryBeacon } from './modules/telemetryBeacon';
import './index.css';
import './styles/tokens.css';

enableOfflinePos();
maybeStartTelemetryBeacon();

// Desktop module remotes (roadmap #13 Part B, #12 track 1): each
// `store.module_remotes` entry is served from the Rust-verified on-disk cache
// when it is there — no network on the boot path — and downloaded only when it
// isn't (first run). Offline with nothing cached → the module is a placeholder
// this session. No `module_remotes` configured → resolves immediately. Either
// way `applyModuleRemotes` emits the boot `session_manifest` event.
void applyModuleRemotes({
  syncRemote: createCacheFirstSync(syncModuleRemote, moduleRemoteUrl),
}).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <PosShellContext.Provider value="cashier">
        <HashRouter>
          <CashierApp />
        </HashRouter>
      </PosShellContext.Provider>
    </React.StrictMode>
  );

  // The till is up — now the real sync, in the background: a newer version (or
  // a placeholder's first download) lands in the cache and the shell offers a
  // reload. Then drop the cache of modules the store no longer names. Skipped
  // under the `VITE_MODULE_REMOTES` build override, whose list is not the
  // store's.
  startModuleRemoteUpdateChecks(syncModuleRemote);
  if (!import.meta.env.VITE_MODULE_REMOTES) {
    void pruneModuleRemotes([...getAppliedRemotes().keys()]).catch(() => undefined);
  }
});
