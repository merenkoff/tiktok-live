// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect } from 'react';
import { useAuthStore, usePosShell, useEnabledModules, startOfflineRuntime } from '@pos/platform';
import { renderModuleRoutes } from './modules/renderRoutes';
import { ModuleRemotesReloadBanner } from './components/ModuleRemotesReloadBanner';
import { registerTabletServiceWorker, useAppUpdate } from './hooks/useAppUpdate';

export function TabletApp() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role());
  const moduleRemotesStale = useAuthStore((s) => s.moduleRemotesStale);
  const dismissModuleRemotesStale = useAuthStore((s) => s.dismissModuleRemotesStale);
  const updateReady = useAppUpdate((s) => s.ready);
  const updateDismissed = useAppUpdate((s) => s.dismissed);
  const applyUpdate = useAppUpdate((s) => s.apply);
  const dismissUpdate = useAppUpdate((s) => s.dismiss);
  const shell = usePosShell();
  const enabled = useEnabledModules();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // The reads runtime: connectivity listeners and a snapshot refresh when the
    // network comes back or the tablet is picked up. Through the barrel, so it
    // is the runtime `tablet-main.tsx` registered the module hooks into.
    void startOfflineRuntime();
  }, []);

  useEffect(() => {
    // Once there is a session, not at boot: the first launch needs the network
    // for the login and the snapshot anyway, so nothing is lost by installing
    // the shell cache after it — and a login that races the worker's claim is
    // a request Playwright cannot route (`hooks/useAppUpdate.ts`).
    if (isAuthenticated) registerTabletServiceWorker();
  }, [isAuthenticated]);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen grid place-items-center text-sq-secondary">
        Завантаження…
      </div>
    );
  }

  // The store's module list changing wins, as on the till: it is what the
  // owner just did. A new host build waits its turn — and, dismissed, waits for
  // the next launch (TechDocs/POS_PWA.md §5).
  const banner = moduleRemotesStale
    ? { message: 'Підключено нові модулі магазину.', onDismiss: dismissModuleRemotesStale }
    : updateReady && !updateDismissed
      ? {
          message: 'Доступна нова версія застосунку.',
          onDismiss: dismissUpdate,
          action: { label: 'Оновити', onClick: applyUpdate },
        }
      : null;

  return (
    <>
      {renderModuleRoutes({ shell, role, enabled, isAuthenticated })}
      {isAuthenticated && banner && <ModuleRemotesReloadBanner {...banner} />}
    </>
  );
}
