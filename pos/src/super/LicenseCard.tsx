// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { superApi, superErrorText, type SuperLicenseDetail } from './superApi';
import { formatWhen } from './leadLabels';
import { licenseTitle, originLabel, originNote } from './licenseLabels';

/**
 * One licence: the claim, the copy count against its limit, and every install
 * with the origins it ran on. The origin is what the author uses to find who
 * to contact over a copy-count breach (TechDocs/POS_LICENSING.md, phase 2F).
 * Nothing here disables a copy; the one write forgets the licence's pings —
 * for the «Без ключа» row a copy left before its `LICENSE_KEY` was set, which
 * would otherwise sit beside its real licence forever. A copy that still runs
 * pings again within a day.
 */
export function LicenseCard({
  fingerprint,
  onClose,
  onDeleted,
}: {
  fingerprint: string;
  onClose: () => void;
  /** Called after the pings are gone, so the list re-reads. */
  onDeleted?: () => void;
}) {
  const [lic, setLic] = useState<SuperLicenseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await superApi.deleteLicense(fingerprint);
      onDeleted?.();
    } catch (err) {
      setError(superErrorText(err));
      setDeleting(false);
      setConfirming(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setLic(null);
    superApi
      .getLicense(fingerprint)
      .then((d) => alive && setLic(d))
      .catch((err) => alive && setError(superErrorText(err)));
    return () => {
      alive = false;
    };
  }, [fingerprint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Ліцензія"
        className="h-full w-full max-w-xl space-y-5 overflow-y-auto bg-sq-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-sq-text">{lic ? licenseTitle(lic) : 'Ліцензія'}</h2>
            {lic && (
              <p className="mt-1 text-sm text-sq-secondary">
                {lic.plan ? `${lic.plan} · ` : ''}
                копій: {lic.installs}
                {lic.instance_limit != null && ` з ${lic.instance_limit}`} · пінгів: {lic.total_pings}
              </p>
            )}
            {lic?.fingerprint && <p className="mt-1 text-xs text-sq-secondary break-all tabular-nums">{lic.fingerprint}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary">
            Закрити
          </button>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        {lic && (
          <>
            <div className="flex flex-wrap gap-1">
              {lic.over_limit && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                  понад ліміт ({lic.installs} &gt; {lic.instance_limit})
                </span>
              )}
              {lic.cloned && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  можливий клон — один id з кількох адрес
                </span>
              )}
              {!lic.verified && (
                <span className="rounded-full bg-sq-empty px-2 py-0.5 text-xs text-sq-secondary">ключ не підтверджено</span>
              )}
            </div>

            <section className="space-y-2">
              <h3 className="sq-section-label">Копії ({lic.instances.length})</h3>
              <div className="space-y-2">
                {lic.instances.map((inst) => (
                  <div key={inst.instance_id} className="rounded-sq border border-sq-divider p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm tabular-nums text-sq-text break-all">{inst.instance_id}</span>
                      {inst.cloned && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">клон?</span>
                      )}
                    </div>
                    <ul className="mt-2 space-y-1">
                      {inst.origins.map((o) => (
                        <li key={o.url || '(none)'} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                          <span className="text-sq-text break-all">{originLabel(o.url, o.ip)}</span>
                          <span className="text-xs text-sq-secondary whitespace-nowrap">
                            {originNote(o.url, o.ip) && `${originNote(o.url, o.ip)} · `}
                            {formatWhen(o.last_seen)} · {o.seen_count}×
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2 border-t border-sq-divider pt-4">
              {confirming ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-sq-text">
                    Прибрати {lic.total_pings} пінгів цієї ліцензії? Копія, що працює, з'явиться знову з наступним пінгом.
                  </span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void remove()}
                    className="rounded-sq bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {deleting ? 'Видаляю…' : 'Так, видалити'}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirming(false)}
                    className="rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary"
                  >
                    Ні
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="rounded-sq border border-rose-200 px-3 py-1.5 text-sm text-rose-600"
                >
                  Видалити записи
                </button>
              )}
              <p className="text-xs text-sq-secondary">
                Для рядка «Без ключа», що лишився від копії, якій ключ задали пізніше. Це лише історія пінгів — нічого
                не вимикає.
              </p>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
