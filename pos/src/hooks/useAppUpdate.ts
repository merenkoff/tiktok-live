// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { create } from 'zustand';

/**
 * A new host build for the tablet PWA (TechDocs/POS_PWA.md §5).
 *
 * The service worker installs the next build in the background and then
 * WAITS: it never calls `skipWaiting()` on its own, so the running page keeps
 * the bundle it started with until either the waiter taps «Оновити» or every
 * tab of the app is closed — which for an installed PWA means the next launch.
 * A reload under a half-typed order is exactly what this exists to avoid.
 */
interface AppUpdateState {
  /** A newer build is installed and waiting behind the one on screen. */
  ready: boolean;
  dismissed: boolean;
  apply: () => void;
  dismiss: () => void;
}

let registration: ServiceWorkerRegistration | null = null;

export const useAppUpdate = create<AppUpdateState>((set) => ({
  ready: false,
  dismissed: false,
  apply: () => {
    const waiting = registration?.waiting;
    if (!waiting) return;
    // `controllerchange` below does the reload once the new worker has taken
    // the page over — never before, or the page would reload into the old one.
    waiting.postMessage('SKIP_WAITING');
  },
  dismiss: () => set({ dismissed: true }),
}));

const SW_URL = '/tablet-sw.js';
const SW_SCOPE = '/tablet/';
const UPDATE_CHECK_MS = 60 * 60 * 1000;

function offerWaiting(reg: ServiceWorkerRegistration): void {
  // A worker waiting with no controller is the FIRST install: nothing to
  // offer, the page already runs the newest build.
  if (reg.waiting && navigator.serviceWorker.controller) {
    useAppUpdate.setState({ ready: true, dismissed: false });
  }
}

/**
 * Register the tablet's service worker and watch it for a newer build.
 * Production builds only: `vite dev` serves no `tablet-sw.js`, and a worker
 * registered against a 404 would be a stale one from a previous build.
 */
export function registerTabletServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  void navigator.serviceWorker
    .register(SW_URL, { scope: SW_SCOPE })
    .then((reg) => {
      registration = reg;
      offerWaiting(reg);
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') offerWaiting(reg);
        });
      });

      const check = () => void reg.update().catch(() => undefined);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.setInterval(check, UPDATE_CHECK_MS);
    })
    .catch(() => undefined);
}
