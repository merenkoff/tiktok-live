// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Прийом запитів» on the kitchen's till (РК4): «Пауза» and «Черга зараз»
// where the cook works. The owner's cabinet has the same controls on
// «Точки», but a cook signs in with a PIN and never reaches `/admin` — and
// the rush is exactly when the kitchen must be able to stop new promises.
// The server route (`PUT /remote-kitchen/status`) is open to any of the
// kitchen's people; the till's nav entry shows only where the login says the
// store is a kitchen.

import { PageHeader } from '@pos/platform/ui';
import { KitchenPointsSection } from '../admin/KitchenPointsSection';

export function KitchenTillPage(): JSX.Element {
  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 py-4 md:px-7 text-sq-text">
      <div className="max-w-3xl">
        <PageHeader title="Прийом запитів" subtitle="Пауза й черга для кафе, які питають цю кухню." />
        <KitchenPointsSection />
      </div>
    </div>
  );
}

export default KitchenTillPage;
