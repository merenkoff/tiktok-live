// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Ported from `admin/src/components/SessionControl.tsx` — same props, same
// `data-testid`s, restyled onto the POS `sq-*` layer (the admin SPA's gradient
// buttons belong to a different design system).

/**
 * LIVE pink — the module's own accent (design/README.md: «Ours, unchanged»),
 * the one colour here that is not an `sq-*` token. Only «Почати ефір» wears
 * it: going on air is the module's one big action.
 */
const LIVE_BUTTON = 'bg-[#FF3D7A] hover:bg-[#D8215F]';

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
        className={`inline-flex items-center justify-center gap-2.5 min-h-[52px] px-6 rounded-xl text-[17px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${LIVE_BUTTON}`}
      >
        {isStarting ? (
          'Запускаємо…'
        ) : (
          <>
            {/* The «on air» dot, drawn rather than typed. */}
            <span aria-hidden className="w-2.5 h-2.5 rounded-full bg-white" />
            Почати ефір
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onStop}
      disabled={isStopping}
      data-testid="session-stop"
      className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-6 rounded-xl bg-white ring-1 ring-sq-divider text-[17px] font-semibold text-red-600 transition-colors hover:bg-sq-sidebar disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isStopping ? (
        'Зупиняємо…'
      ) : (
        <>
          <span aria-hidden className="w-3 h-3 rounded-[3px] bg-current" />
          Зупинити ефір
        </>
      )}
    </button>
  );
}
