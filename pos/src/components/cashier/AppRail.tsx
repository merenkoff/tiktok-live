// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { LogOut } from 'lucide-react';
import { Nav } from '../Nav';

interface Props {
  /** Kept for call-site compatibility; nav visibility now comes from the module registry. */
  isOwner?: boolean;
  onLogout: () => void;
}

export function AppRail({ onLogout }: Props) {
  return (
    <nav
      className="hidden lg:flex w-14 shrink-0 flex-col items-center py-3 bg-[#1A1A1A] text-white"
      aria-label="Меню каси"
    >
      <div className="flex flex-col items-center gap-1 flex-1">
        <Nav location="cashier-primary" variant="rail" />
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="w-12 h-12 grid place-items-center rounded-sq transition-colors text-white/70 hover:text-white hover:bg-white/10"
        title="Вихід"
      >
        <LogOut size={22} strokeWidth={1.75} />
      </button>
    </nav>
  );
}
