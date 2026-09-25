// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect } from 'react';

interface Props {
  title: string;
  message?: string;
  confirmLabel: string;
  /** `danger` paints the confirming button red — the answer throws something away. */
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The till's own «are you sure?». Not `window.confirm`: the desktop cashier's
 * webview (WKWebView on a Mac) does not implement it and answers «no» without
 * drawing anything, so a question asked that way silently cancelled the very
 * action it guarded — «Очистити кошик» did nothing on the desktop till.
 */
export function ConfirmSheet({ title, message, confirmLabel, tone = 'primary', onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(28,32,38,.32)]"
        onClick={onCancel}
        aria-hidden
        tabIndex={-1}
      />
      <div
        role="alertdialog"
        aria-label={title}
        className="relative w-full sm:max-w-[380px] bg-white rounded-t-card sm:rounded-card shadow-[0_24px_60px_rgba(0,20,60,.28)] px-5 pb-5 pt-2 sm:pt-5 animate-fade-up"
        data-testid="confirm-sheet"
      >
        <div aria-hidden className="w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-3 sm:hidden" />
        <h3 className="text-[19px] font-bold text-sq-heading">{title}</h3>
        {message && <p className="mt-1.5 text-[15px] text-sq-secondary">{message}</p>}
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="flex-1 min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[16px] font-semibold text-sq-text hover:bg-sq-sidebar"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 min-h-[52px] rounded-xl text-[17px] font-semibold text-white ${
              tone === 'danger' ? 'bg-sq-danger hover:brightness-95' : 'bg-sq-blue hover:bg-sq-blue-press'
            }`}
            data-testid="confirm-sheet-ok"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
