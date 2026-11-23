// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// An X- or Z-report as the provider rendered it, with «Друкувати» under it.
// Shared by the shift panel (X and Z) and the register handover (the Z-report
// of a shift closed on the way out).

import { Printer } from '@pos/platform/ui';
import { useReportPrint } from '../lib/useReportPrint';

export interface ReportTextProps {
  title: string;
  text: string;
  /** A card of its own (the shift panel) or plain inside another card (the handover). */
  card?: boolean;
}

export function ReportText({ title, text, card = false }: ReportTextProps) {
  const { print, printing, status, portal } = useReportPrint();

  return (
    <section
      className={card ? 'rounded-card bg-sq-surface shadow-card p-5' : undefined}
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-sq-secondary">{title}</p>
        <button
          type="button"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-sq-surface px-3 ring-1 ring-inset ring-sq-divider text-[15px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-50"
          disabled={printing}
          onClick={() => void print(text)}
        >
          <Printer size={18} aria-hidden />
          {printing ? 'Друкую…' : 'Друкувати'}
        </button>
      </div>
      <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-sq-sidebar p-3 font-mono text-[13px] whitespace-pre-wrap">
        {text}
      </pre>
      {status && (
        <p role="status" className="mt-2 text-[13px] text-sq-secondary">
          {status}
        </p>
      )}
      {portal}
    </section>
  );
}
