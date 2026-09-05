// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect } from 'react';
import { useAuthStore, usePosShell, useEnabledModules } from '@pos/platform';
import { useUpdateStore } from './hooks/useUpdateCheck';
import { renderModuleRoutes } from './modules/renderRoutes';
import { startOfflineRuntime } from './offline';

export function CashierApp() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role());
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

  return renderModuleRoutes({ shell, role, enabled, isAuthenticated });
}
