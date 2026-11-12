// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The receipt without paper (TechDocs/POS_PHONE_TILL.md, Т1): on a phone or a
// browser — a shell with no thermal printer — the success screen shows the
// tax office's QR large enough for the customer to scan off the seller's
// screen, and hands the receipt over through the share sheet: the picture with
// the link for Viber/Telegram, the link alone for SMS.

import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Receipt } from '../../platform/glyphs';
import { QrCode } from '../../components/QrCode';
import type { ReceiptData } from '../../lib/printer';
import { renderReceiptPng } from '../../lib/receiptImage';
import {
  receiptFileName,
  receiptShareText,
  shareReceiptImage,
  shareReceiptLink,
  type ShareOutcome,
} from '../../lib/shareReceipt';

const OUTCOME_TEXT: Record<ShareOutcome, string | null> = {
  shared: null,
  cancelled: null,
  copied: 'Посилання скопійовано — вставте його в повідомлення',
  failed: 'Не вдалося поділитися — покажіть покупцю QR-код',
};

/** Does this browser have a share sheet that takes files? Then the picture is worth making. */
function sharesFiles(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
}

export function ReceiptSharePanel({
  receipt,
  taxUrl,
  registered,
}: {
  receipt: ReceiptData;
  /** The tax office's link; null before the document is registered, or with no ПРРО. */
  taxUrl: string | null;
  /** The fiscal document is still being registered: say so instead of a QR. */
  registered: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const text = useMemo(
    () =>
      receiptShareText({ storeName: receipt.store_name, receiptNumber: receipt.receipt_number, taxUrl }),
    [receipt.store_name, receipt.receipt_number, taxUrl]
  );
  const title = `Чек ${receipt.receipt_number}`;

  // Made ahead of the tap: Safari opens the share sheet only inside the
  // gesture, and drawing a canvas there would spend it.
  useEffect(() => {
    if (!sharesFiles()) return;
    let alive = true;
    void renderReceiptPng(receipt, taxUrl)
      .then((blob) => {
        if (alive && blob) {
          setFile(new File([blob], receiptFileName(receipt.receipt_number), { type: 'image/png' }));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [receipt, taxUrl]);

  async function sendImage() {
    setStatus(OUTCOME_TEXT[await shareReceiptImage({ file, text, title })]);
  }

  async function sendLink() {
    setStatus(OUTCOME_TEXT[await shareReceiptLink({ text, title })]);
  }

  const buttonClass =
    'min-h-12 px-[18px] rounded-xl bg-white ring-1 ring-sq-divider text-[15px] font-semibold text-sq-text inline-flex items-center justify-center gap-2 hover:bg-sq-sidebar';

  return (
    <section className="mt-5 w-full flex flex-col items-center" data-testid="receipt-share">
      {taxUrl ? (
        <>
          <QrCode
            value={taxUrl}
            label="QR-код фіскального чека"
            className="w-full max-w-[300px] aspect-square rounded-xl ring-1 ring-sq-divider"
          />
          <p className="mt-2 text-sm text-sq-secondary">
            Покажіть покупцю: камера телефона відкриє цей чек у Податковій
          </p>
        </>
      ) : !registered ? (
        <p className="text-sm text-sq-muted">QR-код з’явиться, щойно чек зареєструється в ПРРО</p>
      ) : null}
      <div className="mt-3 w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button type="button" className={buttonClass} onClick={() => void sendImage()}>
          <Receipt size={20} />
          Надіслати чек
        </button>
        {taxUrl && (
          <button type="button" className={buttonClass} onClick={() => void sendLink()}>
            <MessageCircle size={20} />
            Лише посилання (SMS)
          </button>
        )}
      </div>
      {status && (
        <p role="status" className="mt-2 text-sm text-sq-secondary">
          {status}
        </p>
      )}
    </section>
  );
}
