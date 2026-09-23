// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The waiter's tablet: the same deploy as `main.tsx`, served under `/tablet/`
// as an installable PWA (TechDocs/POS_PWA.md). It reads offline and writes
// online — `enableOfflineReads`, never `enableOfflinePos` — and is not a till:
// no device id, no queue, no code reserve, no printer.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { TabletApp } from './TabletApp';
// Through the barrel, like the cashier entry: `offline/enabled.ts` lives in
// the platform chunk, and a relative import would set a flag nothing reads.
import { PosShellContext, enableOfflineReads, registerOfflineModules } from '@pos/platform';
import { applyModuleRemotes, allModules } from './modules/registry';
import { maybeStartTelemetryBeacon } from './modules/telemetryBeacon';
import { captureInstallPrompt } from './lib/installPrompt';
import './index.css';
import './styles/tokens.css';

enableOfflineReads();
captureInstallPrompt();
maybeStartTelemetryBeacon();

// The web verify+`import()` path, unchanged: remote bundles reach this page
// through the service worker's cache when there is no network, and the
// verification runs against the cached bytes exactly as it would against the
// CDN's.
void applyModuleRemotes().finally(() => {
  registerOfflineModules(allModules());
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <PosShellContext.Provider value="tablet">
        <BrowserRouter basename="/tablet">
          <TabletApp />
        </BrowserRouter>
      </PosShellContext.Provider>
    </React.StrictMode>
  );
  // The service worker registers from `TabletApp` once a session exists —
  // see `hooks/useAppUpdate.ts` for why not here.
});
