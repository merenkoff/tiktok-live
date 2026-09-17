// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The budget, drawn as a bar rather than typed into a field
 * (`TechDocs/POS_FLORIST_BENCH.md` §3.4).
 *
 * A number in a field tells the florist nothing while their eyes are on the
 * flowers; a bar filling up is readable in peripheral vision. It warns the
 * moment the bouquet goes over — not at the end — and says how many more stems
 * fit, because "what else can I put in for 1500?" is the actual question.
 *
 * It never changes the price (§3.5).
 */

import { formatUah } from '@pos/platform';

interface Props {
  totalCents: number;
  budgetCents: number | null;
  ratio: number;
  remainingCents: number;
  over: boolean;
  nextStems: number | null;
  onOpenBudget: () => void;
}

export function BudgetBar({
  totalCents,
  budgetCents,
  ratio,
  remainingCents,
  over,
  nextStems,
  onOpenBudget,
}: Props) {
  if (budgetCents == null) {
    return (
      <button
        type="button"
        onClick={onOpenBudget}
        className="w-full min-h-11 rounded-sq border border-dashed border-sq-divider text-sm text-sq-secondary hover:text-sq-text hover:border-sq-blue"
        data-testid="bench-set-budget"
      >
        Поставити бюджет
      </button>
    );
  }

  return (
    <div data-testid="bench-budget">
      <div className="h-2.5 rounded-full bg-sq-bg overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-150 ${
            over ? 'bg-red-500' : 'bg-sq-blue'
          }`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <button
        type="button"
        onClick={onOpenBudget}
        className="mt-1.5 w-full min-h-11 flex items-baseline justify-between gap-3 text-left"
      >
        <span className={`text-sm ${over ? 'text-red-600 font-medium' : 'text-sq-secondary'}`}>
          {over
            ? `Перебір на ${formatUah(-remainingCents)}`
            : nextStems != null && nextStems > 0
              ? `Ще ≈${nextStems} ${plural(nextStems)}`
              : 'У бюджеті'}
        </span>
        <span className="text-sm text-sq-secondary tabular-nums shrink-0">
          {formatUah(totalCents)} / {formatUah(budgetCents)}
        </span>
      </button>
    </div>
  );
}

function plural(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'стебел';
  switch (n % 10) {
    case 1:
      return 'стебло';
    case 2:
    case 3:
    case 4:
      return 'стебла';
    default:
      return 'стебел';
  }
}
