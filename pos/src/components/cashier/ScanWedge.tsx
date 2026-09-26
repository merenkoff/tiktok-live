// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useRef } from 'react';
import { usePosShell } from '@pos/platform';

/**
 * The invisible input a keyboard-wedge barcode scanner types into.
 *
 * It keeps the focus while the catalog is the active surface and gives it up
 * when something else owns the screen — a scan landing behind the payment
 * modal would ring up an item nobody can see.
 *
 * On the waiter's tablet it does not exist at all: a tablet has no USB
 * scanner, and focusing a text input — invisible or not — is exactly what
 * raises the on-screen keyboard. It came up on the sell screen at every open
 * and after every closed sheet, and read as "the search field grabbed focus"
 * (2026-09-26). Returning nothing beats `inputMode="none"`, which Safari on
 * iPad does not honour. The shell is read through `@pos/platform`, never from
 * `shell.tsx` directly: this component is compiled into every remote bundle,
 * and a second copy of the context would always answer `'web'`.
 */
export function ScanWedge({ active, onScan }: { active: boolean; onScan: (code: string) => void }) {
  const shell = usePosShell();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) ref.current?.focus();
    else ref.current?.blur();
  }, [active]);

  if (shell === 'tablet') return null;

  return (
    <input
      ref={ref}
      className="sr-only"
      aria-hidden
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        const input = e.target as HTMLInputElement;
        const value = input.value;
        input.value = '';
        if (value.trim()) onScan(value);
      }}
    />
  );
}
