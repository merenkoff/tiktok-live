// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Cash rounding (Постанова НБУ № 25; TechDocs/POS_CASH_ROUNDING.md), for a
// module that takes or hands back cash — the refund dialog, the waiter's bill.
// Exported here rather than copied into a module for the reason `bouquet.ts`
// and `modifiers.ts` are: the sum on the screen and the sum the server stores
// have to agree, and one table of cases pins both.
export {
  CASH_ROUNDING_STEPS,
  cashPartCents,
  cashRoundingDelta,
  isCashRoundingStep,
  refundRoundingCents,
  saleRoundingCents,
  storeCashRounding,
  type CashRoundingPayment,
  type CashRoundingStep,
} from '../lib/cashRounding';
