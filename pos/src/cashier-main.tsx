// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { CashierApp } from './CashierApp';
import { PosShellContext } from '@pos/platform';
import { enableOfflinePos } from './offline/enabled';
import { reportSessionManifest } from './modules/registry';
import { maybeStartTelemetryBeacon } from './modules/telemetryBeacon';
import './index.css';
import './styles/tokens.css';

enableOfflinePos();

// The Tauri shell never swaps module remotes, but still reports its all-bundled
// module/version manifest for skew debugging — see roadmap #6.
maybeStartTelemetryBeacon();
reportSessionManifest();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PosShellContext.Provider value="cashier">
      <HashRouter>
        <CashierApp />
      </HashRouter>
    </PosShellContext.Provider>
  </React.StrictMode>
);
