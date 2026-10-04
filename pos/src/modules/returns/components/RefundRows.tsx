// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { formatUah } from '@pos/platform';
import type { SaleDetail } from '@pos/platform';
import { Printer } from '@pos/platform/ui';
import { FiscalBadge } from './FiscalBadge';
import { Chip } from './SaleChips';
import { needsAct, PAYMENT_LABEL_UK, reasonLabel } from '../lib/refundReasons';

type Refund = SaleDetail['refunds'][number];

/**
 * The refunds of a receipt, one row each — shared by the till's «Чеки» and
 * the owner's «Продажі», which used to spell the same line twice. Says what
 * the refund says about itself (migration 064): the ground, the buyer named
 * for the act, the write-off a «Брак» return made, whether the return
 * receipt was registered, and the new receipt when it was an exchange. The
 * «Акт» button prints the act for any refund above 100 ₴, buyer or no
 * buyer — a blank line on paper is what the cashier fills in by hand.
 */
export function RefundRows({
  sale,
  onPrintAct,
}: {
  sale: SaleDetail;
  onPrintAct?: (refund: Refund) => void;
}) {
  return (
    <ul>
      {sale.refunds.map((r) => {
        const reason = reasonLabel(r.reason_code);
        const detail = [
          r.method ? PAYMENT_LABEL_UK[r.method] : null,
          reason,
          r.reason,
        ].filter((s): s is string => Boolean(s && s.trim()));
        return (
          <li key={r.id} className="sq-row min-h-11 py-2 text-[15px]" data-testid="refund-row">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="text-sq-secondary tabular-nums">
                  {r.refund_number ?? '—'}
                  {detail.length > 0 ? ` · ${detail.join(' · ')}` : ''}
                </p>
                {(r.buyer_name || r.buyer_document) && (
                  <p className="text-[13px] text-sq-muted truncate">
                    {[r.buyer_name, r.buyer_document].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.writeoff_doc_number && <Chip tone="warning">Списано як брак · {r.writeoff_doc_number}</Chip>}
                  {r.exchange_sale && <Chip>Обмін → {r.exchange_sale.receipt_number}</Chip>}
                  <FiscalBadge status={r.fiscal_status} mode={r.fiscal?.mode} />
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className="text-sq-text tabular-nums">−{formatUah(r.total_cents)}</span>
                {onPrintAct && needsAct(r.total_cents) && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-sq-blue min-h-8"
                    onClick={() => onPrintAct(r)}
                    aria-label={`Акт про видачу коштів ${r.refund_number ?? ''}`.trim()}
                  >
                    <Printer size={16} />
                    Акт
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
