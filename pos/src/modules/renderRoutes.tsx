// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/* eslint-disable react-refresh/only-export-components --
   route-tree builder module: it deliberately exports helpers (renderRoutes) next
   to local layout components; it is never a Fast Refresh boundary. */

import type { ReactNode } from 'react';
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@pos/platform';
import { AdminLayout } from '../pages/admin/AdminLayout';
import { CashierLayout } from '../components/cashier/CashierLayout';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';
import { LoginPage } from '../pages/LoginPage';

// The cross-store admin (TechDocs/POS_SUPER_ADMIN.md): not a module, not a
// store session — mounted on the web shell outside every guard, gated by its
// own password. Lazy, so the store-facing bundle does not carry it.
const SuperAdminApp = lazy(() =>
  import('../super/SuperAdminApp').then((m) => ({ default: m.SuperAdminApp }))
);
// The office television (TechDocs/POS_MENU_WALL.md): its own route, more
// specific than `/super/*`, so it draws without the super shell's tabs and
// without the password form — a read-only key in the address lets it in.
const MenuWallPage = lazy(() =>
  import('../super/wall/MenuWallPage').then((m) => ({ default: m.MenuWallPage }))
);
import type { PosShell } from '../shell';
import type { PosRole } from '../types';
import { allModules, type AnyModuleDescriptor } from './registry';
import { runsInShell } from './shells';
import { moduleOpenTo, routeOpenTo, usesCabinet } from './roles';
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

/**
 * A cabinet page inside the desktop app: the cabinet's padding in a box that
 * scrolls itself, because `CashierLayout` is a fixed-height column. The page's
 * sticky save bar sticks to this box the way it does to the cabinet's `<main>`.
 */
function DesktopAdminPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-sq-surface">
      <div className="p-5 md:px-12 md:py-10 min-w-0">{children}</div>
    </div>
  );
}

function Guard({
  children,
  ownerOnly = false,
  cabinet = false,
}: {
  children: ReactNode;
  ownerOnly?: boolean;
  /** The cabinet: the owner, and the marketer (track МР) for the pages that name it. */
  cabinet?: boolean;
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role());
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (ownerOnly && role !== 'owner') return <Navigate to="/register" replace />;
  if (cabinet && !usesCabinet(role)) return <Navigate to="/register" replace />;
  // The marketer has no till: any root page sends it back to the cabinet.
  if (!cabinet && role === 'marketer') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

/** Where an authenticated user lands from `/login` or an unmatched path. */
export function homePath(ctx: RouteContext): string {
  // The marketer's home is the cabinet's first page it may open (the menu).
  return ctx.shell === 'web' && usesCabinet(ctx.role) ? '/admin' : '/register';
}

export function moduleVisible(m: AnyModuleDescriptor, ctx: RouteContext): boolean {
  if (!runsInShell(m, ctx.shell)) return false;
  if (!moduleOpenTo(m, ctx.role)) return false;
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
      if (!routeOpenTo(m, r, ctx.role)) continue;
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
        // The desktop has no cabinet, but the owner prints price tags there,
        // on the till's own printer — so a page flagged `desktop` is mounted
        // at its cabinet path inside the till's frame (owner only).
        if (ctx.shell === 'cashier' && r.desktop && r.path) {
          rootRoutes.push(
            <Route
              key={`desktop-admin:${m.id}:${r.path}`}
              path={`/admin/${r.path}`}
              element={
                <Guard ownerOnly>
                  <CashierLayout>
                    <DesktopAdminPage>{node}</DesktopAdminPage>
                  </CashierLayout>
                </Guard>
              }
            />
          );
          continue;
        }
        // The `/admin` area itself is web-only; no other shell mounts it.
        if (ctx.shell !== 'web') continue;
        if (r.index) {
          adminIndex = <Route key={`admin-index:${m.id}`} index element={node} />;
        } else if (r.path) {
          // The marketer opens on the menu itself, wherever the module sits in the registry.
          if (firstAdminPath === null || (ctx.role === 'marketer' && r.path === 'products')) {
            firstAdminPath = `/admin/${r.path}`;
          }
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
            <Guard cabinet>
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
      {ctx.shell === 'web' && (
        <Route
          path="/super/wall"
          element={
            <Suspense fallback={<RouteFallback />}>
              <MenuWallPage />
            </Suspense>
          }
        />
      )}
      {ctx.shell === 'web' && (
        <Route
          path="/super/*"
          element={
            <Suspense fallback={<RouteFallback />}>
              <SuperAdminApp />
            </Suspense>
          }
        />
      )}
      <Route
        path="*"
        element={<Navigate to={ctx.isAuthenticated ? homePath(ctx) : '/login'} replace />}
      />
    </Routes>
  );
}
