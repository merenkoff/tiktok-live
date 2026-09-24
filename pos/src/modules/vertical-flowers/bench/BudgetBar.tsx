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
        className="w-full min-h-11 rounded-xl bg-sq-empty text-[15px] font-semibold text-sq-secondary hover:text-sq-text hover:bg-sq-selected"
        data-testid="bench-set-budget"
      >
        Поставити бюджет
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenBudget}
      className="w-full flex flex-col gap-1.5 text-left min-h-11 justify-center"
      data-testid="bench-budget"
    >
      <span className="w-full flex items-baseline justify-between gap-3 text-[13px]">
        <span className={over ? 'text-sq-danger font-semibold' : 'text-sq-secondary'}>
          {over
            ? `Перебір на ${formatUah(-remainingCents)}`
            : nextStems != null && nextStems > 0
              ? `Бюджет · ще ≈ ${nextStems} ${plural(nextStems)}`
              : 'Бюджет · у межах'}
        </span>
        <span className="font-semibold text-sq-text tabular-nums shrink-0">
          {formatUah(totalCents)} з {formatUah(budgetCents)}
        </span>
      </span>
      <span className="block w-full h-2 rounded-full bg-sq-empty overflow-hidden">
        <span
          className={`block h-full rounded-full transition-[width] duration-150 ${
            over ? 'bg-sq-danger' : 'bg-sq-success'
          }`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </span>
    </button>
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
