// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect } from 'react';
import { useAuthStore, usePosShell, useEnabledModules } from '@pos/platform';
import { useBlockedSections } from './modules/staffSections';
import { renderModuleRoutes } from './modules/renderRoutes';
import { ModuleRemotesReloadBanner } from './components/ModuleRemotesReloadBanner';
import { LicenseNoticeStrip } from './components/LicenseNoticeStrip';

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role());
  const moduleRemotesStale = useAuthStore((s) => s.moduleRemotesStale);
  const dismissModuleRemotesStale = useAuthStore((s) => s.dismissModuleRemotesStale);
  const shell = usePosShell();
  const enabled = useEnabledModules();
  const blocked = useBlockedSections();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen grid place-items-center text-sq-secondary">
        Завантаження…
      </div>
    );
  }

  return (
    <>
      <LicenseNoticeStrip />
      {renderModuleRoutes({ shell, role, enabled, blocked, isAuthenticated })}
      {moduleRemotesStale && (
        <ModuleRemotesReloadBanner
          message="Джерело модулів магазину змінилося."
          onDismiss={dismissModuleRemotesStale}
        />
      )}
    </>
  );
}
