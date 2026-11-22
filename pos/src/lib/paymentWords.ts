// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The words of the payment rows on our own receipt layout — the HTML receipt
// and the text one for a phone share them; the thermal printer has its copy in
// `src-tauri/src/hardware/receipt.rs` (`payment_form`), tested on its own.
//
// Положення № 13 as amended by наказ Мінфіну № 601 (in force 01.03.2025),
// розділ II п. 2:
//   рядок 18 — «позначення форми оплати («ГОТІВКА», «БЕЗГОТІВКОВА», «ІНШЕ»),
//              суму коштів за цією формою оплати та валюту операції»;
//   рядок 19 — «засоби оплати (вид платіжного інструменту, талон, жетон тощо)»;
//   рядки 24, 25 — «до сплати, валюта», «решта, валюта».
// Row 18's three words are the regulation's own; row 19 names no words, so we
// print what Cashalot prints in its own examples (blog, 28.02.2025): «Готівкові
// кошти» under «ГОТІВКА», «Картка» under «БЕЗГОТІВКОВА». A bank transfer by QR
// reads as we tell the tax office in `PAYFORMNM` (src/pos/fiscal/dps/payments.ts).

/** The currency printed after a sum in rows 18, 24 and 25. */
export const RECEIPT_CURRENCY = 'ГРН';

export interface PaymentWords {
  /** Рядок 18: «ГОТІВКА» / «БЕЗГОТІВКОВА» / «ІНШЕ». */
  form: 'ГОТІВКА' | 'БЕЗГОТІВКОВА' | 'ІНШЕ';
  /** Рядок 19: the means, printed on its own line under the form. */
  means: string;
}

export function paymentWords(method: string): PaymentWords {
  switch (method) {
    case 'cash':
      return { form: 'ГОТІВКА', means: 'Готівкові кошти' };
    case 'card':
      return { form: 'БЕЗГОТІВКОВА', means: 'Картка' };
    case 'qr':
      return { form: 'БЕЗГОТІВКОВА', means: 'Переказ за QR-кодом' };
    default:
      return { form: 'ІНШЕ', means: method };
  }
}

/** «206.08 ГРН» — a sum as rows 18, 24 and 25 print it. */
export function withCurrency(amount: string): string {
  return `${amount} ${RECEIPT_CURRENCY}`;
}
