// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The receipt as a PNG, for sending to the customer through Viber, Telegram or
// Messages from a phone that has no printer (TechDocs/POS_PHONE_TILL.md, Т1).
// The lines come from `receiptLines`; the tax office's QR goes under them, so
// the picture can be checked the way the paper is. Browser-only (a canvas).

import type { ReceiptData } from './printer';
import { qrMatrix } from './qrMatrix';
import { RECEIPT_COLUMNS, receiptLines } from './receiptText';

/** Wide enough to read on a phone without zooming, narrow enough to stay small. */
const WIDTH = 720;
const PADDING = 32;
const FONT = '"SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';

/** The receipt as a PNG; `null` where there is no canvas (tests, an old browser). */
export async function renderReceiptPng(receipt: ReceiptData, taxUrl: string | null): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const lines = receiptLines(receipt, RECEIPT_COLUMNS);
  // A size at which one character is 1/48 of the inner width.
  ctx.font = `20px ${FONT}`;
  const charWidth = ctx.measureText('0').width || 12;
  const fontSize = Math.floor((20 * (WIDTH - PADDING * 2)) / (charWidth * RECEIPT_COLUMNS));
  const lineHeight = Math.round(fontSize * 1.35);

  const qr = taxUrl ? qrMatrix(taxUrl) : null;
  const qrModule = qr ? Math.floor(320 / qr.length) : 0;
  const qrSide = qr ? qrModule * qr.length : 0;
  const qrBlock = qr ? qrSide + PADDING + lineHeight * 2 : 0;

  canvas.width = WIDTH;
  canvas.height = PADDING * 2 + lines.length * lineHeight + qrBlock;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111111';
  ctx.textBaseline = 'top';

  let y = PADDING;
  for (const line of lines) {
    ctx.font = `${line.bold ? '700 ' : ''}${fontSize}px ${FONT}`;
    const text = line.center ? line.text.trim() : line.text;
    const x = line.center ? (WIDTH - ctx.measureText(text).width) / 2 : PADDING;
    ctx.fillText(text, x, y);
    y += lineHeight;
  }

  if (qr) {
    y += PADDING / 2;
    const x0 = Math.round((WIDTH - qrSide) / 2);
    qr.forEach((cells, r) =>
      cells.forEach((dark, c) => {
        if (dark) ctx.fillRect(x0 + c * qrModule, y + r * qrModule, qrModule, qrModule);
      })
    );
    y += qrSide + lineHeight / 2;
    ctx.font = `${fontSize}px ${FONT}`;
    const caption = 'Перевірити чек у Податковій';
    ctx.fillText(caption, (WIDTH - ctx.measureText(caption).width) / 2, y);
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
