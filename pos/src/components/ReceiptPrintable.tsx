// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ReceiptData } from '../lib/printer';

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function paymentLabel(method: string) {
  if (method === 'cash') return 'Готівка';
  if (method === 'card') return 'Картка';
  if (method === 'qr') return 'QR-код';
  return method;
}

// Rendered off-screen at all times; only visible to the browser's print engine
// via the `@media print` rules in index.css, so window.print() reproduces the
// same layout the ESC/POS ticket uses (see receipt.rs) instead of the app UI.
export function ReceiptPrintable({ receipt }: { receipt: ReceiptData | null }) {
  if (!receipt) return null;

  return (
    <div className="receipt-print-area">
      <p className="receipt-print-store">{receipt.store_name}</p>
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
            <span>{money(item.line_total_cents)}</span>
          </div>
        </div>
      ))}
      <hr />
      <div className="receipt-print-row">
        <span>Підсумок</span>
        <span>{money(receipt.subtotal_cents)}</span>
      </div>
      {receipt.discount_cents ? (
        <div className="receipt-print-row">
          <span>Знижка</span>
          <span>-{money(receipt.discount_cents)}</span>
        </div>
      ) : null}
      <div className="receipt-print-row receipt-print-total">
        <span>{receipt.kind === 'refund' ? 'ДО ПОВЕРНЕННЯ' : 'РАЗОМ'}</span>
        <span>{money(receipt.total_cents)}</span>
      </div>
      <hr />
      {receipt.payments.map((p, i) => (
        <div key={i} className="receipt-print-row">
          <span>{paymentLabel(p.method)}</span>
          <span>{money(p.amount_cents)}</span>
        </div>
      ))}
      <hr />
      <p>Касир: {receipt.staff_name}</p>
      {receipt.customer_name && <p>Клієнт: {receipt.customer_name}</p>}
      <p className="receipt-print-thanks">
        {receipt.kind === 'refund' ? 'Кошти повернуто' : 'Дякуємо за покупку!'}
      </p>
    </div>
  );
}
