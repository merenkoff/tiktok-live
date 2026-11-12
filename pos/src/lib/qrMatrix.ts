// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A QR code as a grid of dark modules, for the screen (`QrCode`) and for the
// receipt picture (`receiptImage.ts`). The same library the server draws the
// guest menu's QR codes with (`src/pos/public-menu/render.ts`).

import qrcode from 'qrcode-generator';

/** `true` = a dark module. Error correction M, the smallest type that fits. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < size; r += 1) {
    const cells: boolean[] = [];
    for (let c = 0; c < size; c += 1) cells.push(qr.isDark(r, c));
    rows.push(cells);
  }
  return rows;
}

/**
 * One SVG path for every dark module, in module units — horizontal runs merged,
 * so a 33×33 code is a few hundred commands rather than a thousand rects.
 */
export function qrPath(matrix: boolean[][], offset = 0): string {
  const parts: string[] = [];
  matrix.forEach((cells, r) => {
    let c = 0;
    while (c < cells.length) {
      if (!cells[c]) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < cells.length && cells[c]) c += 1;
      parts.push(`M${start + offset} ${r + offset}h${c - start}v1h${start - c}z`);
    }
  });
  return parts.join('');
}
