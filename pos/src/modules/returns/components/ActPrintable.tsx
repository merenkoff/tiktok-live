// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ActData } from '../lib/actPayload';

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ₴`;
}

/**
 * The «Акт про видачу коштів» on a sheet of paper. Rendered off-screen at all
 * times and shown only to the print engine — the same arrangement as the
 * receipt, and the `.act-print-area` rules next to `.receipt-print-area` in
 * `tokens.css` are what hide the app around it. A4-shaped rather than a
 * roll: it is signed by two people and kept three years, not handed across
 * the counter.
 */
export function ActPrintable({ act }: { act: ActData | null }) {
  if (!act) return null;
  const legal = [act.org_name, act.address, act.tax_id_line].filter(
    (l): l is string => Boolean(l && l.trim())
  );
  return (
    <div className="act-print-area">
      <p className="act-print-store">{act.store_name}</p>
      {legal.map((line, i) => (
        <p key={i} className="act-print-legal">
          {line}
        </p>
      ))}
      <h1 className="act-print-title">АКТ про видачу коштів</h1>
      <p className="act-print-meta">
        № {act.act_number} від {act.act_date}
      </p>

      <p>
        Підстава: чек № {act.original.receipt_number} від {act.original.date} о {act.original.time}
        {act.original.fiscal_code ? `, фіскальний № ${act.original.fiscal_code}` : ''}.
      </p>
      <p>
        Покупець: {act.buyer_name ?? '____________________________'}
      </p>
      <p>
        Документ, що посвідчує особу: {act.buyer_document ?? '____________________________'}
      </p>

      {act.goods.length > 0 && (
        <table className="act-print-table">
          <thead>
            <tr>
              <th>Товар</th>
              <th>К-сть</th>
              <th>Сума</th>
            </tr>
          </thead>
          <tbody>
            {act.goods.map((g, i) => (
              <tr key={i}>
                <td>
                  {g.name}
                  {g.label ? ` · ${g.label}` : ''}
                </td>
                <td>{g.quantity}</td>
                <td>{money(g.amount_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="act-print-total">
        Видано коштів: {money(act.total_cents)}
        {act.returned_by ? ` ${act.returned_by}` : ''}
      </p>
      <p>
        Видатковий чек № {act.act_number}
        {act.refund_fiscal_code ? `, фіскальний № ${act.refund_fiscal_code}` : ''}.
      </p>

      <div className="act-print-signatures">
        <p>Касир: {act.cashier} ______________</p>
        <p>Покупець: ______________</p>
      </div>
    </div>
  );
}
