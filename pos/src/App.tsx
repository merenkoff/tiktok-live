// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect } from 'react';
import { useAuthStore, usePosShell, useEnabledModules } from '@pos/platform';
import { renderModuleRoutes } from './modules/renderRoutes';

/**
 * Shown (web only) when the store's `module_remotes` setting changed since this
 * tab booted — `applyModuleRemotes()` only runs at boot, so a reload is needed
 * to pick up the new module source (roadmap #9).
 */
function ModuleRemotesReloadBanner() {
  const dismiss = useAuthStore((s) => s.dismissModuleRemotesStale);
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 border-t border-sq-divider bg-sq-surface px-4 py-3 text-sm text-sq-text shadow-lg">
      <span className="text-sq-secondary">Джерело модулів магазину змінилося.</span>
      <button className="sq-btn-primary px-3 py-1.5" onClick={() => window.location.reload()}>
        Перезавантажити
      </button>
      <button className="px-2 py-1.5 text-sq-secondary hover:text-sq-text" onClick={dismiss}>
        Пізніше
      </button>
    </div>
  );
}

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role());
  const moduleRemotesStale = useAuthStore((s) => s.moduleRemotesStale);
  const shell = usePosShell();
  const enabled = useEnabledModules();

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
      {renderModuleRoutes({ shell, role, enabled, isAuthenticated })}
      {shell === 'web' && moduleRemotesStale && <ModuleRemotesReloadBanner />}
    </>
  );
}
