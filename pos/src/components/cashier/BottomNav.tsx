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
      className="h-16 pb-[env(safe-area-inset-bottom)] border-t border-sq-divider/70 bg-sq-sidebar/95 backdrop-blur flex items-stretch px-2"
    >
      <Nav location="cashier-primary" variant="bottom" />
      <button
        type="button"
        onClick={onLogout}
        className="flex-1 flex flex-col items-center justify-center gap-1 text-sq-secondary"
      >
        <span className="w-14 h-8 grid place-items-center">
          <LogOut size={20} />
        </span>
        <span className="text-[11px] font-semibold leading-none">Вихід</span>
      </button>
    </nav>
  );
}
