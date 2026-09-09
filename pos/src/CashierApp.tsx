// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect } from 'react';
import { useAuthStore, usePosShell, useEnabledModules } from '@pos/platform';
import { useUpdateStore } from './hooks/useUpdateCheck';
import { renderModuleRoutes } from './modules/renderRoutes';
import { useModuleRemoteUpdates } from './modules/desktopRemotes';
import { ModuleRemotesReloadBanner } from './components/ModuleRemotesReloadBanner';
import { startOfflineRuntime } from './offline';

export function CashierApp() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role());
  const moduleRemotesStale = useAuthStore((s) => s.moduleRemotesStale);
  const dismissModuleRemotesStale = useAuthStore((s) => s.dismissModuleRemotesStale);
  const updatesReady = useModuleRemoteUpdates((s) => s.ready);
  const updatesDismissed = useModuleRemoteUpdates((s) => s.dismissed);
  const dismissUpdates = useModuleRemoteUpdates((s) => s.dismiss);
  const shell = usePosShell();
  const enabled = useEnabledModules();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    startOfflineRuntime();
  }, []);

  useEffect(() => {
    useUpdateStore.getState().check();
  }, []);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen grid place-items-center text-sq-secondary">
        Завантаження…
      </div>
    );
  }

  // Two reasons to reload, one banner. The store's module list changing wins:
  // it is what the owner just did, and a reload picks up the downloads too.
  const showUpdates = updatesReady.length > 0 && !updatesDismissed;
  const banner = moduleRemotesStale
    ? { message: 'Підключено нові модулі магазину.', onDismiss: dismissModuleRemotesStale }
    : showUpdates
      ? {
          message: `Завантажено оновлення: ${updatesReady.map((t) => `«${t}»`).join(', ')}.`,
          onDismiss: dismissUpdates,
        }
      : null;

  return (
    <>
      {renderModuleRoutes({ shell, role, enabled, isAuthenticated })}
      {isAuthenticated && banner && <ModuleRemotesReloadBanner {...banner} />}
    </>
  );
}
