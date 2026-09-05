// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { LogOut } from 'lucide-react';
import { Nav } from '../Nav';

interface Props {
  onLogout: () => void;
}

export function BottomNav({ onLogout }: Props) {
  return (
    <nav className="h-14 border-t border-sq-divider bg-white flex items-stretch px-2">
      <Nav location="cashier-primary" variant="bottom" />
      <button
        type="button"
        onClick={onLogout}
        className="flex-1 flex flex-col items-center justify-center text-sq-secondary hover:text-sq-text"
      >
        <LogOut size={20} strokeWidth={1.75} />
        <span className="text-[11px] mt-0.5 font-medium">Вихід</span>
      </button>
    </nav>
  );
}
