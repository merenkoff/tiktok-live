// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useAuthStore } from '../hooks/useAuth';
import { useCartStore } from '../hooks/useCart';
import { useUpdateStore } from '../hooks/useUpdateCheck';
import { server } from './msw/server';

// The module registry eagerly reaches the cashier screens, which pull in the
// Tauri bridge and the camera scanner. Neither exists in jsdom, so stub them
// globally rather than in every test that renders a route.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: () => false,
}));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {},
  Html5QrcodeScanner: class {},
  Html5QrcodeSupportedFormats: {},
}));

// jsdom ships no `PointerEvent` (jsdom#2527). Testing Library then builds a
// bare `Event` for `fireEvent.pointerDown(...)` and every init field it was
// given — `clientX`, `button`, `pointerId` — is silently dropped, so a drag
// test sees a press with no coordinates and nothing moves. A MouseEvent
// subclass carries all three and is everything our pointer code reads (the
// hall editor's `useTableDrag`, К4i).
if (!('PointerEvent' in globalThis)) {
  class JsdomPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  (globalThis as { PointerEvent?: unknown }).PointerEvent = JsdomPointerEvent;
}

// The same gap, one level down: jsdom elements have no pointer capture at all.
// Our code guards the call, but a test that never exercises the guard is a
// test that would not notice it disappearing.
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {};
  Element.prototype.releasePointerCapture = function releasePointerCapture() {};
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return false;
  };
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ auth: null, isAuthenticated: false, bootstrapped: true });
  useUpdateStore.setState({ updateInfo: null, checked: false });
  useCartStore.getState().clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  server.resetHandlers();
  // clearAllMocks wipes call history on plain `vi.fn()` mocks; restoreAllMocks
  // stopped doing that in Vitest 3 (it now only undoes `vi.spyOn` spies), which
  // let counts leak across tests in this file's module-level mocks. Implementations
  // are deliberately left alone — the `vi.mock` factories above define theirs once.
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
