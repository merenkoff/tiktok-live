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
    <div className="rounded-xl bg-sq-sidebar px-4 py-3.5" data-testid={testId}>
      <p className="text-[13px] font-medium text-sq-secondary">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? 'text-[22px] leading-tight font-bold text-sq-heading' : 'text-sq-text'}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-sq-muted">{hint}</p>}
    </div>
  );
}
