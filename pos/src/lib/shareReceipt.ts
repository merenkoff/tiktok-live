// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Handing the customer their receipt from a phone (TechDocs/POS_PHONE_TILL.md,
// Т1): the system share sheet, where the seller picks Viber, Telegram or
// Messages. A web page cannot know which app was picked, so the sheet gets
// what every app can use — the text with the tax office's link — and, where the
// browser can share files, the receipt's picture beside it.

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** The words that travel with the receipt: what it is and where to check it. */
export function receiptShareText(input: {
  storeName: string;
  receiptNumber: string;
  taxUrl: string | null;
}): string {
  const head = [input.storeName.trim(), `чек ${input.receiptNumber}`].filter(Boolean).join(', ');
  const first = head.charAt(0).toUpperCase() + head.slice(1);
  return input.taxUrl ? `${first}.\nПеревірити в Податковій: ${input.taxUrl}` : `${first}.`;
}

export function receiptFileName(receiptNumber: string): string {
  return `chek-${receiptNumber.replace(/[^\p{L}\p{N}-]+/gu, '-')}.png`;
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

type ShareNavigator = Navigator & {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
};

/** Can this browser put a file into the share sheet (iOS 15+, Android Chrome)? */
export function canShareFile(file: File, nav: ShareNavigator = navigator): boolean {
  try {
    return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

async function copy(text: string, nav: ShareNavigator): Promise<ShareOutcome> {
  try {
    await nav.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * The picture and the link together — for Viber and Telegram. Without file
 * sharing, the text alone; without a share sheet at all, the text is copied.
 * Must be called straight from the tap: Safari
 * opens the sheet only inside the user's gesture, which is why the picture is
 * made in advance, not here.
 */
export async function shareReceiptImage(
  input: { file: File | null; text: string; title: string },
  nav: ShareNavigator = navigator
): Promise<ShareOutcome> {
  try {
    if (input.file && canShareFile(input.file, nav)) {
      await nav.share!({ files: [input.file], text: input.text, title: input.title });
      return 'shared';
    }
    if (typeof nav.share === 'function') {
      await nav.share({ text: input.text, title: input.title });
      return 'shared';
    }
  } catch (e) {
    return isAbort(e) ? 'cancelled' : 'failed';
  }
  return copy(input.text, nav);
}

/** Only the words and the link — for SMS, where a picture would make it an MMS. */
export async function shareReceiptLink(
  input: { text: string; title: string },
  nav: ShareNavigator = navigator
): Promise<ShareOutcome> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ text: input.text, title: input.title });
      return 'shared';
    } catch (e) {
      if (isAbort(e)) return 'cancelled';
    }
  }
  return copy(input.text, nav);
}
