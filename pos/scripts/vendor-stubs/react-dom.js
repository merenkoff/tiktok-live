// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Self-hosted `react-dom` vendor chunk. `react` is external here — it resolves
// through the import map to the shared `react` chunk, so react-dom uses the
// same React instance as everything else. (`createPortal` is the only bare
// `react-dom` import in the tree, via `@pos/platform`'s usePrintableReceipt.)
//
// Named exports listed explicitly: `react-dom`'s npm entry is
// `module.exports = require('./cjs/react-dom.production.min.js')`, which the CJS
// lexer can't see through, so `export *` would emit nothing (see react.js).
import ReactDOM from 'react-dom';

export default ReactDOM;

export const {
  createPortal,
  flushSync,
  findDOMNode,
  hydrate,
  render,
  unmountComponentAtNode,
  unstable_batchedUpdates,
  unstable_renderSubtreeIntoContainer,
  version,
} = ReactDOM;
