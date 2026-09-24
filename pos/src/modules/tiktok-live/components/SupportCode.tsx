// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bit a cashier reads out on the phone, and the block they paste into a
// chat. Selectable text either way — a till often has no working clipboard
// permission, and the code alone is enough to route the ticket.

import { useState } from 'react';
import { diagnosticText, type LiveDiagnostic } from '../lib/diagnostics';

export function SupportCode({ diagnostic }: { diagnostic: LiveDiagnostic }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(diagnosticText(diagnostic));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission (or no secure context) — the <pre> below is
      // selectable, so there is still a way to get the text out.
      setCopied(false);
    }
  }

  return (
    <div className="mt-6 border-t border-sq-divider pt-4 text-left">
      <div className="text-[13px] font-semibold text-sq-secondary">Код для підтримки</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <code
          data-testid="live-support-code"
          className="select-all rounded-md bg-sq-empty px-2 py-1 font-mono text-sm text-sq-text"
        >
          {diagnostic.code}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-9 px-3 rounded-sq bg-white ring-1 ring-sq-divider text-[13px] font-semibold text-sq-text hover:bg-sq-sidebar"
        >
          {copied ? 'Скопійовано' : 'Копіювати деталі'}
        </button>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] text-sq-muted">Технічні деталі</summary>
        <pre className="mt-2 max-h-48 select-all overflow-auto rounded-sq bg-sq-sidebar p-2.5 font-mono text-[11px] leading-relaxed text-sq-secondary">
          {diagnosticText(diagnostic)}
        </pre>
      </details>
    </div>
  );
}
