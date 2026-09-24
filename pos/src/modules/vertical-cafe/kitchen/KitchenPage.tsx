// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * «Кухня» — the board behind the counter (TechDocs/POS_CAFE.md §10, К3c).
 *
 * Two columns and two taps: «В роботі» is what is being made, «Видача» is
 * what waits on the shelf; «Готово» moves an order from the first to the
 * second, «Видано» takes it off. No timer moves anything — a card leaves the
 * board only when somebody handed the order over. The second tab is the
 * day's stop-list: what the kitchen is not making today, which is the
 * kitchen's call to make at seven in the morning.
 *
 * Online only, like the module itself: the orders live on the server and so
 * does the day. The host mounts this route inside `CashierLayout` in both
 * shells, so only the content is drawn here.
 */

import { useEffect, useState } from 'react';
import { ChefHat, WifiOff } from '@pos/platform/ui';
import { useOfflineStatus, useVertical } from '@pos/platform';
import { HostTooOldError, missingHostApi } from '../lib/hostPlatform';
import { OrdersTab } from './OrdersTab';
import { StopListTab } from './StopListTab';
import * as kitchenApi from './kitchenApi';
import { groupStopList } from './lib/kitchen';

type Tab = 'orders' | 'stop';

export default function KitchenPage() {
  // Into the route's error boundary: a host this old cannot draw the board,
  // and a plain card says so better than a `TypeError` from the first call.
  const missing = missingHostApi();
  if (missing.length > 0) throw new HostTooOldError(missing);
  return <KitchenBody />;
}

function KitchenBody() {
  const vertical = useVertical();
  const online = useOfflineStatus((s) => s.online);
  const [tab, setTab] = useState<Tab>('orders');
  // «Стоп-лист · 2» on the tab, read once here; the tab itself keeps it current.
  const [stopped, setStopped] = useState<number | null>(null);

  useEffect(() => {
    if (!online || vertical.id !== 'cafe') return;
    let cancelled = false;
    void kitchenApi
      .menu()
      .then((menu) => {
        if (!cancelled) setStopped(groupStopList(menu).filter((r) => r.stop_listed).length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [online, vertical.id]);

  if (vertical.id !== 'cafe') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-sq-text">Кухня</h1>
        <p className="mt-2 text-sm text-amber-700">
          Магазин зараз не на вертикалі кафе. Тип магазину змінює адміністратор платформи.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-sq-bg text-sq-text" data-testid="kitchen-board">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-7 py-4 md:min-h-[72px] shrink-0">
        <div className="flex items-center gap-3">
          <ChefHat size={24} />
          <h1 className="text-2xl font-bold text-sq-heading">Кухня</h1>
        </div>
        <div className="flex gap-1 p-[3px] rounded-xl bg-sq-empty">
          <TabButton active={tab === 'orders'} onClick={() => setTab('orders')} testId="kitchen-tab-orders">
            Замовлення
          </TabButton>
          <TabButton active={tab === 'stop'} onClick={() => setTab('stop')} testId="kitchen-tab-stop">
            {stopped ? `Стоп-лист · ${stopped}` : 'Стоп-лист'}
          </TabButton>
        </div>
      </div>

      {!online ? (
        <div
          className="mx-4 md:mx-7 rounded-card bg-white shadow-card p-8 text-center"
          data-testid="kitchen-offline"
        >
          <WifiOff size={48} className="mx-auto text-sq-muted" />
          <p className="mt-3 text-sm font-medium">Потрібна мережа</p>
          <p className="mt-1 text-xs text-sq-secondary">
            Замовлення живуть на сервері. Дошка оновиться, щойно звʼязок повернеться.
          </p>
        </div>
      ) : tab === 'orders' ? (
        <OrdersTab />
      ) : (
        <StopListTab onCount={setStopped} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`min-h-[38px] rounded-[9px] px-4 text-[15px] transition-colors ${
        active
          ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
          : 'font-medium text-sq-secondary'
      }`}
    >
      {children}
    </button>
  );
}
