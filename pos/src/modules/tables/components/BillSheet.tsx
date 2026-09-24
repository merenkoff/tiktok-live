// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill as a sheet over the menu on a narrow screen — the till's own
// `MobileCartSheet` shape, so a waiter who has used the phone till already
// knows where the bill is.

import type { ReactNode } from 'react';
import { X } from '@pos/platform/ui';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function BillSheet({ title, onClose, children }: Props): JSX.Element {
  return (
    <div className="fixed inset-0 z-40" data-testid="bill-sheet">
      <button type="button" className="absolute inset-0 bg-[rgba(28,32,38,.32)]" aria-label="Закрити" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-card bg-sq-sidebar shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up overflow-hidden">
        <div className="flex items-center justify-between bg-white px-5 pt-2 pb-2.5 shadow-[0_1px_0_#E6E8EC]">
          <p className="font-bold text-[17px] text-sq-heading">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="grid min-h-11 min-w-11 place-items-center rounded-full text-sq-secondary hover:bg-sq-empty"
            aria-label="Закрити"
            data-testid="bill-sheet-close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
