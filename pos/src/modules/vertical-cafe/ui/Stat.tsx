// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * One figure with its caption — this module's analytics tile, on both screens.
 *
 * A near-twin of the florist's `ui/Stat`, and deliberately not shared: the two
 * modules ship as separate bundles on their own cadences, so sharing twenty
 * lines of presentation would mean a new `@pos/platform` export and a platform
 * bump for every store, including the ones that sell neither coffee nor
 * flowers.
 */
export function Stat({
  label,
  value,
  strong,
  hint,
  tone,
  testId,
}: {
  label: string;
  value: string;
  strong?: boolean;
  hint?: string;
  /** `warn` marks a figure the owner should not read at face value. */
  tone?: 'warn';
  testId?: string;
}) {
  return (
    <div className="rounded-sq bg-sq-bg p-3" data-testid={testId}>
      <p className="text-xs text-sq-muted">{label}</p>
      <p className={`mt-0.5 ${strong ? 'text-lg font-semibold text-sq-text' : 'text-sq-text'}`}>
        {value}
      </p>
      {hint && (
        <p className={`mt-0.5 text-[11px] ${tone === 'warn' ? 'text-amber-600' : 'text-sq-muted'}`}>
          {hint}
        </p>
      )}
    </div>
  );
}
