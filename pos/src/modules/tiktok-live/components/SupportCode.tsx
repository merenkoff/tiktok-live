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
      <div className="sq-section-label">Код для підтримки</div>
      <div className="mt-1.5 flex items-center gap-2">
        <code
          data-testid="live-support-code"
          className="select-all rounded-sq bg-sq-bg px-2 py-1 font-mono text-sm text-sq-text"
        >
          {diagnostic.code}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-sq border border-sq-divider px-2.5 py-1 text-xs font-medium text-sq-secondary hover:bg-sq-bg"
        >
          {copied ? 'Скопійовано' : 'Копіювати деталі'}
        </button>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-sq-muted">Технічні деталі</summary>
        <pre className="mt-2 max-h-48 select-all overflow-auto rounded-sq bg-sq-bg p-2 font-mono text-[11px] leading-relaxed text-sq-secondary">
          {diagnosticText(diagnostic)}
        </pre>
      </details>
    </div>
  );
}
