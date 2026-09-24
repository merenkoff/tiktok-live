// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Link, NavLink, useLocation } from 'react-router-dom';
import { usePosShell, useAuthStore, useEnabledModules, resolveNavIcon } from '@pos/platform';
import { useUpdateStore } from '../hooks/useUpdateCheck';
import { allModules } from '../modules/registry';
import { selectNavItems } from '../modules/selectNav';
import { useNavOverrides } from '../modules/useNavOverrides';
import { adminIconOf, groupNavItems, navGroupLabel } from '../modules/navGroups';
import type { NavCtx, NavItem, NavLocation, NavVariant } from '../modules/types';
import { ShoppingCart } from '../platform/glyphs';

interface Props {
  location: NavLocation;
  /** Required for `cashier-primary`; ignored for the admin sidebar. */
  variant?: NavVariant;
  /** Admin sidebar: add «Каса» (the till) under «Сьогодні». */
  tillLink?: boolean;
}

/**
 * Data-driven navigation: renders whatever {@link selectNavItems} resolves for
 * the current shell/role/variant. Replaces the hand-maintained link lists in
 * `AdminLayout`, `AppRail` and `BottomNav`.
 */
export function Nav({ location, variant, tillLink }: Props) {
  const shell = usePosShell();
  const role = useAuthStore((s) => s.role());
  const enabled = useEnabledModules();
  const overrides = useNavOverrides();
  const { pathname } = useLocation();
  const updateAvailable = useUpdateStore((s) => s.updateInfo?.update_available ?? false);
  const vertical = useAuthStore((s) => s.auth?.store.vertical?.id ?? null);

  const ctx: NavCtx = { shell, role, variant };
  const items: NavItem[] = selectNavItems(allModules(), enabled, ctx, location, overrides);

  if (location === 'admin-sidebar') {
    // Things' sidebar: a glyph and a label per row, the rows split into
    // groups with a quiet caption, the system entries pushed to the bottom.
    // Below `md` the sidebar is a horizontal strip, so the captions go.
    const row = (n: NavItem) => {
      const Icon = resolveNavIcon(adminIconOf(n));
      return (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          title={n.indicator === 'pending' ? `${n.label} — модуль ще не завантажено` : undefined}
          className={({ isActive }) =>
            `flex items-center gap-2.5 min-h-[38px] px-2.5 rounded-lg text-[15px] whitespace-nowrap transition-colors ${
              isActive ? 'bg-sq-selected font-semibold text-sq-text' : 'font-medium text-sq-text hover:bg-sq-selected/50'
            }${n.indicator === 'pending' ? ' opacity-50' : ''}`
          }
        >
          {Icon && <Icon size={24} className="shrink-0" />}
          {n.label}
        </NavLink>
      );
    };
    const till = tillLink ? (
      <NavLink
        key="/register"
        to="/register"
        className="flex items-center gap-2.5 min-h-[38px] px-2.5 rounded-lg text-[15px] font-medium text-sq-text whitespace-nowrap hover:bg-sq-selected/50 transition-colors"
      >
        <ShoppingCart size={24} className="shrink-0" />
        Каса
      </NavLink>
    ) : null;
    const groups = groupNavItems(items);
    if (groups.length === 0 || (groups.length === 1 && groups[0].group === 'top' && !till)) {
      return <>{items.map(row)}</>;
    }
    return (
      <>
        {groups.map(({ group, items: rows }) => {
          const label = navGroupLabel(group, vertical);
          return (
            <div
              key={group}
              role="group"
              aria-label={label ?? undefined}
              className={`flex md:flex-col gap-0.5 ${group === 'system' ? 'md:mt-auto md:pt-4' : ''}`}
            >
              {label && (
                <span className="hidden md:block px-2.5 pt-4 pb-1 text-xs font-semibold text-sq-muted">{label}</span>
              )}
              {rows.map(row)}
              {group === 'top' && till}
            </div>
          );
        })}
        {!groups.some((g) => g.group === 'top') && till}
      </>
    );
  }

  return (
    <>
      {items.map((n) => {
        const Icon = resolveNavIcon(n.icon);
        const active = pathname.startsWith(n.match ?? n.to);
        const pending = n.indicator === 'pending';

        if (variant === 'bottom') {
          // A Things tab bar: the glyph in a soft pill when selected, a label under it.
          return (
            <Link
              key={n.to}
              to={n.to}
              title={pending ? `${n.label} — модуль ще не завантажено` : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 ${pending ? 'opacity-50' : ''}`}
            >
              <span
                className={`w-14 h-8 rounded-full grid place-items-center transition-colors ${
                  active ? 'bg-sq-selected' : ''
                }`}
              >
                {Icon && <Icon size={24} />}
              </span>
              <span className={`text-[11px] font-semibold leading-none ${active ? 'text-sq-text' : 'text-sq-secondary'}`}>
                {n.label}
              </span>
            </Link>
          );
        }

        const showDot = n.indicator === 'update' && updateAvailable;
        const title = pending
          ? `${n.label} — модуль ще не завантажено`
          : showDot
            ? `${n.label} · доступне оновлення`
            : n.label;
        // The till's sidebar the way Things draws one: light, a colour glyph
        // over a small label, the selected entry on a grey plate.
        return (
          <Link
            key={n.to}
            to={n.to}
            title={title}
            aria-label={title}
            className={`relative w-[68px] min-h-[62px] py-2 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors ${
              pending ? 'opacity-50' : active ? 'bg-sq-selected' : 'hover:bg-sq-selected/50'
            }`}
          >
            {Icon && <Icon size={24} />}
            <span
              className={`max-w-[64px] text-center text-[11px] font-semibold leading-[1.15] hyphens-auto break-words ${
                active ? 'text-sq-text' : 'text-sq-secondary'
              }`}
            >
              {n.label}
            </span>
            {showDot && (
              <span
                className="absolute top-1.5 right-2.5 w-2 h-2 rounded-full bg-amber-500"
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </>
  );
}
