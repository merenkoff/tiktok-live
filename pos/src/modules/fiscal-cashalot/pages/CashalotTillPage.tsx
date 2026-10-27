// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-cashalot/pages/CashalotTillPage.tsx
//
// `/fiscal` on the till: the shift, cash in/out, and — the one thing Cashalot
// adds — a banner while the register runs in test mode, so a cashier never
// sells a real day on test receipts. No offline reserve and no register-holder
// panel: the adapter has no `offline` capability (Cashalot runs its own).

import { ShieldCheck } from '@pos/platform/ui';
import { ShiftPanel } from '../../fiscal-core/components/ShiftPanel';
import { FiscalErrorCard } from '../../fiscal-core/components/FiscalErrorCard';
import { ServiceReceiptForm } from '../../fiscal-core/components/ServiceReceiptForm';
import { useFiscalStatus } from '../../fiscal-core/hooks/useFiscalStatus';
import { TestingBanner } from './CashalotAdminPage';

export function CashalotTillPage() {
  const { status, isLoading, error, refresh } = useFiscalStatus();

  return (
    <div className="flex-1 overflow-auto px-4 py-5 md:px-7 max-w-xl mx-auto w-full space-y-4 text-sq-text">
      <div className="flex items-center gap-3 pb-1">
        <ShieldCheck size={24} className="shrink-0" />
        <h1 className="text-2xl font-bold text-sq-heading">Зміна ПРРО</h1>
      </div>

      {isLoading && <p className="text-[15px] text-sq-muted">Завантаження…</p>}
      {Boolean(error) && <FiscalErrorCard error={error} />}

      {status && (
        <>
          {status.testing === true && <TestingBanner where="till" />}
          <ShiftPanel status={status} onChanged={() => void refresh()} />
          {status.shift?.status === 'open' && <ServiceReceiptForm />}
        </>
      )}
    </div>
  );
}
