// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill as a sheet over the menu on a narrow screen — the till's own
// `MobileCartSheet` shape, so a waiter who has used the phone till already
// knows where the bill is.

import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function BillSheet({ title, onClose, children }: Props): JSX.Element {
  return (
    <div className="fixed inset-0 z-40" data-testid="bill-sheet">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Закрити" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-sq bg-sq-sidebar animate-fade-up">
        <div className="flex items-center justify-between border-b border-sq-divider bg-white px-4 py-3">
          <p className="font-semibold text-sq-text">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="grid min-h-11 min-w-11 place-items-center text-sq-secondary"
            aria-label="Закрити"
            data-testid="bill-sheet-close"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
