// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Link, NavLink, useLocation } from 'react-router-dom';
import { usePosShell } from '../shell';
import { useAuthStore } from '../hooks/useAuth';
import { useUpdateStore } from '../hooks/useUpdateCheck';
import { MODULES } from '../modules/registry';
import { useEnabledModules } from '../modules/useEnabledModules';
import { selectNavItems } from '../modules/selectNav';
import type { NavCtx, NavItem, NavLocation, NavVariant } from '../modules/types';

interface Props {
  location: NavLocation;
  /** Required for `cashier-primary`; ignored for the admin sidebar. */
  variant?: NavVariant;
}

/**
 * Data-driven navigation: renders whatever {@link selectNavItems} resolves for
 * the current shell/role/variant. Replaces the hand-maintained link lists in
 * `AdminLayout`, `AppRail` and `BottomNav`.
 */
export function Nav({ location, variant }: Props) {
  const shell = usePosShell();
  const role = useAuthStore((s) => s.role());
  const enabled = useEnabledModules();
  const { pathname } = useLocation();
  const updateAvailable = useUpdateStore((s) => s.updateInfo?.update_available ?? false);

  const ctx: NavCtx = { shell, role, variant };
  const items: NavItem[] = selectNavItems(MODULES, enabled, ctx, location);

  if (location === 'admin-sidebar') {
    return (
      <>
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `px-3 py-2.5 rounded-[4px] text-sm font-medium whitespace-nowrap ${
                isActive ? 'sq-nav-active' : 'sq-nav-idle'
              }`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </>
    );
  }

  return (
    <>
      {items.map((n) => {
        const Icon = n.icon;
        const active = pathname.startsWith(n.match ?? n.to);

        if (variant === 'bottom') {
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`flex-1 flex flex-col items-center justify-center ${
                active ? 'text-sq-blue' : 'text-sq-secondary hover:text-sq-text'
              }`}
            >
              {Icon && <Icon size={20} strokeWidth={1.75} />}
              <span className="text-[11px] mt-0.5 font-medium">{n.label}</span>
            </Link>
          );
        }

        const showDot = n.indicator === 'update' && updateAvailable;
        return (
          <Link
            key={n.to}
            to={n.to}
            title={showDot ? `${n.label} · доступне оновлення` : n.label}
            className={`${showDot ? 'relative ' : ''}w-12 h-12 grid place-items-center rounded-sq transition-colors ${
              active ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            {Icon && <Icon size={22} strokeWidth={1.75} />}
            {showDot && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500"
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </>
  );
}
