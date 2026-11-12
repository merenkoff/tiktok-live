// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it, vi } from 'vitest';
import { receiptFileName, receiptShareText, shareReceiptImage, shareReceiptLink } from './shareReceipt';
import { qrMatrix, qrPath } from './qrMatrix';

const URL_ = 'https://cabinet.tax.gov.ua/cashregs/check?id=12345678';

function nav(over: Record<string, unknown> = {}) {
  return {
    share: vi.fn().mockResolvedValue(undefined),
    canShare: vi.fn().mockReturnValue(true),
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    ...over,
  } as unknown as Navigator;
}

describe('receiptShareText', () => {
  it('names the shop and the receipt and gives the tax office link', () => {
    expect(receiptShareText({ storeName: 'Evelin', receiptNumber: 'R-42', taxUrl: URL_ })).toBe(
      `Evelin, чек R-42.\nПеревірити в Податковій: ${URL_}`
    );
    expect(receiptShareText({ storeName: '', receiptNumber: 'R-42', taxUrl: null })).toBe('Чек R-42.');
  });

  it('makes a file name a messenger keeps', () => {
    expect(receiptFileName('R-000042')).toBe('chek-R-000042.png');
    expect(receiptFileName('OFF 1/2')).toBe('chek-OFF-1-2.png');
  });
});

describe('shareReceiptImage', () => {
  const file = new File(['x'], 'chek.png', { type: 'image/png' });

  it('shares the picture with the text where files can be shared', async () => {
    const n = nav();
    expect(await shareReceiptImage({ file, text: 't', title: 'T' }, n)).toBe('shared');
    expect(n.share).toHaveBeenCalledWith({ files: [file], text: 't', title: 'T' });
  });

  it('shares the text alone where files cannot', async () => {
    const n = nav({ canShare: vi.fn().mockReturnValue(false) });
    expect(await shareReceiptImage({ file, text: 't', title: 'T' }, n)).toBe('shared');
    expect(n.share).toHaveBeenCalledWith({ text: 't', title: 'T' });
  });

  it('copies the text where there is no share sheet', async () => {
    const n = nav({ share: undefined, canShare: undefined });
    expect(await shareReceiptImage({ file: null, text: 't', title: 'T' }, n)).toBe('copied');
    expect(n.clipboard.writeText).toHaveBeenCalledWith('t');
  });

  it('says nothing when the seller closes the sheet', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    const n = nav({ share: vi.fn().mockRejectedValue(abort) });
    expect(await shareReceiptImage({ file, text: 't', title: 'T' }, n)).toBe('cancelled');
  });
});

describe('shareReceiptLink', () => {
  it('shares no file and falls back to the clipboard', async () => {
    const n = nav();
    expect(await shareReceiptLink({ text: 't', title: 'T' }, n)).toBe('shared');
    expect(n.share).toHaveBeenCalledWith({ text: 't', title: 'T' });
    const failing = nav({ share: vi.fn().mockRejectedValue(new Error('NotAllowed')) });
    expect(await shareReceiptLink({ text: 't', title: 'T' }, failing)).toBe('copied');
  });
});

describe('qrMatrix', () => {
  it('draws a square code with its three finder patterns', () => {
    const m = qrMatrix(URL_);
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((r) => r.length === m.length)).toBe(true);
    const n = m.length;
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[r][c] && m[r + 6][c + 6] && m[r + 3][c + 3]).toBe(true);
      expect(m[r + 1][c + 1]).toBe(false);
    }
    expect(qrPath([[true, true, false, true]], 4)).toBe('M4 4h2v1h-2zM7 4h1v1h-1z');
  });
});
