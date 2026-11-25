// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ReactNode } from 'react';
import { useAuthStore } from '@pos/platform';
import { AppRail } from './AppRail';
import { BottomNav } from './BottomNav';
import { OfflineStatusBanner } from './OfflineStatusBanner';
import { ModuleSlots } from '../../modules/ModuleSlots';
import { useModuleSlots } from '../../modules/featureSlots';

/**
 * Cashier-shell chrome (rail/bottom nav + offline banner) around whatever a
 * "root" route renders — host-only, mirrors `AdminLayout` for the `/admin`
 * mount. Kept out of `@pos/platform/ui` on purpose: `AppRail`/`BottomNav`
 * read the full module registry, so a module rendering this itself would
 * pull every other module's lazy pages into its own remote artifact (see
 * TechDocs/POS_MODULE_REMOTE_POC.md). Applied once here in the host router
 * instead — a module page is just its own content.
 */
export function CashierLayout({ children }: { children: ReactNode }) {
  const logout = useAuthStore((s) => s.logout);
  // Modules' strips over every till screen (`till.Banner`, platform 25): the
  // remote kitchen's «Запити з точок» stands over the kitchen's board this way
  // without the board — another module's page — knowing it exists.
  const banners = useModuleSlots('till.Banner');

  return (
    // `--lic-h` is the height of the licence notice strip, when a copy without a
    // key shows one (`LicenseNoticeStrip`): the frame starts under it and ends
    // at the bottom of the screen, so «Оплатити» is never pushed out of sight.
    <div className="h-[calc(100dvh-var(--lic-h,0px))] flex bg-sq-bg font-sans overflow-hidden">
      <AppRail onLogout={() => void logout()} />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <OfflineStatusBanner />
        {banners.length > 0 && (
          <div className="shrink-0 max-h-[50dvh] overflow-y-auto empty:hidden" data-testid="till-banners">
            <ModuleSlots slots={banners} slot="till.Banner" props={{}} />
          </div>
        )}
        {children}
        <div className="lg:hidden shrink-0">
          <BottomNav onLogout={() => void logout()} />
        </div>
      </div>
    </div>
  );
}
