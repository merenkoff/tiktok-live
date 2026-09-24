// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@pos/platform';
import { useDragScroll } from '../../hooks/useDragScroll';
import { Nav } from '../../components/Nav';
import { AppIcon } from '../../components/AppIcon';
import { LogOut } from '../../platform/glyphs';

export function AdminLayout() {
  const auth = useAuthStore((s) => s.auth);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const navRef = useDragScroll<HTMLElement>();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[256px_1fr] bg-sq-surface font-sans text-sq-text">
      {/* Things' sidebar: grey, the app's icon and the store on top, the
          sections as glyph rows in groups, the system ones at the bottom. */}
      <aside className="bg-sq-sidebar md:border-r border-sq-divider/70 flex flex-col md:sticky md:top-0 md:h-screen">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2.5">
          <AppIcon size={32} className="shrink-0" />
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">{auth?.store.name}</h1>
            <p className="text-xs text-sq-muted truncate">{auth?.staff.display_name}</p>
          </div>
        </div>
        <nav
          ref={navRef}
          aria-label="Кабінет"
          className="flex md:flex-col overflow-x-auto md:overflow-y-auto md:flex-1 px-2 pb-2 gap-0.5 select-none"
        >
          <Nav location="admin-sidebar" tillLink />
        </nav>
        <div className="p-2 border-t border-sq-divider/70">
          <button
            type="button"
            onClick={() => void logout().then(() => navigate('/login'))}
            className="w-full flex items-center gap-2.5 min-h-[38px] px-2.5 rounded-lg text-[15px] font-medium text-sq-secondary hover:bg-sq-selected/50 transition-colors"
          >
            <LogOut size={20} className="shrink-0 mx-0.5" />
            Вийти
          </button>
        </div>
      </aside>
      <main className="p-5 md:px-12 md:py-10 min-h-screen min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
