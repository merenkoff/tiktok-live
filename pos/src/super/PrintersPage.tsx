// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { encodingTitle } from '../lib/printerEncoding';
import {
  superApi,
  superErrorText,
  type SuperPrinterProfile,
  type SuperPrinterProfiles,
  type SuperPrinterReport,
} from './superApi';
import { formatWhen } from './leadLabels';

/**
 * «Принтери» — shared printer profiles (TechDocs/POS_PRINTER_PROFILES.md).
 *
 * A desktop till reports the Cyrillic profile its owner picked for a printer
 * once three documents printed with it, keyed by the printer's DRIVER (the
 * operating system's name for it). Approving a report under a readable name
 * makes it what every till prints with on a printer of that driver whose
 * owner has not picked a profile. One approved profile per driver: approving
 * another replaces it.
 */
export function PrintersPage() {
  const [data, setData] = useState<SuperPrinterProfiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await superApi.printerProfiles());
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(superErrorText(err));
    }
  }

  const byDriver = new Map<string, SuperPrinterProfile>();
  for (const p of data?.profiles ?? []) byDriver.set(p.driver, p);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-sq-secondary">
          Каса надсилає кодування, яке власник вибрав для принтера, після трьох надрукованих документів. Затверджене
          кодування отримують усі каси з таким самим драйвером, доки власник не вибере своє.
        </p>
        <button
          type="button"
          className="ml-auto rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          Оновити
        </button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <section aria-label="Затверджені" className="space-y-2">
        <h2 className="text-base font-semibold text-sq-text">Затверджені для всіх</h2>
        {data && data.profiles.length === 0 && <p className="text-sm text-sq-secondary">Поки жодного.</p>}
        {data && data.profiles.length > 0 && (
          <div className="overflow-x-auto rounded-sq border border-sq-divider bg-sq-surface">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase text-sq-secondary">
                <tr>
                  <th className="px-3 py-2">Назва</th>
                  <th className="px-3 py-2">Драйвер</th>
                  <th className="px-3 py-2">Кодування</th>
                  <th className="px-3 py-2">Запропонував</th>
                  <th className="px-3 py-2">Затверджено</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.profiles.map((p) => (
                  <ProfileRow
                    key={p.id}
                    profile={p}
                    onRename={(title) => run(() => superApi.renamePrinterProfile(p.id, title))}
                    onRemove={() => {
                      if (window.confirm(`Прибрати «${p.title}»? Каси без власного вибору повернуться до кодування за замовчуванням.`)) {
                        void run(() => superApi.removePrinterProfile(p.id));
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Від кас" className="space-y-2">
        <h2 className="text-base font-semibold text-sq-text">Надіслали каси</h2>
        {data && data.reports.length === 0 && <p className="text-sm text-sq-secondary">Поки жодного звіту.</p>}
        {data && data.reports.length > 0 && (
          <div className="overflow-x-auto rounded-sq border border-sq-divider bg-sq-surface">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs uppercase text-sq-secondary">
                <tr>
                  <th className="px-3 py-2">Драйвер</th>
                  <th className="px-3 py-2">Кодування</th>
                  <th className="px-3 py-2">Магазин</th>
                  <th className="px-3 py-2">Документів</th>
                  <th className="px-3 py-2">Останній звіт</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.reports.map((r) => (
                  <ReportRow
                    key={r.id}
                    report={r}
                    current={byDriver.get(r.driver) ?? null}
                    onApprove={(title) => run(() => superApi.approvePrinterReport(r.id, title))}
                    onRemove={() => {
                      if (window.confirm('Видалити цей звіт? Затверджене кодування це не змінить.')) {
                        void run(() => superApi.removePrinterReport(r.id));
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const profileText = (p: { table: SuperPrinterReport['table']; esc_t: number }) =>
  encodingTitle({ table: p.table, esc_t: p.esc_t });

function ProfileRow({
  profile,
  onRename,
  onRemove,
}: {
  profile: SuperPrinterProfile;
  onRename: (title: string) => Promise<void>;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(profile.title);

  return (
    <tr className="border-t border-sq-divider align-top">
      <td className="px-3 py-2">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void onRename(title).then(() => setEditing(false));
            }}
          >
            <input
              className="sq-input"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Нова назва"
              autoFocus
            />
            <button type="submit" className="sq-btn-quiet" disabled={!title.trim()}>
              Зберегти
            </button>
          </form>
        ) : (
          <span className="font-semibold text-sq-text">{profile.title}</span>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-xs">{profile.driver}</td>
      <td className="px-3 py-2">{profileText(profile)}</td>
      <td className="px-3 py-2">{profile.source_store_code ?? '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap">{formatWhen(profile.approved_at)}</td>
      <td className="px-3 py-2 whitespace-nowrap text-right">
        {!editing && (
          <button type="button" className="text-sq-blue" onClick={() => setEditing(true)}>
            Перейменувати
          </button>
        )}{' '}
        <button type="button" className="ml-3 text-rose-600" onClick={onRemove}>
          Прибрати
        </button>
      </td>
    </tr>
  );
}

function ReportRow({
  report,
  current,
  onApprove,
  onRemove,
}: {
  report: SuperPrinterReport;
  current: SuperPrinterProfile | null;
  onApprove: (title: string) => Promise<void>;
  onRemove: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const [title, setTitle] = useState(current?.title ?? report.driver);

  return (
    <tr className="border-t border-sq-divider align-top">
      <td className="px-3 py-2 font-mono text-xs">{report.driver}</td>
      <td className="px-3 py-2">
        {profileText(report)}
        {report.paper_width_mm ? <span className="block text-xs text-sq-secondary">{report.paper_width_mm} мм</span> : null}
      </td>
      <td className="px-3 py-2">
        <span className="font-mono">{report.store_code}</span>
        <span className="block text-xs text-sq-secondary">{report.store_name}</span>
      </td>
      <td className="px-3 py-2">{report.prints}</td>
      <td className="px-3 py-2 whitespace-nowrap">{formatWhen(report.last_reported_at)}</td>
      <td className="px-3 py-2 text-right">
        {report.approved ? (
          <span className="text-emerald-700">Затверджено</span>
        ) : approving ? (
          <form
            className="flex justify-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void onApprove(title).then(() => setApproving(false));
            }}
          >
            <input
              className="sq-input"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Назва для всіх"
              autoFocus
            />
            <button type="submit" className="sq-btn-primary px-3" disabled={!title.trim()}>
              {current ? 'Замінити' : 'Затвердити'}
            </button>
          </form>
        ) : (
          <span className="whitespace-nowrap">
            <button type="button" className="text-sq-blue font-semibold" onClick={() => setApproving(true)}>
              {current ? 'Затвердити замість поточного' : 'Затвердити для всіх'}
            </button>
            <button type="button" className="ml-3 text-sq-secondary" onClick={onRemove}>
              Видалити
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}
