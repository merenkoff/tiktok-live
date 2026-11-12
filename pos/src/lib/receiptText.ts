// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A receipt as lines of a fixed-width roll — what the customer gets as a
// picture in a messenger when there is no printer (TechDocs/POS_PHONE_TILL.md,
// phase Т1). The same rows, in the same order, as `ReceiptPrintable` and the
// thermal `receipt.rs`: a picture must not say less than the paper would.
// Pure, so the layout is tested without a canvas; `receiptImage.ts` draws it.

import type { ReceiptData, ReceiptVatLine } from './printer';

export interface ReceiptLine {
  text: string;
  /** Drawn heavier — the store's name, «ДО СПЛАТИ», «ФІСКАЛЬНИЙ ЧЕК». */
  bold?: boolean;
  /** Centred rather than flush left. */
  center?: boolean;
}

/** 80 mm roll: 48 characters, as `receipt_width` 48 on the provider's text. */
export const RECEIPT_COLUMNS = 48;

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function signedMoney(cents: number) {
  return `${cents < 0 ? '-' : '+'}${money(Math.abs(cents))}`;
}

function paymentLabel(method: string) {
  if (method === 'cash') return 'ГОТІВКА';
  if (method === 'card') return 'БЕЗГОТІВКОВА (картка)';
  if (method === 'qr') return 'БЕЗГОТІВКОВА (QR)';
  return `ІНШЕ (${method})`;
}

function vatLabel(line: ReceiptVatLine) {
  return `${line.name?.trim() || 'ПДВ'} ${line.symbol} ${line.rate}%`;
}

/** Words wrapped to the width; a word longer than a line is cut, a leading indent kept. */
export function wrapText(text: string, cols: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    const indent = (/^ */.exec(paragraph)?.[0] ?? '').slice(0, Math.max(0, cols - 1));
    let line = indent;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      while (rest.length > cols) {
        if (line.trim()) out.push(line);
        line = '';
        out.push(rest.slice(0, cols));
        rest = rest.slice(cols);
      }
      if (!rest) continue;
      if (!line.trim()) line = line.length + rest.length <= cols ? line + rest : rest;
      else if (line.length + 1 + rest.length <= cols) line = `${line} ${rest}`;
      else {
        out.push(line);
        line = rest;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * «СУМА ........ 120.00»: the label on the left, the figure flush right. A
 * label too long to leave room is wrapped and the figure goes on its last line.
 */
export function row(left: string, right: string, cols: number): string[] {
  const room = cols - right.length - 1;
  const lines = wrapText(left, Math.max(1, room));
  const last = lines.pop() ?? '';
  return [...lines, last + ' '.repeat(Math.max(1, cols - last.length - right.length)) + right];
}

function divider(cols: number): ReceiptLine {
  return { text: '-'.repeat(cols) };
}

/** The receipt as lines. The provider's own text, when it came, is the receipt. */
export function receiptLines(receipt: ReceiptData, cols: number = RECEIPT_COLUMNS): ReceiptLine[] {
  if (receipt.provider_text?.trim()) {
    return receipt.provider_text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .flatMap((line) => (line.length > cols ? wrapText(line, cols) : [line]))
      .map((text) => ({ text }));
  }

  const out: ReceiptLine[] = [];
  const push = (text: string, opts: Omit<ReceiptLine, 'text'> = {}) => {
    for (const piece of wrapText(text, cols)) out.push({ text: piece, ...opts });
  };
  const pushRow = (left: string, right: string, opts: Omit<ReceiptLine, 'text'> = {}) => {
    for (const piece of row(left, right, cols)) out.push({ text: piece, ...opts });
  };

  push(receipt.store_name, { bold: true, center: true });
  const header = receipt.header;
  if (header) {
    for (const line of [header.org_name, header.point_name, header.address, header.tax_id_line]) {
      if (line && line.trim()) push(line, { center: true });
    }
  }
  if (receipt.kind === 'refund') {
    push(`ВИДАТКОВИЙ ЧЕК ${receipt.receipt_number}`);
    if (receipt.refund_of_receipt) push(`до чека ${receipt.refund_of_receipt}`);
  } else {
    if (receipt.order_no != null) push(`Замовлення № ${receipt.order_no}`, { bold: true });
    else if (receipt.order_label) push(`Замовлення ${receipt.order_label}`, { bold: true });
    push(`Чек ${receipt.receipt_number}`);
  }
  push(receipt.created_at);
  out.push(divider(cols));

  for (const item of receipt.items) {
    push(`${item.name} ${item.variant_label}`.trim());
    pushRow(
      `  ${item.quantity_text ?? `${item.quantity} x ${money(item.unit_price_cents)}`}`,
      `${money(item.line_total_cents)}${item.tax_symbol ? ` ${item.tax_symbol}` : ''}`
    );
    if (item.note) push(`  ${item.note}`);
    for (const label of item.excise_labels ?? []) push(`  Марка ${label}`);
  }
  out.push(divider(cols));

  const rounding = receipt.rounding_cents ?? 0;
  pushRow('СУМА', money(receipt.subtotal_cents));
  if (receipt.discount_cents) pushRow('Знижка', `-${money(receipt.discount_cents)}`);
  if (rounding && receipt.discount_cents) pushRow('УСЬОГО', money(receipt.total_cents));
  for (const line of receipt.vat_lines ?? []) pushRow(vatLabel(line), money(line.amount_cents));
  if (rounding) pushRow('ЗАОКРУГЛЕННЯ', signedMoney(rounding));
  pushRow(receipt.kind === 'refund' ? 'ДО ПОВЕРНЕННЯ' : 'ДО СПЛАТИ', money(receipt.total_cents + rounding), {
    bold: true,
  });
  out.push(divider(cols));

  for (const p of receipt.payments) pushRow(paymentLabel(p.method), money(p.amount_cents));
  if (receipt.change_cents && receipt.change_cents > 0) pushRow('РЕШТА', money(receipt.change_cents));

  const fiscal = receipt.fiscal;
  if (fiscal) {
    const offline = Boolean(fiscal.offline || fiscal.mode === 'offline');
    out.push(divider(cols));
    pushRow('ФІСКАЛЬНИЙ ЧЕК', fiscal.producer ?? '', { bold: true });
    push(offline ? 'ОФЛАЙН' : 'ОНЛАЙН');
    pushRow('ЧЕК №', fiscal.fiscal_code);
    if (fiscal.control_number) pushRow('Контрольне число', fiscal.control_number);
    if (fiscal.register_fiscal_number) pushRow('ФН ПРРО', fiscal.register_fiscal_number);
    if (fiscal.fiscal_date) push(fiscal.fiscal_date);
    if (!fiscal.tax_url && offline) push('QR буде після синхронізації з ПРРО');
  }

  out.push(divider(cols));
  push(`Касир: ${receipt.staff_name}`);
  if (receipt.customer_name) push(`Клієнт: ${receipt.customer_name}`);
  push(receipt.kind === 'refund' ? 'Кошти повернуто' : 'Дякуємо за покупку!', { center: true });
  return out;
}
