// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the journal knows about one customer — the host's `customer.Panel`
// slot (Г2), in two places:
//
//  · `cart` — one line under the chosen customer: «Борг 1 240 ₴ · ще можна
//    1 760 ₴», a link to the statement. Nothing at all for a customer who
//    owes nothing and may not take credit: the cart of every other customer
//    stays exactly as it was.
//  · `card` — the same line on the customer's card, and for the owner the
//    limit itself (`LimitEditor`): the card is where a customer is given
//    credit in the first place, because «Борги» lists only those who have it.
//
// Any failure draws nothing — a strip that cannot be read must not put an
// error over the cart.

import { Link, useLocation } from 'react-router-dom';
import { useAuthStore, usePosShell } from '@pos/platform';
import { SectionHead } from '@pos/platform/ui';
import type { CustomerPanelProps } from '../../types';
import { creditLine } from '../lib/debt';
import { statementPath } from '../lib/paths';
import { useCredit } from '../lib/useCredit';
import { LimitEditor } from './LimitEditor';

export default function CustomerPanel({ customerId, place }: CustomerPanelProps) {
  const { credit, failed } = useCredit(customerId);
  const role = useAuthStore((s) => s.auth?.staff.role ?? null);
  const shell = usePosShell();
  const { pathname } = useLocation();

  if (failed || !credit) return null;
  const owes = credit.balance_cents !== 0;
  const allowed = credit.limit_cents != null;
  const owner = role === 'owner';

  if (place === 'cart') {
    if (!owes && !allowed) return null;
    return (
      <Link
        to={statementPath(pathname, customerId)}
        className={`block text-[13px] leading-snug tabular-nums hover:underline ${
          credit.locked || (credit.available_cents ?? 0) === 0 ? 'text-amber-800' : 'text-sq-secondary'
        }`}
        data-testid="debts-customer-strip"
      >
        {creditLine(credit)}
      </Link>
    );
  }

  // The card: the seller reads, the owner decides.
  if (!owes && !allowed && !owner) return null;
  return (
    <section className="rounded-card bg-white ring-1 ring-sq-divider p-4 space-y-2" data-testid="debts-customer-card">
      <SectionHead
        title="Під запис"
        action={owes ? <Link to={statementPath(pathname, customerId)}>Виписка</Link> : undefined}
      />
      <p className="text-[15px] tabular-nums">
        {allowed || owes ? creditLine(credit) : 'Під запис не дозволено'}
      </p>
      {owner && <LimitEditor credit={credit} touch={shell !== 'web'} />}
    </section>
  );
}
