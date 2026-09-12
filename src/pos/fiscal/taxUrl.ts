// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/taxUrl.ts
//
// The tax-office verification link we print as a QR on a receipt stamped
// offline.
//
// Why we build it ourselves: offline there is no provider call to get one
// from, and everything the link needs is already on the till —
//
//   https://cabinet.tax.gov.ua/cashregs/check
//     ?id=<receipt fiscal number>   the code taken from the reserve
//     &date=yyyyMMdd                fiscal date, local
//     &time=HHmm                    fiscal time, local
//     &fn=<ФН ПРРО>                 the register's own number, cached
//     &sm=<total>                   the receipt total, "." separator
//
// This is the format Положення № 13 prescribes (розділ II п. 2, рядок 29 —
// TechDocs/dps-prro-api/polozhennya-13.md), and a real receipt verifies with
// exactly these five. The same line adds `mac=…` "лише для чеків, створених
// ПРРО в режимі офлайн": for an OFFLINE receipt the regulation's format does
// include the hash, and that hash is the ПРРО's transaction chain — Checkbox's
// to compute at `sell-offline`, not ours. So the link we build for an offline
// receipt is the regulation's format minus `mac`, and the replay replaces it
// with the provider's complete one (see the design doc for what that means
// for the paper).
//
// The cabinet will not find the receipt until it is actually delivered — the
// link starts working after the replay.

const CHECK_URL = 'https://cabinet.tax.gov.ua/cashregs/check';

/**
 * Ukraine is the only timezone this matters in: the fiscal date/time printed
 * on the receipt and used in the link are local, while we store timestamptz.
 * Formatting through `Intl` keeps the DST rule out of our code.
 */
const KYIV = 'Europe/Kyiv';

const PARTS = new Intl.DateTimeFormat('uk-UA', {
  timeZone: KYIV,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function localParts(at: Date): { date: string; time: string } {
  const parts = new Map<string, string>(
    PARTS.formatToParts(at).map((p) => [p.type as string, p.value])
  );
  const get = (type: string) => parts.get(type) ?? '00';
  // `hour12: false` can yield "24" for midnight in some ICU versions.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}${get('month')}${get('day')}`,
    // `HHmm`, as the regulation's template spells it (its prose says HHmmss
    // once, the template and every real receipt we have seen say HHmm).
    time: `${hour}${get('minute')}`,
  };
}

export interface TaxUrlInput {
  /** The receipt's fiscal number — offline, the code from the reserve. */
  fiscalCode: string;
  fiscalDate: Date;
  /** ФН ПРРО, `pos_fiscal_settings.register_fiscal_number`. */
  registerFiscalNumber: string;
  totalCents: number;
}

/**
 * Null when the register's own fiscal number is not known yet — a link without
 * `fn` identifies nothing, and a QR that resolves to an error page is worse
 * than the printed line that says the QR is coming.
 */
export function buildTaxUrl(input: TaxUrlInput): string | null {
  const fn = input.registerFiscalNumber.trim();
  const id = input.fiscalCode.trim();
  if (!fn || !id) return null;

  const { date, time } = localParts(input.fiscalDate);
  const url = new URL(CHECK_URL);
  url.searchParams.set('id', id);
  url.searchParams.set('date', date);
  url.searchParams.set('time', time);
  url.searchParams.set('fn', fn);
  // Hryvnia with two decimals, the same shape the provider's own links use.
  // A refund's ledger row carries a negative total; the tax office knows the
  // document by its absolute sum.
  url.searchParams.set('sm', (Math.abs(input.totalCents) / 100).toFixed(2));
  return url.toString();
}
