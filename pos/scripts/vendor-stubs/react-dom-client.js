// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Self-hosted `react-dom/client` vendor chunk (createRoot/hydrateRoot).
// `react` and `react-dom` are external — resolved via the import map to the
// shared chunks. `main.tsx` / `cashier-main.tsx` do `import ReactDOM from
// 'react-dom/client'`, so a default export is required alongside the named ones.
//
// Deliberately reaches through `react-dom` rather than importing
// `react-dom/client`. That entry is a CJS wrapper whose production branch is
// literally `exports.createRoot = require('react-dom').createRoot` (same for
// hydrateRoot). Rollup's commonjs plugin used to rewrite that `require` into an
// import of the external; rolldown (Vite 8) keeps it as a runtime `require`,
// which throws in the browser and left the whole app dead on boot. Going
// through the external directly produces the same two functions with no CJS
// interop at all.
//
// The `react-dom` vendor chunk exposes them on its default export only (its
// named exports are the DOM API — see react-dom.js), hence the property reads.
import ReactDOM from 'react-dom';

export const createRoot = ReactDOM.createRoot;
export const hydrateRoot = ReactDOM.hydrateRoot;

export default { createRoot, hydrateRoot };
