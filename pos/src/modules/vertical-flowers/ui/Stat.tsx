// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/** One figure with its caption — the module's analytics tile, on both screens. */
export function Stat({
  label,
  value,
  strong,
  hint,
  testId,
}: {
  label: string;
  value: string;
  strong?: boolean;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-sq bg-sq-bg p-3" data-testid={testId}>
      <p className="text-xs text-sq-muted">{label}</p>
      <p className={`mt-0.5 ${strong ? 'text-lg font-semibold text-sq-text' : 'text-sq-text'}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-sq-muted">{hint}</p>}
    </div>
  );
}
