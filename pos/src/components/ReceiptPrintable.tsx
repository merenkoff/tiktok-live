// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ReceiptData, ReceiptVatLine } from '../lib/printer';

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

/** Рядок 18 of Положення № 13: «ГОТІВКА» / «БЕЗГОТІВКОВА» / «ІНШЕ», detail in brackets. */
function paymentLabel(method: string) {
  if (method === 'cash') return 'ГОТІВКА';
  if (method === 'card') return 'БЕЗГОТІВКОВА (картка)';
  if (method === 'qr') return 'БЕЗГОТІВКОВА (QR)';
  return `ІНШЕ (${method})`;
}

/** Рядок 21: «ПДВ А 20%». */
function vatLabel(line: ReceiptVatLine) {
  return `ПДВ ${line.symbol} ${line.rate}%`;
}

// Rendered off-screen at all times; only visible to the browser's print engine
// via the `@media print` rules in tokens.css, so window.print() reproduces the
// same layout the ESC/POS ticket uses (see receipt.rs) instead of the app UI.
export function ReceiptPrintable({ receipt }: { receipt: ReceiptData | null }) {
  if (!receipt) return null;

  // The provider's receipt is a finished document: print it as-is, nothing of
  // ours around it — mirrors the `provider_text` branch in receipt.rs.
  if (receipt.provider_text?.trim()) {
    return (
      <div className="receipt-print-area">
        <pre className="receipt-print-provider">{receipt.provider_text}</pre>
      </div>
    );
  }

  const header = receipt.header;
  const headerLines = header
    ? [header.org_name, header.point_name, header.address, header.tax_id_line].filter(
        (l): l is string => Boolean(l && l.trim())
      )
    : [];
  const fiscal = receipt.fiscal;
  const offline = Boolean(fiscal && (fiscal.offline || fiscal.mode === 'offline'));

  return (
    <div className="receipt-print-area">
      <p className="receipt-print-store">{receipt.store_name}</p>
      {/* Рядки 1–5, in the regulation's order, from the provider's registration. */}
      {headerLines.map((line, i) => (
        <p key={i} className="receipt-print-header">
          {line}
        </p>
      ))}
      {receipt.kind === 'refund' ? (
        <>
          <p>ЧЕК ПОВЕРНЕННЯ {receipt.receipt_number}</p>
          {receipt.refund_of_receipt && <p>до чека {receipt.refund_of_receipt}</p>}
        </>
      ) : (
        <p>Чек {receipt.receipt_number}</p>
      )}
      <p>{receipt.created_at}</p>
      <hr />
      {receipt.items.map((item, i) => (
        <div key={i} className="receipt-print-item">
          <p>
            {item.name} {item.variant_label}
          </p>
          <div className="receipt-print-row">
            <span>
              {item.quantity} x {money(item.unit_price_cents)}
            </span>
            {/* Рядок 11: the rate letter closes the line. */}
            <span>
              {money(item.line_total_cents)}
              {item.tax_symbol ? ` ${item.tax_symbol}` : ''}
            </span>
          </div>
        </div>
      ))}
      <hr />
      <div className="receipt-print-row">
        <span>СУМА</span>
        <span>{money(receipt.subtotal_cents)}</span>
      </div>
      {receipt.discount_cents ? (
        <div className="receipt-print-row">
          <span>Знижка</span>
          <span>-{money(receipt.discount_cents)}</span>
        </div>
      ) : null}
      {(receipt.vat_lines ?? []).map((line, i) => (
        <div key={i} className="receipt-print-row">
          <span>{vatLabel(line)}</span>
          <span>{money(line.amount_cents)}</span>
        </div>
      ))}
      <div className="receipt-print-row receipt-print-total">
        <span>{receipt.kind === 'refund' ? 'ДО ПОВЕРНЕННЯ' : 'ДО СПЛАТИ'}</span>
        <span>{money(receipt.total_cents)}</span>
      </div>
      <hr />
      {receipt.payments.map((p, i) => (
        <div key={i} className="receipt-print-row">
          <span>{paymentLabel(p.method)}</span>
          <span>{money(p.amount_cents)}</span>
        </div>
      ))}
      {receipt.change_cents && receipt.change_cents > 0 ? (
        <div className="receipt-print-row">
          <span>РЕШТА</span>
          <span>{money(receipt.change_cents)}</span>
        </div>
      ) : null}
      {fiscal && (
        <>
          <hr />
          <div className="receipt-print-fiscal">
            {/* Рядок 35. */}
            <div className="receipt-print-row receipt-print-total">
              <span>ФІСКАЛЬНИЙ ЧЕК</span>
              {fiscal.producer ? <span>{fiscal.producer}</span> : null}
            </div>
            {/* Рядок 31: on every ПРРО receipt, online included. */}
            <p>{offline ? 'ОФЛАЙН' : 'ОНЛАЙН'}</p>
            <div className="receipt-print-row">
              <span>ЧЕК №</span>
              <span>{fiscal.fiscal_code}</span>
            </div>
            {fiscal.control_number && (
              <div className="receipt-print-row">
                <span>Контрольне число</span>
                <span>{fiscal.control_number}</span>
              </div>
            )}
            {fiscal.register_fiscal_number && (
              <div className="receipt-print-row">
                <span>ФН ПРРО</span>
                <span>{fiscal.register_fiscal_number}</span>
              </div>
            )}
            {fiscal.fiscal_date && <p>{fiscal.fiscal_date}</p>}
            {fiscal.tax_url ? (
              // No QR library on the web path; the link itself is clickable in
              // a saved PDF, which is what this renderer is for.
              <p className="receipt-print-tax-url">
                Перевірити: <a href={fiscal.tax_url}>{fiscal.tax_url}</a>
              </p>
            ) : (
              offline && <p>QR буде після синхронізації з ПРРО</p>
            )}
          </div>
        </>
      )}
      <hr />
      <p>Касир: {receipt.staff_name}</p>
      {receipt.customer_name && <p>Клієнт: {receipt.customer_name}</p>}
      <p className="receipt-print-thanks">
        {receipt.kind === 'refund' ? 'Кошти повернуто' : 'Дякуємо за покупку!'}
      </p>
    </div>
  );
}
