// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { superApi, superErrorText, type SuperLicenseSummary } from './superApi';
import { formatWhen } from './leadLabels';
import { LicenseCard } from './LicenseCard';
import { licenseTitle } from './licenseLabels';

/**
 * «Ліцензії» — the copies that phoned home (TechDocs/POS_LICENSING.md, phase
 * 2F): who runs the software, how many copies, which are over the contract's
 * copy-count limit or look cloned, and the origin to contact. Read only — this
 * surface counts and shows, it never disables anyone.
 */
export function LicensesPage() {
  const [rows, setRows] = useState<SuperLicenseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await superApi.listLicenses());
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-sq-secondary">
          Копії надсилають сигнал сумісності (без даних користувачів). Тут видно, скільки їх і де — для
          контролю ліцензійного договору, а не для вимкнення.
        </p>
        <button
          type="button"
          className="ml-auto rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary"
          onClick={() => void load()}
        >
          Оновити
        </button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="overflow-x-auto rounded-sq border border-sq-divider bg-sq-surface">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs uppercase text-sq-secondary">
            <tr>
              <th className="px-3 py-2">Востаннє</th>
              <th className="px-3 py-2">Ліцензія</th>
              <th className="px-3 py-2">План</th>
              <th className="px-3 py-2">Копій</th>
              <th className="px-3 py-2">Сигнали</th>
              <th className="px-3 py-2">Пінгів</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((lic) => (
              <tr
                key={lic.fingerprint || 'none'}
                className="cursor-pointer border-t border-sq-divider align-top hover:bg-sq-bg"
                onClick={() => setOpen(lic.fingerprint || 'none')}
                data-testid={`license-row-${lic.fingerprint || 'none'}`}
              >
                <td className="px-3 py-2 whitespace-nowrap text-sq-secondary">{formatWhen(lic.last_seen)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-sq-text">{licenseTitle(lic)}</div>
                  {lic.fingerprint && (
                    <div className="text-xs text-sq-secondary tabular-nums">{lic.fingerprint.slice(0, 16)}…</div>
                  )}
                </td>
                <td className="px-3 py-2 text-sq-text">{lic.plan ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">
                  <span className={lic.over_limit ? 'font-semibold text-rose-600' : 'text-sq-text'}>
                    {lic.installs}
                    {lic.instance_limit != null && ` / ${lic.instance_limit}`}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {lic.over_limit && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">понад ліміт</span>
                    )}
                    {lic.cloned && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">клон?</span>
                    )}
                    {!lic.verified && (
                      <span className="rounded-full bg-sq-empty px-2 py-0.5 text-xs text-sq-secondary">не підтверджено</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums text-sq-secondary">{lic.total_pings}</td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sq-secondary">
                  {loading ? 'Завантаження…' : 'Жодна копія ще не надсилала сигнал.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open != null && <LicenseCard fingerprint={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
