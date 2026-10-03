// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@pos/platform/ui';

/**
 * The product screens' modal: a centred dialog on a laptop, a bottom sheet on
 * a phone — the same recipe `PriceTagsDialog` and the till's sheets draw by
 * hand, kept in one place so the three dialogs of the product card agree.
 *
 * Rendered into `document.body` through a portal: a page wrapper that keeps a
 * transform after `animate-fade-up` would otherwise become the containing
 * block for `position: fixed`, and the dialog would centre itself on the list
 * rather than on the window (`PriceTagsDialog.test.tsx` pins the rule).
 *
 * The panel is a `<form>` of its own, because the portal takes it out of the
 * page's form: Enter in a field submits the dialog, never the card. Escape and
 * the X close it; focus goes to the first field on open and back to whatever
 * opened it on close. Kept inside the module (not `@pos/platform/ui`) so the
 * platform surface — and `PLATFORM_VERSION` — do not move for it.
 */
export function Dialog({
  title,
  description,
  onClose,
  onSubmit,
  footer,
  size = 'md',
  children,
  testId,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  /** The panel is a form; Enter in a field lands here. Defaults to «nothing». */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  /** Goes on the overlay — tests find the dialog by it, never by its utility classes. */
  testId?: string;
}) {
  const titleId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = bodyRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
    );
    first?.focus();
    return () => {
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, []);

  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl';

  return createPortal(
    <div
      data-testid={testId}
      className="fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end sm:place-items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        noValidate
        onSubmit={(e) => {
          if (onSubmit) onSubmit(e);
          else e.preventDefault();
        }}
        className={`bg-white w-full ${width} rounded-t-card sm:rounded-card max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]`}
      >
        <div aria-hidden className="w-10 h-[5px] rounded-full bg-sq-divider mx-auto mt-2 sm:hidden" />
        <div className="px-5 pt-3 sm:pt-[18px] pb-3 flex items-start gap-2.5 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 id={titleId} className="text-[19px] font-bold text-sq-heading truncate">
              {title}
            </h3>
            {description && (
              <p className="text-[15px] text-sq-secondary mt-1 leading-relaxed">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-2">
          {children}
        </div>
        {footer && (
          <div className="px-5 py-4 shrink-0 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))] flex flex-wrap items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </form>
    </div>,
    document.body
  );
}
