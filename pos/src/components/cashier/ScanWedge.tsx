// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useRef } from 'react';

/**
 * The invisible input a keyboard-wedge barcode scanner types into.
 *
 * It keeps the focus while the catalog is the active surface and gives it up
 * when something else owns the screen — a scan landing behind the payment
 * modal would ring up an item nobody can see.
 */
export function ScanWedge({ active, onScan }: { active: boolean; onScan: (code: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) ref.current?.focus();
    else ref.current?.blur();
  }, [active]);

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
