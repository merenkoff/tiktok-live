// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { LogOut } from '../../platform/glyphs';
import { AppIcon } from '../AppIcon';
import { Nav } from '../Nav';

interface Props {
  onLogout: () => void;
}

/**
 * The till's sidebar, the way Things draws one: light grey, the app's own
 * icon on top, a colour glyph over a small label per section, the selected one
 * on a grey plate — replacing the dark Square-style rail.
 */
export function AppRail({ onLogout }: Props) {
  return (
    <nav
      className="hidden lg:flex w-[84px] shrink-0 flex-col items-center gap-1 py-3.5 bg-sq-sidebar border-r border-sq-divider/70"
      aria-label="Меню каси"
    >
      <AppIcon size={40} className="mb-3 shrink-0" />
      <div className="flex flex-col items-center gap-1 flex-1 min-h-0 overflow-y-auto">
        <Nav location="cashier-primary" variant="rail" />
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="w-[68px] min-h-[62px] py-2 flex flex-col items-center justify-center gap-1 rounded-xl text-sq-secondary transition-colors hover:bg-sq-selected/50"
        title="Вихід"
      >
        <LogOut size={20} />
        <span className="text-[11px] font-semibold leading-none">Вихід</span>
      </button>
    </nav>
  );
}
