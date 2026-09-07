// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Ported from `admin/src/components/SessionControl.tsx` — same props, same
// `data-testid`s, restyled onto the POS `sq-*` layer (the admin SPA's gradient
// buttons belong to a different design system).

interface SessionControlProps {
  isActive: boolean;
  onStart: () => void;
  onStop: () => void;
  isStarting: boolean;
  isStopping: boolean;
}

export function SessionControl({
  isActive,
  onStart,
  onStop,
  isStarting,
  isStopping,
}: SessionControlProps) {
  if (!isActive) {
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={isStarting}
        data-testid="session-start"
        className="sq-btn-primary px-6 py-3 text-base disabled:cursor-not-allowed"
      >
        {isStarting ? 'Запускаємо…' : '▶ Почати ефір'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onStop}
      disabled={isStopping}
      data-testid="session-stop"
      className="rounded-sq bg-rose-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isStopping ? 'Зупиняємо…' : '■ Зупинити ефір'}
    </button>
  );
}
