// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/lib/taxUrl.ts
//
// The tax-office verification link printed as a QR on a receipt this till
// stamped offline (фаза 3). A deliberate copy of `src/pos/fiscal/taxUrl.ts`:
// the server builds the same link for a receipt it stamps itself, and the two
// have to agree, but the till has to be able to build it with no network at
// all — which is the entire point of the offline path.
//
//   https://cabinet.tax.gov.ua/cashregs/check
//     ?id=<receipt fiscal number>   the code taken from the lease
//     &date=yyyyMMdd                fiscal date, local
//     &time=HHmm                    fiscal time, local
//     &fn=<ФН ПРРО>                 the register's own number, cached at login
//     &sm=<total>                   the receipt total, "." separator
//
// This is the format Положення № 13 prescribes (розділ II п. 2, рядок 29) and
// a real receipt verifies with exactly these five; `mac` belongs to receipts
// the ПРРО itself created offline and is Checkbox's to compute, so the link
// here is the regulation's format minus the hash. The cabinet finds the
// document only once the replay delivers it, which is what the «ОФЛАЙН» mark
// next to the QR tells the customer.

const CHECK_URL = 'https://cabinet.tax.gov.ua/cashregs/check';

/**
 * The receipt's printed date and time are local, and so are the link's.
 * Formatting through `Intl` keeps Ukraine's daylight-saving rule out of our
 * code — and out of a till that may be running for months without an update.
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
    time: `${hour}${get('minute')}`,
  };
}

export interface TaxUrlInput {
  /** The receipt's fiscal number — offline, the code from the lease. */
  fiscalCode: string;
  fiscalDate: Date;
  /** ФН ПРРО, from `auth.store.fiscal.register_fiscal_number`. */
  registerFiscalNumber: string | null;
  totalCents: number;
}

/**
 * Null when the register's own number is not known yet: a link without `fn`
 * identifies nothing, and a QR that opens an error page is worse than the
 * printed line saying the QR is coming.
 */
export function buildTaxUrl(input: TaxUrlInput): string | null {
  const fn = input.registerFiscalNumber?.trim() ?? '';
  const id = input.fiscalCode.trim();
  if (!fn || !id) return null;

  const { date, time } = localParts(input.fiscalDate);
  const url = new URL(CHECK_URL);
  url.searchParams.set('id', id);
  url.searchParams.set('date', date);
  url.searchParams.set('time', time);
  url.searchParams.set('fn', fn);
  url.searchParams.set('sm', (Math.abs(input.totalCents) / 100).toFixed(2));
  return url.toString();
}
