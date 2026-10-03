// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { resolveTagColorHex } from '@pos/platform';

/** A tag's tile colour, as a dot — the same hue the till's folder tile wears. */
export function TagDot({ color, size = 'sm' }: { color: string | null | undefined; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={`${size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2'} rounded-full shrink-0`}
      style={{ backgroundColor: resolveTagColorHex(color) }}
    />
  );
}
