// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/components/FiscalErrorCard.tsx
//
// A failure a cashier or owner can act on: what happened, in Ukrainian, and a
// code that identifies the cause exactly if they call for help. Modelled on
// `tiktok-live/components/SupportCode.tsx` — same "selectable text either
// way" reasoning, since a till often has no working clipboard permission.

import { useState } from 'react';
import { diagnose, diagnosticMessage, diagnosticText } from '../lib/diagnostics';

export function FiscalErrorCard({ error }: { error: unknown }) {
  const [copied, setCopied] = useState(false);
  const diagnostic = diagnose(error);
  const message = diagnosticMessage(error, diagnostic);

  async function copy() {
    try {
      await navigator.clipboard.writeText(diagnosticText(diagnostic));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div role="alert" className="rounded-sq bg-red-50 px-3 py-2.5 text-sm text-red-700">
      <p className="font-semibold">{message}</p>
      <div className="mt-2 flex items-center gap-2">
        <code
          data-testid="fiscal-support-code"
          className="select-all rounded-sq bg-white/60 px-2 py-1 font-mono text-xs text-red-800"
        >
          {diagnostic.code}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-sq border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-white/50"
        >
          {copied ? 'Скопійовано' : 'Копіювати деталі'}
        </button>
      </div>
    </div>
  );
}
