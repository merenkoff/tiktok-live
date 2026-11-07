// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «QR-меню» — the guest menu's own page (track МР, decision М10): publishing
// it, the short address, the QR stickers, feedback, and what the menu says
// about the place (logo, address, hours, socials, the cork fee). The owner
// reaches it from «Налаштування»; the café's marketer, whose cabinet has no
// «Налаштування», lands here from the menu. Both cards save themselves, so
// this page is only their frame.

import { Link } from 'react-router-dom';
import { api, useAuthStore } from '@pos/platform';
import { PageHeader } from '../../components/ui/Page';
import { QrCode } from '../../platform/glyphs';
import { PublicMenuCard } from './PublicMenuCard';
import { StoreProfileCard } from './StoreProfileCard';

export function QrMenuPage() {
  const role = useAuthStore((s) => s.role());
  const kitchen = useAuthStore((s) => s.auth?.store.vertical?.dishFacts !== false);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="QR-меню"
        glyph={QrCode}
        subtitle="Меню для гостей на телефоні: публікація, QR для друку, відгуки й те, що меню каже про заклад."
      />
      {!kitchen || typeof api.posRequest !== 'function' ? (
        <p className="text-[15px] text-sq-secondary">QR-меню є в кафе й ресторані.</p>
      ) : (
        <div className="space-y-10">
          <PublicMenuCard />
          <StoreProfileCard />
          {role === 'owner' && (
            <p className="text-[15px] text-sq-secondary">
              Решта налаштувань магазину — у розділі{' '}
              <Link to="/admin/settings" className="font-semibold text-sq-blue">
                «Налаштування»
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
