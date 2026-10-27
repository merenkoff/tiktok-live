// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-checkbox/pages/CheckboxTillPage.tsx
//
// What `/fiscal` renders on the till: shift status/open/close/X-report, the
// offline reserve and register-holder panels, plus cash in/out. All of it is
// provider-neutral (the panels live in `fiscal-core`), so this page is mostly
// wiring — the provider-specific part of this module is the credentials
// screen, `CheckboxAdminPage`.

import { ShieldCheck } from '@pos/platform/ui';
import { ShiftPanel } from '../../fiscal-core/components/ShiftPanel';
import { FiscalErrorCard } from '../../fiscal-core/components/FiscalErrorCard';
import { HolderPanel } from '../../fiscal-core/components/HolderPanel';
import { OfflinePanel } from '../../fiscal-core/components/OfflinePanel';
import { ServiceReceiptForm } from '../../fiscal-core/components/ServiceReceiptForm';
import { useFiscalStatus } from '../../fiscal-core/hooks/useFiscalStatus';

export function CheckboxTillPage() {
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
          <ShiftPanel status={status} onChanged={() => void refresh()} />
          {/* Both render nothing unless the store actually sells offline, so a
              store without it sees the screen it had before. */}
          <OfflinePanel status={status} />
          <HolderPanel status={status} onChanged={() => void refresh()} />
          {status.shift?.status === 'open' && <ServiceReceiptForm />}
        </>
      )}
    </div>
  );
}
