// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/* eslint-disable react-refresh/only-export-components --
   route-tree builder module: it deliberately exports helpers (renderRoutes) next
   to local layout components; it is never a Fast Refresh boundary. */

import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@pos/platform';
import { AdminLayout } from '../pages/admin/AdminLayout';
import { CashierLayout } from '../components/cashier/CashierLayout';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';
import { LoginPage } from '../pages/LoginPage';
import type { PosShell } from '../shell';
import type { PosRole } from '../types';
import { allModules, type AnyModuleDescriptor } from './registry';
import type { ModuleId } from './types';

export interface RouteContext {
  shell: PosShell;
  role: PosRole | null;
  enabled: ReadonlySet<ModuleId>;
  isAuthenticated: boolean;
}

function RouteFallback() {
  return (
    <div className="min-h-screen grid place-items-center text-sq-secondary">Завантаження…</div>
  );
}

function Guard({
  children,
  ownerOnly = false,
}: {
  children: ReactNode;
  ownerOnly?: boolean;
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role());
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (ownerOnly && role !== 'owner') return <Navigate to="/register" replace />;
  return <>{children}</>;
}

/** Where an authenticated user lands from `/login` or an unmatched path. */
export function homePath(ctx: RouteContext): string {
  return ctx.shell === 'web' && ctx.role === 'owner' ? '/admin' : '/register';
}

export function moduleVisible(m: AnyModuleDescriptor, ctx: RouteContext): boolean {
  if (!m.shells.includes(ctx.shell)) return false;
  if (m.ownerOnly && ctx.role !== 'owner') return false;
  // Online-only remote modules (roadmap #13 Part C) opt in via `module_remotes`,
  // not `enabled_modules`.
  if ('alwaysEnabled' in m && m.alwaysEnabled) return true;
  return ctx.enabled.has(m.id as ModuleId);
}

export function renderModuleRoutes(ctx: RouteContext) {
  const visible = allModules().filter((m) => moduleVisible(m, ctx));

  const rootRoutes: ReactNode[] = [];
  const adminRoutes: ReactNode[] = [];
  let adminIndex: ReactNode = null;
  let firstAdminPath: string | null = null;

  for (const m of visible) {
    for (const r of m.routes) {
      const El = r.element;
      const raw = <El {...(r.props ?? {})} />;
      const node = r.eager ? (
        raw
      ) : (
        <RouteErrorBoundary moduleId={m.id} title={m.title}>
          <Suspense fallback={<RouteFallback />}>{raw}</Suspense>
        </RouteErrorBoundary>
      );
      const mount = r.mount ?? 'root';

      if (mount === 'admin') {
        // The `/admin` area is web-only; the cashier shell never mounts it.
        if (ctx.shell !== 'web') continue;
        if (r.index) {
          adminIndex = <Route key={`admin-index:${m.id}`} index element={node} />;
        } else if (r.path) {
          if (firstAdminPath === null) firstAdminPath = `/admin/${r.path}`;
          adminRoutes.push(<Route key={`admin:${m.id}:${r.path}`} path={r.path} element={node} />);
        }
        continue;
      }

      if (!r.path) continue;
      rootRoutes.push(
        <Route
          key={`root:${m.id}:${r.path}`}
          path={r.path}
          element={
            <Guard>
              <CashierLayout>{node}</CashierLayout>
            </Guard>
          }
        />
      );
    }
  }

  const hasAdmin = adminIndex !== null || adminRoutes.length > 0;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          ctx.isAuthenticated ? <Navigate to={homePath(ctx)} replace /> : <LoginPage />
        }
      />
      {rootRoutes}
      {hasAdmin && (
        <Route
          path="/admin"
          element={
            <Guard ownerOnly>
              <AdminLayout />
            </Guard>
          }
        >
          {adminIndex ?? (
            <Route index element={<Navigate to={firstAdminPath ?? '/register'} replace />} />
          )}
          {adminRoutes}
        </Route>
      )}
      <Route
        path="*"
        element={<Navigate to={ctx.isAuthenticated ? homePath(ctx) : '/login'} replace />}
      />
    </Routes>
  );
}
