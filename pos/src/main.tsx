// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { PosShellContext } from './shell';
import { applyModuleRemotes } from './modules/registry';
import './index.css';

// Resolves immediately unless VITE_MODULE_REMOTES is set (Task B PoC).
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
