// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { LogOut } from '../../platform/glyphs';
import { Nav } from '../Nav';

interface Props {
  onLogout: () => void;
}

/** The phone / portrait-tablet tab bar — Things' light bar, glyph over label. */
export function BottomNav({ onLogout }: Props) {
  return (
    <nav
      aria-label="Меню каси"
      className="min-h-[68px] pb-[env(safe-area-inset-bottom)] box-content border-t border-sq-divider/70 bg-sq-sidebar/95 backdrop-blur flex items-stretch px-1.5"
    >
      <Nav location="cashier-primary" variant="bottom" />
      <button
        type="button"
        onClick={onLogout}
        className="flex-1 min-w-0 flex items-stretch justify-center px-0.5 py-1.5 text-sq-secondary"
      >
        <span className="w-full max-w-[88px] rounded-xl flex flex-col items-center justify-center gap-1 px-1 py-1 active:bg-sq-selected/50">
          <span className="h-6 grid place-items-center">
            <LogOut size={20} />
          </span>
          <span className="text-[11px] font-semibold leading-none">Вихід</span>
        </span>
      </button>
    </nav>
  );
}
