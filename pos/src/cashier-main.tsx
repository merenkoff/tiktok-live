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
import { syncModuleRemote, moduleRemoteUrl } from './lib/moduleRemotes';
import { maybeStartTelemetryBeacon } from './modules/telemetryBeacon';
import './index.css';
import './styles/tokens.css';

enableOfflinePos();
maybeStartTelemetryBeacon();

// Desktop module remotes (roadmap #13 Part B): each `store.module_remotes` entry
// is downloaded + Ed25519-verified + cached by Rust, then imported from the
// `liveshopmodule://` cache. Offline with nothing cached → the module is simply
// absent this session. No `module_remotes` configured → resolves immediately.
// Either way `applyModuleRemotes` emits the boot `session_manifest` event.
void applyModuleRemotes({
  syncRemote: async (id, url) => {
    const res = await syncModuleRemote(id, url).catch(() => null);
    if (!res || res.active == null) return null;
    return { importUrl: moduleRemoteUrl(id), styleUrl: moduleRemoteUrl(id, 'style.css') };
  },
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
});
