// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's one modal: a bottom sheet on a phone, a card in the middle on
// anything wider, portalled to `body`.
//
// Portalled because the «Під запис» button lives inside the host's cart, a
// scrolling column with its own stacking context — a `fixed` box drawn there
// would be clipped by it. `role="dialog"` is also what tells the host's scanner
// to swallow a scan instead of ringing an item behind the sheet.

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@pos/platform/ui';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Wider for the statement's lists; the confirmation stays narrow. */
  wide?: boolean;
  testId?: string;
}

export function Sheet({ title, onClose, children, wide, testId }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(28,32,38,.32)]"
        onClick={onClose}
        aria-label="Закрити"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={`relative w-full ${wide ? 'max-w-lg' : 'max-w-sm'} max-h-[92vh] overflow-auto bg-white rounded-t-card sm:rounded-card px-5 pt-5 pb-6 shadow-[0_24px_60px_rgba(0,20,60,.28)] animate-fade-up text-sq-text`}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-[20px] font-bold text-sq-heading leading-tight">{title}</h2>
          <button
            type="button"
            className="-mr-1 -mt-1 h-10 w-10 grid place-items-center rounded-full hover:bg-sq-bg"
            onClick={onClose}
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
