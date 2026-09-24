// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/returns/components/FiscalBadge.tsx
//
// The ПРРО state of one receipt. Lives inside the module rather than in
// `@pos/platform`: a new runtime export from the frozen barrel costs a shell
// version every remote module then has to clear.

import type { SaleFiscalDoc, SaleFiscalStatus } from '@pos/platform';
import { Chip } from './SaleChips';

const FISCAL_UK: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  pending: { label: 'ПРРО: реєструється', tone: 'warning' },
  failed: { label: 'ПРРО: не зареєстровано', tone: 'danger' },
  done: { label: 'ПРРО', tone: 'success' },
};

/**
 * A chip next to the receipt status, in the same place `qr_pending` already
 * sits.
 *
 * `'none'` and `undefined` render **nothing** — that is what keeps every screen
 * in a store that does not fiscalise byte-identical to before, which is the
 * whole reason `fiscal_status` is a projection with a `'none'` member.
 *
 * `mode` separates the two receipts that are both `pending`: one is still being
 * registered (something may yet go wrong), the other already carries a real
 * tax-office number from the offline reserve and is only waiting to be sent.
 * Reading the second as the first is what makes a cashier re-ring a receipt
 * that is already fiscal.
 */
export function FiscalBadge({
  status,
  mode,
}: {
  status?: SaleFiscalStatus | string | null;
  mode?: SaleFiscalDoc['mode'];
}) {
  if (status === 'pending' && mode === 'offline') {
    return <Chip tone="warning">ПРРО: офлайн</Chip>;
  }
  const view = status ? FISCAL_UK[status] : undefined;
  if (!view) return null;
  return <Chip tone={view.tone}>{view.label}</Chip>;
}

/** The fiscal document itself, on a receipt's detail panel. */
export function FiscalDetailCard({ doc }: { doc?: SaleFiscalDoc | null }) {
  if (!doc) return null;

  if (doc.status === 'done') {
    return (
      <div className="mt-3 rounded-xl bg-sq-sidebar px-4 py-3 text-sm">
        <p className="sq-section-label">Фіскальний чек</p>
        {doc.fiscal_code && (
          <p className="mt-1 text-[15px] font-semibold text-sq-text tabular-nums select-all">{doc.fiscal_code}</p>
        )}
        {doc.tax_url && (
          <a
            href={doc.tax_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block font-semibold text-sq-blue break-all"
          >
            Перевірити в кабінеті ДПС
          </a>
        )}
      </div>
    );
  }

  // Stamped from the offline reserve: the fiscal number is real and final, only
  // the control number and the tax-office QR arrive with the replay. Saying
  // «реєструється» here would understate a receipt the customer can already be
  // given.
  if (doc.status === 'pending' && doc.mode === 'offline') {
    return (
      <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Чек з офлайн-резерву ПРРО</p>
        {doc.fiscal_code && <p className="mt-1 font-semibold select-all">{doc.fiscal_code}</p>}
        <p className="mt-1">
          Буде надіслано в ДПС автоматично, щойно відновиться звʼязок із ПРРО.
        </p>
      </div>
    );
  }

  const failed = doc.status === 'failed' || doc.status === 'abandoned';
  return (
    <div
      className={`mt-3 rounded-xl px-4 py-3 text-sm ${
        failed ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-900'
      }`}
    >
      <p className="font-semibold">
        {failed ? 'Чек не зареєстровано в ПРРО' : 'Реєструється в ПРРО…'}
      </p>
      {doc.error_message && <p className="mt-1">{doc.error_message}</p>}
      {/* `abandoned` means the server stopped retrying; only the owner can act,
          and only through the provider's own cabinet until a retry route exists. */}
      {doc.status === 'abandoned' ? (
        <p className="mt-1">Зверніться до власника магазину.</p>
      ) : failed ? (
        <p className="mt-1">Реєстрація повториться автоматично.</p>
      ) : null}
    </div>
  );
}
