// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Entry for the self-hosted `react` vendor chunk (see scripts/build-vendor.mjs).
// Re-bundled to ESM so the host, `@pos/platform`, and every module-remote can
// all resolve bare `import ... from "react"` to this ONE file via the import
// map injected into index.html — the single React instance the whole tree shares.
//
// `react`'s npm package is CJS, and Rollup can't enumerate a CJS module's named
// exports through `export *` in lib mode — so React 18's public API is listed
// explicitly. React's export object is frozen and fully-formed at load, so the
// destructure snapshot is what every CDN ESM build of React does too.
import React from 'react';

export default React;

export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createFactory,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
} = React;
