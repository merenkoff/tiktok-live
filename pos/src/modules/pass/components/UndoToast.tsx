// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Борщ ×1 винесено · Повернути» for five seconds after «Несу» (Д2). The
// question before the tap guards against a slip of the finger; this guards
// against a slip of the mind. After it goes, «Винесено» still offers
// «Повернути» for ten minutes.

import { useEffect } from 'react';

export const TOAST_MS = 5000;

interface Props {
  text: string;
  busy: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ text, busy, onUndo, onDismiss }: Props): JSX.Element {
  useEffect(() => {
    const id = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(id);
  }, [text, onDismiss]);

  return (
    <div
      // Above the till's bottom rail on a phone; at the foot of the screen
      // where the rail stands at the side.
      className="fixed inset-x-0 bottom-24 lg:bottom-4 z-40 mx-auto w-[calc(100%-2rem)] max-w-[440px] rounded-2xl bg-sq-heading text-white px-4 py-3 shadow-[0_8px_30px_rgba(0,20,60,.28)] flex items-center gap-3 animate-fade-up"
      role="status"
      data-testid="pass-toast"
    >
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{text}</span>
      <button
        type="button"
        className="shrink-0 min-h-10 px-3 rounded-lg text-[15px] font-bold text-[#7FB2FF] disabled:opacity-50"
        data-testid="pass-toast-undo"
        disabled={busy}
        onClick={onUndo}
      >
        Повернути
      </button>
    </div>
  );
}
