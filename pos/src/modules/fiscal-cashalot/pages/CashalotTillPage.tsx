// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-cashalot/pages/CashalotTillPage.tsx
//
// `/fiscal` on the till: the shift, cash in/out, and — the one thing Cashalot
// adds — a banner while the register runs in test mode, so a cashier never
// sells a real day on test receipts. No offline reserve and no register-holder
// panel: the adapter has no `offline` capability (Cashalot runs its own).
//
// A store with a second register — another ФОП's (track ДК,
// TechDocs/POS_DUAL_REGISTER.md) — runs two shifts: one block per register,
// each opened, closed and reported on its own. Register 1's status carries the
// others, so one poll draws them all.

import { ShieldCheck } from '@pos/platform/ui';
import { ShiftPanel } from '../../fiscal-core/components/ShiftPanel';
import { FiscalErrorCard } from '../../fiscal-core/components/FiscalErrorCard';
import { ServiceReceiptForm } from '../../fiscal-core/components/ServiceReceiptForm';
import { useFiscalStatus } from '../../fiscal-core/hooks/useFiscalStatus';
import type { FiscalStatus } from '../../fiscal-core/types';
import { TestingBanner } from './CashalotAdminPage';
import { registerTitle } from '../lib/registerTitle';

function RegisterBlock({
  status,
  registerNo,
  titled,
  onChanged,
}: {
  status: FiscalStatus;
  registerNo: number;
  /** A heading only where there is more than one register. */
  titled: boolean;
  onChanged: () => void;
}) {
  return (
    <section className="space-y-4" data-testid={`fiscal-register-${registerNo}`}>
      {titled && <h2 className="text-lg font-semibold text-sq-heading">{registerTitle(registerNo, status.label)}</h2>}
      {status.testing === true && <TestingBanner where="till" />}
      <ShiftPanel status={status} onChanged={onChanged} registerNo={registerNo} />
      {status.shift?.status === 'open' && <ServiceReceiptForm registerNo={registerNo} />}
    </section>
  );
}

export function CashalotTillPage() {
  const { status, isLoading, error, refresh } = useFiscalStatus();
  const extra = status?.registers ?? [];

  return (
    <div className="flex-1 overflow-auto px-4 py-5 md:px-7 max-w-xl mx-auto w-full space-y-4 text-sq-text">
      <div className="flex items-center gap-3 pb-1">
        <ShieldCheck size={24} className="shrink-0" />
        <h1 className="text-2xl font-bold text-sq-heading">{extra.length > 0 ? 'Зміни ПРРО' : 'Зміна ПРРО'}</h1>
      </div>

      {isLoading && <p className="text-[15px] text-sq-muted">Завантаження…</p>}
      {Boolean(error) && <FiscalErrorCard error={error} />}

      {status && (
        <>
          <RegisterBlock status={status} registerNo={1} titled={extra.length > 0} onChanged={() => void refresh()} />
          {extra.map((other) => (
            <RegisterBlock
              key={other.register_no}
              status={other}
              registerNo={other.register_no ?? 2}
              titled
              onChanged={() => void refresh()}
            />
          ))}
        </>
      )}
    </div>
  );
}
