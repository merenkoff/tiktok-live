// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Self-hosted `react-dom/client` vendor chunk (createRoot/hydrateRoot).
// `react` and `react-dom` are external — resolved via the import map to the
// shared chunks. `main.tsx` / `cashier-main.tsx` do `import ReactDOM from
// 'react-dom/client'`, so a default export is required alongside the named ones.
import client from 'react-dom/client';

export default client;
export const createRoot = client.createRoot;
export const hydrateRoot = client.hydrateRoot;
