// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/components/ShiftPanel.tsx
//
// The till's shift control: status, open/close, X-report. Shared across
// provider bundles because none of it is provider-specific — the backend
// contract (`FiscalProvider.{getShift,openShift,closeShift,xReport}`) is
// already provider-neutral.

import { useState } from 'react';
import { closeFiscalShift, fiscalXReport, openFiscalShift } from '../data/fiscalApi';
import { FiscalErrorCard } from './FiscalErrorCard';
import type { FiscalStatus } from '../types';

export interface ShiftPanelProps {
  status: FiscalStatus;
  onChanged: () => void;
}

export function ShiftPanel({ status, onChanged }: ShiftPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [zReportText, setZReportText] = useState<string | null>(null);
  const [xReportText, setXReportText] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const open = () =>
    run(async () => {
      await openFiscalShift();
      onChanged();
    });

  const close = () =>
    run(async () => {
      const res = await closeFiscalShift();
      setZReportText(res.z_report_text);
      onChanged();
    });

  const xReport = () =>
    run(async () => {
      const res = await fiscalXReport();
      setXReportText(res.text);
    });

  if (!status.configured) {
    // Not a request failure — `GET /fiscal/status` never throws, this is a
    // normal state (`status.error` explains why: no adapter, no credentials).
    // Rendered plainly rather than routed through `FiscalErrorCard`, which
    // expects a caught error it can classify with `diagnose()`.
    return (
      <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700">
        <p className="font-semibold">ПРРО не налаштовано</p>
        {status.error?.message && <p className="mt-1">{status.error.message}</p>}
      </div>
    );
  }

  const shiftOpen = status.shift?.status === 'open';

  return (
    <div className="space-y-4">
      <section className="rounded-card bg-sq-surface shadow-card p-5">
        <p className="text-[13px] font-semibold text-sq-secondary">Зміна</p>
        <p
          className={`mt-1 text-[26px] font-bold leading-tight ${shiftOpen ? 'text-sq-success-ink' : 'text-sq-heading'}`}
        >
          {shiftOpen ? 'Відкрита' : 'Закрита'}
        </p>
        {status.shift?.opened_at && (
          <p className="mt-1 text-[13px] text-sq-muted tabular-nums">
            Відкрита: {new Date(status.shift.opened_at).toLocaleString('uk-UA')}
          </p>
        )}
        {status.error && (
          <p className="mt-2 text-[15px] text-red-600">{status.error.message}</p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {!shiftOpen ? (
            <button
              type="button"
              className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]"
              disabled={busy}
              onClick={() => void open()}
            >
              Відкрити зміну
            </button>
          ) : (
            <>
              <button
                type="button"
                className="flex-1 min-h-[52px] rounded-xl bg-sq-surface px-4 ring-1 ring-inset ring-sq-divider text-[17px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-50"
                disabled={busy}
                onClick={() => void xReport()}
              >
                X-звіт
              </button>
              <button
                type="button"
                className="flex-1 min-h-[52px] rounded-xl bg-red-50 px-4 text-[17px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                disabled={busy}
                onClick={() => void close()}
              >
                Закрити зміну
              </button>
            </>
          )}
        </div>
      </section>

      {Boolean(error) && <FiscalErrorCard error={error} />}

      {xReportText && (
        <pre className="max-h-64 overflow-auto rounded-card bg-sq-surface shadow-card p-4 font-mono text-[13px] whitespace-pre-wrap">
          {xReportText}
        </pre>
      )}
      {zReportText && (
        <section className="rounded-card bg-sq-surface shadow-card p-5">
          <p className="text-[13px] font-semibold text-sq-secondary">Z-звіт</p>
          <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-sq-sidebar p-3 font-mono text-[13px] whitespace-pre-wrap">
            {zReportText}
          </pre>
        </section>
      )}
    </div>
  );
}
