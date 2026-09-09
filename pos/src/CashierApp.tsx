// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const needsAppUpdate = useModuleRemoteUpdates((s) => s.needsAppUpdate);
  const updatesDismissed = useModuleRemoteUpdates((s) => s.dismissed);
  const dismissUpdates = useModuleRemoteUpdates((s) => s.dismiss);
  const shell = usePosShell();
  const enabled = useEnabledModules();
  const navigate = useNavigate();

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

  // Three reasons, one banner, in priority order. The store's module list
  // changing wins: it is what the owner just did, and a reload picks up the
  // downloads too. A module that outgrew this app's platform comes last — its
  // fix is an app update (the Hardware page hosts it), not a reload.
  const quoted = (titles: string[]) => titles.map((t) => `«${t}»`).join(', ');
  const banner = moduleRemotesStale
    ? { message: 'Підключено нові модулі магазину.', onDismiss: dismissModuleRemotesStale }
    : updatesDismissed
      ? null
      : updatesReady.length > 0
        ? { message: `Завантажено оновлення: ${quoted(updatesReady)}.`, onDismiss: dismissUpdates }
        : needsAppUpdate.length > 0
          ? {
              message: `Потребує новішої версії застосунку: ${quoted(needsAppUpdate)}.`,
              onDismiss: dismissUpdates,
              action: { label: 'Оновити застосунок', onClick: () => navigate('/hardware') },
            }
          : null;

  return (
    <>
      {renderModuleRoutes({ shell, role, enabled, isAuthenticated })}
      {isAuthenticated && banner && <ModuleRemotesReloadBanner {...banner} />}
    </>
  );
}
