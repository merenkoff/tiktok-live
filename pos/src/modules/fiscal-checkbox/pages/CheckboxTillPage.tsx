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

import { useState } from 'react';
import { ShiftPanel } from '../../fiscal-core/components/ShiftPanel';
import { FiscalErrorCard } from '../../fiscal-core/components/FiscalErrorCard';
import { HolderPanel } from '../../fiscal-core/components/HolderPanel';
import { OfflinePanel } from '../../fiscal-core/components/OfflinePanel';
import { useFiscalStatus } from '../../fiscal-core/hooks/useFiscalStatus';
import { fiscalServiceReceipt } from '../../fiscal-core/data/fiscalApi';

function ServiceReceiptForm() {
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    const uah = Number(amount.replace(',', '.'));
    if (!Number.isFinite(uah) || uah <= 0) return;
    const cents = Math.round(uah * 100) * (direction === 'in' ? 1 : -1);
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await fiscalServiceReceipt(cents);
      setDone(true);
      setAmount('');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-sq bg-sq-surface border border-sq-divider p-4 space-y-3">
      <p className="sq-section-label">Внесення / видача готівки</p>
      <div className="flex gap-2">
        <button
          type="button"
          className={`flex-1 rounded-sq border px-3 py-2 text-sm font-medium ${
            direction === 'in' ? 'border-sq-blue bg-sq-blue/10 text-sq-blue' : 'border-sq-divider'
          }`}
          onClick={() => setDirection('in')}
        >
          Внесення
        </button>
        <button
          type="button"
          className={`flex-1 rounded-sq border px-3 py-2 text-sm font-medium ${
            direction === 'out' ? 'border-sq-blue bg-sq-blue/10 text-sq-blue' : 'border-sq-divider'
          }`}
          onClick={() => setDirection('out')}
        >
          Видача
        </button>
      </div>
      <input
        className="pos-input w-full"
        inputMode="decimal"
        placeholder="Сума, ₴"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      {Boolean(error) && <FiscalErrorCard error={error} />}
      {done && <p className="text-sm text-emerald-600">Чек проведено</p>}
      <button
        type="button"
        className="pos-btn-primary px-4 py-2"
        disabled={busy || !amount}
        onClick={() => void submit()}
      >
        {busy ? 'Проведення…' : 'Провести чек'}
      </button>
    </div>
  );
}

export function CheckboxTillPage() {
  const { status, isLoading, error, refresh } = useFiscalStatus();

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-lg font-semibold">Зміна ПРРО</h1>

      {isLoading && <p className="text-sm text-sq-secondary">Завантаження…</p>}
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
