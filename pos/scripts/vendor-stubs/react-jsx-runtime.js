// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Self-hosted `react/jsx-runtime` vendor chunk — the automatic-JSX runtime
// `@vitejs/plugin-react` compiles every `.tsx` file against. `react` is
// external, so jsx()/jsxs()/Fragment come off the one shared React instance.
// Named exports listed explicitly (CJS source — see the note in react.js).
import jsxRuntime from 'react/jsx-runtime';

export const Fragment = jsxRuntime.Fragment;
export const jsx = jsxRuntime.jsx;
export const jsxs = jsxRuntime.jsxs;
