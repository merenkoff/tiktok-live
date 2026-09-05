// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@pos/platform';
import { useDragScroll } from '../../hooks/useDragScroll';
import { Nav } from '../../components/Nav';

export function AdminLayout() {
  const auth = useAuthStore((s) => s.auth);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const navRef = useDragScroll<HTMLElement>();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr] bg-[#F5F5F5] font-sans text-[#1A1A1A]">
      <aside className="bg-[#F0F0F0] border-r border-[#E0E0E0] flex flex-col md:sticky md:top-0 md:h-screen">
        <div className="px-4 py-5 border-b border-[#E0E0E0] bg-white">
          <p className="sq-section-label">Cloth POS</p>
          <h1 className="text-lg font-semibold mt-1">{auth?.store.name}</h1>
          <p className="text-sm text-[#6E6E6E] mt-0.5">{auth?.staff.display_name}</p>
        </div>
        <nav
          ref={navRef}
          className="flex md:flex-col overflow-x-auto md:overflow-y-auto md:flex-1 p-2 gap-0.5 select-none"
        >
          <Nav location="admin-sidebar" />
        </nav>
        <div className="mt-auto p-3 space-y-2 border-t border-[#E0E0E0] bg-white">
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="sq-btn-primary w-full px-3 py-2.5 text-sm"
          >
            Відкрити касу
          </button>
          <button
            type="button"
            onClick={() => void logout().then(() => navigate('/login'))}
            className="w-full rounded-[4px] border border-[#E0E0E0] bg-white px-3 py-2.5 text-sm text-[#1A1A1A]"
          >
            Вийти
          </button>
        </div>
      </aside>
      <main className="p-5 md:p-8 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
