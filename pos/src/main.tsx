// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { PosShellContext } from '@pos/platform';
import { applyModuleRemotes } from './modules/registry';
import { maybeStartTelemetryBeacon } from './modules/telemetryBeacon';
import './index.css';
import './styles/tokens.css';

// Wire the (dormant-by-default) telemetry sink before the registry resolves so
// it catches the boot `session_manifest` event — see roadmap #6.
maybeStartTelemetryBeacon();

// Resolves immediately unless VITE_MODULE_REMOTES is set (Task B PoC); either
// way it emits the `session_manifest` telemetry event on completion.
void applyModuleRemotes().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <PosShellContext.Provider value="web">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </PosShellContext.Provider>
    </React.StrictMode>
  );
});
