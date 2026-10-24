// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The journal lives twice: `/debts` in the till's frame and `/admin/debts` in
// the owner's. A link from a customer's card must stay in the frame it was
// tapped in — the owner's «Клієнти» opening the till's screen would drop them
// out of the cabinet.

export function debtsBase(pathname: string): string {
  return pathname === '/admin' || pathname.startsWith('/admin/') ? '/admin/debts' : '/debts';
}

export function statementPath(pathname: string, customerId: number): string {
  return `${debtsBase(pathname)}/${customerId}`;
}
