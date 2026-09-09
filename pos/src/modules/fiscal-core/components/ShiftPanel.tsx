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
      <div role="alert" className="rounded-sq bg-red-50 px-3 py-2.5 text-sm text-red-700">
        <p className="font-semibold">ПРРО не налаштовано</p>
        {status.error?.message && <p className="mt-1">{status.error.message}</p>}
      </div>
    );
  }

  const shiftOpen = status.shift?.status === 'open';

  return (
    <div className="space-y-4">
      <div className="rounded-sq bg-sq-surface border border-sq-divider p-4">
        <p className="sq-section-label">Зміна</p>
        <p className={`mt-1 text-lg font-semibold ${shiftOpen ? 'text-emerald-600' : 'text-sq-secondary'}`}>
          {shiftOpen ? 'Відкрита' : 'Закрита'}
        </p>
        {status.shift?.opened_at && (
          <p className="mt-1 text-xs text-sq-muted">
            Відкрита: {new Date(status.shift.opened_at).toLocaleString('uk-UA')}
          </p>
        )}
        {status.error && (
          <p className="mt-2 text-sm text-red-600">{status.error.message}</p>
        )}
      </div>

      {Boolean(error) && <FiscalErrorCard error={error} />}

      <div className="flex flex-wrap gap-2">
        {!shiftOpen ? (
          <button type="button" className="pos-btn-primary px-4 py-2" disabled={busy} onClick={() => void open()}>
            Відкрити зміну
          </button>
        ) : (
          <>
            <button
              type="button"
              className="rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium"
              disabled={busy}
              onClick={() => void xReport()}
            >
              X-звіт
            </button>
            <button
              type="button"
              className="rounded-sq border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700"
              disabled={busy}
              onClick={() => void close()}
            >
              Закрити зміну
            </button>
          </>
        )}
      </div>

      {xReportText && (
        <pre className="max-h-64 overflow-auto rounded-sq bg-sq-bg p-3 font-mono text-xs whitespace-pre-wrap">
          {xReportText}
        </pre>
      )}
      {zReportText && (
        <div>
          <p className="sq-section-label">Z-звіт</p>
          <pre className="mt-1 max-h-64 overflow-auto rounded-sq bg-sq-bg p-3 font-mono text-xs whitespace-pre-wrap">
            {zReportText}
          </pre>
        </div>
      )}
    </div>
  );
}
