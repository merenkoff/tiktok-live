// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { api } from '@pos/platform';

/**
 * Mints a store-local EAN-13 for an item whose tag will not scan.
 *
 * Nothing is reserved: the counter behind it never repeats, so a code generated
 * and never saved is simply a gap. Uniqueness within the store stays with the
 * index at INSERT, which surfaces as a 409 on save.
 */
export function GenerateBarcodeButton({
  onGenerated,
  label = 'Згенерувати',
  className = 'sq-btn-quiet shrink-0 whitespace-nowrap',
}: {
  onGenerated: (code: string) => void;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      onGenerated(await api.generateInternalBarcode());
    } catch {
      // Nothing appears in the field; pressing again is the whole recovery.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void generate()}
      disabled={busy}
      title="Внутрішній код магазину — коли бирка не сканується"
      className={className}
    >
      {label}
    </button>
  );
}
