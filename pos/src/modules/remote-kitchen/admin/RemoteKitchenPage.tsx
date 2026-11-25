// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Віддалена кухня» in the owner's cabinet (РК4, TechDocs/POS_REMOTE_KITCHEN.md
// §11). One page, two sides, drawn from what `GET /remote-kitchen/setup` says
// this store is: a cafe gets «Кухня» — the link's timers and which dishes the
// kitchen cooks — and a kitchen gets «Точки» — its pause and queue, and the
// cafes that ask it. A store can be both; a store with no link is told who
// links stores, and nothing else is asked of the server.

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@pos/platform/ui';
import { serverMessage } from '../lib/hostPlatform';
import { readReportSides, readSetup, type Setup } from './settingsApi';
import { CafeKitchenSection } from './CafeKitchenSection';
import { KitchenPointsSection } from './KitchenPointsSection';
import { ReportSection } from './ReportSection';

export function RemoteKitchenPage(): JSX.Element {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The sides this store has a report on — revoked links included, so the
  // season's «Віддано на точки» stays readable after the link is gone. Null
  // until read, or on a server without the route: the live setup decides then.
  const [reportSides, setReportSides] = useState<Array<'cafe' | 'kitchen'> | null>(null);

  const reload = useCallback(() => {
    readSetup()
      .then((answer) => {
        setSetup(answer);
        setError(null);
      })
      .catch((e) => setError(serverMessage(e, 'Не вдалося прочитати налаштування кухні')));
  }, []);

  useEffect(() => {
    reload();
    let live = true;
    void readReportSides().then((sides) => {
      if (live) setReportSides(sides);
    });
    return () => {
      live = false;
    };
  }, [reload]);

  const reportOn = (side: 'cafe' | 'kitchen') =>
    (side === 'kitchen' ? !!setup?.as_kitchen : !!setup?.as_cafe) || (reportSides?.includes(side) ?? false);

  return (
    <div className="max-w-4xl text-sq-text">
      <PageHeader
        title="Віддалена кухня"
        subtitle="Кафе питає кухню іншого магазину, коли буде страва, і продає її своїм чеком."
      />
      {error && (
        <p role="alert" className="mb-4 text-[15px] text-sq-danger">
          {error}
        </p>
      )}
      {!setup && !error && <p className="text-[15px] text-sq-muted">Завантажую…</p>}
      {setup && !setup.as_cafe && !setup.as_kitchen && (
        <p className="text-[15px] text-sq-secondary" data-testid="rk-not-linked">
          {reportSides && reportSides.length > 0
            ? 'Зв’язку з кухнею зараз немає. Звіт за замовлення, що вже були, — нижче.'
            : 'Цей магазин ще не зв’язаний з кухнею. Зв’язку кафе й кухні створює адміністратор The Live Shop.'}
        </p>
      )}
      <div className="space-y-10">
        {setup?.as_cafe && <CafeKitchenSection link={setup.as_cafe.link} kitchen={setup.as_cafe.kitchen} />}
        {setup?.as_kitchen && <KitchenPointsSection />}
        {setup && reportOn('kitchen') && <ReportSection side="kitchen" />}
        {setup && reportOn('cafe') && <ReportSection side="cafe" />}
      </div>
    </div>
  );
}

export default RemoteKitchenPage;
