// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/dps/payments.ts
//
// Our payment methods → the ДПС `PAYFORMCD` list: 0 готівка, 1 банківська
// картка (examples «Опис всіх елементів», «Два податки»), and for a bank
// transfer by QR the 306 Cashalot itself uses (support answer 11; the schema
// also lists 100000 «Безготівковий платіжний інструмент»).

import type { FiscalDocPayment } from '../types.js';

export interface DpsPayForm {
  PAYFORMCD: number;
  PAYFORMNM: string;
}

const FORMS: Readonly<Record<FiscalDocPayment['method'], DpsPayForm>> = {
  cash: { PAYFORMCD: 0, PAYFORMNM: 'ГОТІВКА' },
  card: { PAYFORMCD: 1, PAYFORMNM: 'КАРТКА' },
  qr: { PAYFORMCD: 306, PAYFORMNM: 'Переказ за QR-кодом (IBAN)' },
};

export function payForm(method: FiscalDocPayment['method']): DpsPayForm {
  return FORMS[method];
}
