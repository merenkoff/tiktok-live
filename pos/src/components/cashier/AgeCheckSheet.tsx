// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect } from 'react';

interface Props {
  /** What in the receipt is sold to an adult only, as the cart names it. */
  items: string[];
  /** «Так, є 18»: the payment goes on, and this receipt is not asked again. */
  onConfirm: () => void;
  /** «Ні»: those lines leave the receipt, the rest stays. */
  onRemove: () => void;
  /** Closed without an answer: nothing happens, «Оплатити» asks again. */
  onCancel: () => void;
}

/**
 * «Покупцю є 18 років?» — once per receipt with alcohol, beer or tobacco, where
 * the owner switched it on (migration 102, TechDocs/POS_AGE_CHECK.md). Asked
 * before the payment screen, so a card is never run on the terminal for goods
 * the cashier may not sell.
 */
export function AgeCheckSheet({ items, onConfirm, onRemove, onCancel }: Props) {
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
        aria-label="Покупцю є 18 років?"
        className="relative w-full sm:max-w-[420px] bg-white rounded-t-card sm:rounded-card shadow-[0_24px_60px_rgba(0,20,60,.28)] px-5 pb-5 pt-2 sm:pt-5 animate-fade-up"
        data-testid="age-check-sheet"
      >
        <div aria-hidden className="w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-3 sm:hidden" />
        <h3 className="text-[19px] font-bold text-sq-heading">Покупцю є 18 років?</h3>
        <p className="mt-1.5 text-[15px] text-sq-secondary">
          У чеку: {items.join(', ')}. Якщо сумніваєтесь, попросіть документ із фото.
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="min-h-[52px] rounded-xl bg-sq-blue hover:bg-sq-blue-press text-[17px] font-semibold text-white"
            data-testid="age-check-yes"
          >
            Так, є 18
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[16px] font-semibold text-sq-danger hover:bg-sq-sidebar"
            data-testid="age-check-no"
          >
            Ні — прибрати з чека
          </button>
          <button type="button" onClick={onCancel} className="min-h-11 text-[15px] font-semibold text-sq-secondary">
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}
