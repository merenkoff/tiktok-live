// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useRef } from 'react';
import { usePosShell } from '@pos/platform';
import { createScanDetector } from '../../lib/scanDetector';

/**
 * Where a keyboard-wedge barcode scanner's codes come in.
 *
 * It listens to the whole window rather than holding the focus in a hidden
 * input: the hidden input lost the focus to every tap on a tile or in the
 * receipt and never got it back while the catalog stayed active, so after
 * «Очистити чек» the scanner typed into nowhere (2026-10-19). Which keys are
 * a scan is decided by `lib/scanDetector.ts` — anything typed with no text
 * field focused, or a burst no hand can type inside one (taken back out of
 * the search box, which keeps what the cashier had typed in it).
 *
 * When something else owns the screen it takes no scans but still guards
 * against them: `active` turns false under the payment modal and the
 * catalog's own sheets, and a dialog opened by anyone else (the receipt's
 * «Очистити чек?», the customer picker) counts the same unless the wedge
 * itself lives inside it — that is what the hidden marker is for. A scan
 * landing there used to be typed into whatever had the focus and finished by
 * its Enter: digits into the cash field of the payment modal and a submitted
 * payment, or the focused button of a sheet pressed. Now such a burst is
 * swallowed, Enter included, and the field gets its text back. The cashier's
 * own typing is never touched — only a burst no hand can type.
 *
 * On the waiter's tablet it does not exist at all: a tablet has no USB
 * scanner, and the hidden input it once rendered was the on-screen keyboard
 * popping up (2026-09-26). The shell is read through `@pos/platform`, never
 * from `shell.tsx` directly: this component is compiled into every remote
 * bundle, and a second copy of the context would always answer `'web'`.
 */
export function ScanWedge({ active, onScan }: { active: boolean; onScan: (code: string) => void }) {
  const shell = usePosShell();
  const marker = useRef<HTMLSpanElement>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  });

  const mounted = shell !== 'tablet';

  useEffect(() => {
    if (!mounted) return;
    const detector = createScanDetector();
    let wasTaking = true;
    const onKeyDown = (e: KeyboardEvent) => {
      const taking = activeRef.current && !coveredByDialog(marker.current);
      if (taking !== wasTaking) detector.reset();
      wasTaking = taking;
      const field = textField(e.target);
      const verdict = detector.feed({
        key: e.key,
        code: e.code,
        shiftKey: e.shiftKey,
        capsLock: e.getModifierState?.('CapsLock') ?? false,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        repeat: e.repeat,
        isComposing: e.isComposing,
        time: e.timeStamp || performance.now(),
        // While guarding, a button counts as a field: only a burst is
        // stopped there, never the cashier's own Enter on it.
        field: field ?? (taking ? null : GUARDED),
      });
      if (verdict.kind !== 'scan') return;
      // The scanner's Enter is not the cashier's: it must not press the
      // button, submit the form or confirm the sheet that has the focus.
      e.preventDefault();
      e.stopPropagation();
      if (verdict.field && verdict.field !== GUARDED && verdict.restore !== null) {
        restoreText(verdict.field, verdict.restore);
      }
      if (taking) onScanRef.current(verdict.code);
    };
    // Capture, on the window: the wedge sees the key before whatever has the focus does.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [mounted]);

  if (shell === 'tablet') return null;
  return <span ref={marker} hidden data-scan-wedge="" />;
}

const DIALOGS = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/** Stands in for «not a text field» while guarding, so the burst rule applies to buttons too. */
const GUARDED = new EventTarget();

/** Is a dialog open that the wedge is not part of? */
function coveredByDialog(marker: HTMLElement | null): boolean {
  for (const dialog of document.querySelectorAll(DIALOGS)) {
    if (!marker || !dialog.contains(marker)) return true;
  }
  return false;
}

const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image']);

/** The focused element keys type text into, or `null` when keys land on something that is not one. */
function textField(target: EventTarget | null): EventTarget | null {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return target;
  if (target instanceof HTMLInputElement) return NOT_TEXT.has(target.type) ? null : target;
  if (target instanceof HTMLElement && target.isContentEditable) return target;
  return null;
}

/**
 * Puts a field's text back the way React notices: through the native setter
 * (React's own tracker would otherwise swallow the change) and an `input`
 * event, which is what its `onChange` listens to.
 */
function restoreText(field: EventTarget, text: string): void {
  const proto =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : field instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : null;
  if (!proto) return;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
