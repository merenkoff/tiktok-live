// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/returns/components/FiscalBadge.tsx
//
// The ПРРО state of one receipt. Lives inside the module rather than in
// `@pos/platform`: a new runtime export from the frozen barrel costs a shell
// version every remote module then has to clear.

import type { SaleFiscalDoc, SaleFiscalStatus } from '@pos/platform';

const FISCAL_UK: Record<string, { label: string; cls: string }> = {
  pending: { label: 'ПРРО: реєструється', cls: 'text-amber-600' },
  failed: { label: 'ПРРО: не зареєстровано', cls: 'text-red-600' },
  done: { label: 'ПРРО', cls: 'text-emerald-600' },
};

/**
 * A one-line marker next to the receipt status, in the same place `qr_pending`
 * already sits.
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
    return <span className="ml-2 text-xs font-semibold text-amber-600">ПРРО: офлайн</span>;
  }
  const view = status ? FISCAL_UK[status] : undefined;
  if (!view) return null;
  return <span className={`ml-2 text-xs font-semibold ${view.cls}`}>{view.label}</span>;
}

/** The fiscal document itself, on a receipt's detail panel. */
export function FiscalDetailCard({ doc }: { doc?: SaleFiscalDoc | null }) {
  if (!doc) return null;

  if (doc.status === 'done') {
    return (
      <div className="mt-3 rounded-sq bg-sq-surface border border-sq-divider px-3 py-2 text-sm">
        <p className="sq-section-label">Фіскальний чек</p>
        {doc.fiscal_code && (
          <p className="mt-1 font-semibold select-all">{doc.fiscal_code}</p>
        )}
        {doc.tax_url && (
          <a
            href={doc.tax_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-sq-blue underline break-all"
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
      <div className="mt-3 rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900">
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
      className={`mt-3 rounded-sq px-3 py-2 text-sm ${
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
