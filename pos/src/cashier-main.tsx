import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { CashierApp } from './CashierApp';
import { PosShellContext } from './shell';
import { enableOfflinePos } from './offline/enabled';
import './index.css';

enableOfflinePos();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PosShellContext.Provider value="cashier">
      <HashRouter>
        <CashierApp />
      </HashRouter>
    </PosShellContext.Provider>
  </React.StrictMode>
);
