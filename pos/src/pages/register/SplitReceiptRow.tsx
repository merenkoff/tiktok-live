// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { DownloadLine, Printer, ShieldCheck } from '../../platform/glyphs';
import { formatUah } from '../../lib/money';
import type { SaleDetail } from '../../types';

/**
 * One receipt of a cart rung for two registers (track ДК,
 * TechDocs/POS_DUAL_REGISTER.md): whose ФОП it is, its number and sum, its
 * own ПРРО fate, and printing it on its own — each is a separate document.
 */
export function SplitReceiptRow({
  sale,
  caption,
  canPrint,
  printing,
  onPrint,
  onPdf,
}: {
  sale: SaleDetail;
  /** «Каса 2 · Бар». */
  caption: string;
  canPrint: boolean;
  printing: boolean;
  onPrint: () => void;
  onPdf: () => void;
}) {
  const doc = sale.fiscal ?? null;
  const offline = doc?.mode === 'offline' || doc?.mode === 'provider_offline';
  const registered = doc?.status === 'done' && !offline;
  const fate = !doc?.fiscal_code
    ? doc && doc.status !== 'done'
      ? 'ПРРО: реєструється'
      : null
    : offline
      ? `Фіскальний № ${doc.fiscal_code} · офлайн`
      : registered
        ? `Фіскальний № ${doc.fiscal_code}`
        : `Фіскальний № ${doc.fiscal_code} · реєструється`;
  const buttonClass =
    'min-h-11 px-3 rounded-lg bg-white ring-1 ring-sq-divider text-[15px] font-semibold text-sq-text inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-sq-sidebar';
  return (
    <li
      className="rounded-[14px] bg-sq-sidebar px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2"
      data-testid={`sale-split-${sale.fiscal_register ?? 1}`}
    >
      <div className="flex-1 min-w-[12rem]">
        <p className="text-[15px] font-semibold text-sq-text">{caption}</p>
        <p className="text-[13px] text-sq-secondary tabular-nums">
          {sale.receipt_number} · {formatUah(sale.total_cents + (sale.rounding_cents ?? 0))}
        </p>
        {fate && (
          <p
            className={`text-[13px] inline-flex items-center gap-1 ${
              registered ? 'text-sq-success-ink' : 'text-amber-800'
            }`}
          >
            <ShieldCheck size={16} />
            {fate}
          </p>
        )}
      </div>
      {canPrint && (
        <button type="button" className={buttonClass} onClick={onPrint} disabled={printing}>
          <Printer size={18} />
          Друк
        </button>
      )}
      <button type="button" className={buttonClass} onClick={onPdf}>
        <DownloadLine size={18} />
        PDF
      </button>
    </li>
  );
}
