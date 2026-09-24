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
import { Banknote, Check, ShieldCheck } from '@pos/platform/ui';
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
    <section className="rounded-card bg-sq-surface shadow-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Banknote size={24} className="shrink-0" />
        <h2 className="text-[17px] font-semibold text-sq-heading">Внесення / видача готівки</h2>
      </div>
      <div className="flex gap-1 p-[3px] rounded-xl bg-sq-empty">
        {(
          [
            ['in', 'Внесення'],
            ['out', 'Видача'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`flex-1 min-h-[42px] rounded-[9px] text-[15px] transition-colors ${
              direction === value
                ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                : 'font-medium text-sq-secondary hover:text-sq-text'
            }`}
            onClick={() => setDirection(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        className="pos-field tabular-nums"
        inputMode="decimal"
        placeholder="Сума, ₴"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      {Boolean(error) && <FiscalErrorCard error={error} />}
      {done && (
        <p className="flex items-center gap-2 text-[15px] font-medium text-sq-success-ink">
          <Check size={20} className="shrink-0" />
          Чек проведено
        </p>
      )}
      <button
        type="button"
        className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]"
        disabled={busy || !amount}
        onClick={() => void submit()}
      >
        {busy ? 'Проведення…' : 'Провести чек'}
      </button>
    </section>
  );
}

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
