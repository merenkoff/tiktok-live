// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useState } from 'react';
import { parseVersionFromUrl, remoteUrlOf } from '../lib/moduleRemoteForm';
import { superApi, superErrorText, type RepointReport, type SuperStoreRow } from './superApi';
import { ProbeNote } from './ProbeNote';
import { useProbe } from './probe';

/**
 * "Re-point module X at URL Y in these stores" — the reason `/super` exists.
 * A release URL pins one version (TechDocs/POS_FISCAL_CHECKBOX_SETUP.md), so
 * every release used to mean editing every store by hand.
 */
export function RepointPanel({ stores, onDone }: { stores: SuperStoreRow[]; onDone: () => void }) {
  const moduleIds = useMemo(
    () => [...new Set(stores.flatMap((s) => Object.keys(s.module_remotes)))].sort(),
    [stores]
  );
  const [moduleId, setModuleId] = useState(moduleIds[0] ?? '');
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Set<number>>(() => withModule(stores, moduleIds[0] ?? ''));
  const [probe, runProbe] = useProbe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RepointReport | null>(null);

  function pickModule(id: string) {
    setModuleId(id);
    setSelected(withModule(stores, id));
    setReport(null);
  }

  async function apply() {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await superApi.repoint({ module_id: moduleId, url: url.trim(), store_ids: [...selected] });
      setReport(res);
      onDone();
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (moduleIds.length === 0) return null;
  const version = parseVersionFromUrl(url);

  return (
    <section className="rounded-sq border border-sq-divider bg-sq-surface p-4 space-y-3 text-sm">
      <div>
        <p className="sq-section-label">Перенацілити модуль</p>
        <p className="text-xs text-sq-secondary">
          Новий URL підставляється у вибрані магазини, де цей модуль уже є; решта полів запису
          (назва, маршрут, меню) лишаються. Магазини без модуля пропускаються.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
        <select aria-label="Модуль" value={moduleId} onChange={(e) => pickModule(e.target.value)} className="rounded-sq border border-sq-divider bg-sq-bg px-2 py-1.5">
          {moduleIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <input
          aria-label="Новий URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://cdn.jsdelivr.net/gh/…@module-<id>-v<версія>/<id>/remote-entry.js"
          className="min-w-0 rounded-sq border border-sq-divider bg-sq-bg px-2 py-1.5"
        />
        <button type="button" className="rounded-sq border border-sq-divider px-3 py-1.5 text-xs" disabled={!url.trim()} onClick={() => void runProbe(url, moduleId)}>
          Перевірити джерело
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {version && <span className="text-sq-secondary">Версія з URL: {version}</span>}
        <ProbeNote probe={probe} />
      </div>
      <div className="flex flex-wrap gap-3">
        {stores.map((s) => {
          const has = moduleId in s.module_remotes;
          const current = has ? remoteUrlOf(s.module_remotes[moduleId]) : null;
          const currentVersion = current ? parseVersionFromUrl(current) : null;
          return (
            <label key={s.id} className={`flex items-center gap-2 text-xs ${has ? '' : 'text-sq-secondary'}`}>
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                disabled={!has}
                onChange={(e) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    return next;
                  })
                }
                className="h-4 w-4"
              />
              <span>
                {s.name}
                {has ? ` (зараз ${currentVersion ?? 'без версії'})` : ' — модуля немає'}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="sq-btn-primary px-4 py-1.5 disabled:opacity-50" disabled={busy || !url.trim() || selected.size === 0} onClick={() => void apply()}>
          {busy ? 'Застосовую…' : `Застосувати до ${selected.size}`}
        </button>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
      {report && (
        <div className="rounded-sq bg-sq-bg px-3 py-2 text-xs space-y-1" role="status">
          <div className="text-emerald-700">Оновлено: {report.updated.length}{report.updated.length ? ` (${report.updated.map((s) => s.slug).join(', ')})` : ''}</div>
          {report.skipped.length > 0 && <div className="text-sq-secondary">Пропущено (модуля немає): {report.skipped.map((s) => s.slug).join(', ')}</div>}
          {report.failed.length > 0 && (
            <div className="text-rose-600">
              Не вдалося: {report.failed.map((f) => `${f.slug} — ${f.error}`).join('; ')}
            </div>
          )}
          <div className="text-sq-secondary">
            Веб-каси побачать баннер «Перезавантажити» після наступного запиту, десктоп підтягне нову
            версію фоновим синком.
          </div>
        </div>
      )}
    </section>
  );
}

function withModule(stores: SuperStoreRow[], moduleId: string): Set<number> {
  return new Set(stores.filter((s) => moduleId in s.module_remotes).map((s) => s.id));
}
