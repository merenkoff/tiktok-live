// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { MODULES } from '../modules/registry';
import type { ModuleRemoteEntry } from '../types';
import { validateRemoteEntryInput } from '../lib/moduleRemoteForm';
import { superApi, superErrorText, type SuperStoreRow } from './superApi';
import { ProbeNote } from './ProbeNote';
import { probeRemoteUrl, useProbe, type ProbeState } from './probe';

type Remotes = Record<string, string | ModuleRemoteEntry>;

const toggleable = MODULES.filter((m) => !m.core);

/**
 * One store's `enabled_modules` + `module_remotes`, the same two fields the
 * owner edits in Settings — saved through `PATCH /super/stores/:id`, which
 * validates exactly like the owner's route.
 */
export function StoreEditor({
  store,
  onSaved,
  onClose,
}: {
  store: SuperStoreRow;
  onSaved: (row: SuperStoreRow) => void;
  onClose: () => void;
}) {
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(store.enabled_modules));
  const [remotes, setRemotes] = useState<Remotes>(() => ({ ...store.module_remotes }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Add an online-only module (object form).
  const [nid, setNid] = useState('');
  const [ntitle, setNtitle] = useState('');
  const [nurl, setNurl] = useState('');
  const [nroute, setNroute] = useState('');
  const [norder, setNorder] = useState('90');
  const [nicon, setNicon] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addProbe, runAddProbe] = useProbe();

  // Per-entry URL edit + probe.
  const [probes, setProbes] = useState<Record<string, ProbeState>>({});

  function setRemote(id: string, value: string | ModuleRemoteEntry | null) {
    setRemotes((prev) => {
      const next = { ...prev };
      if (value === null) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  function setUrl(id: string, url: string) {
    const current = remotes[id];
    if (current === undefined) return;
    setRemote(id, typeof current === 'string' ? url : { ...current, url });
  }

  async function probe(id: string) {
    const current = remotes[id];
    if (current === undefined) return;
    const url = typeof current === 'string' ? current : current.url;
    setProbes((p) => ({ ...p, [id]: { state: 'busy' } }));
    const res = await probeRemoteUrl(url, id);
    setProbes((p) => ({ ...p, [id]: res }));
  }

  function addOnlineOnly() {
    setAddError(null);
    const res = validateRemoteEntryInput({
      id: nid,
      title: ntitle,
      url: nurl,
      routePath: nroute,
      order: norder,
      icon: nicon,
      takenIds: new Set([...MODULES.map((m) => m.id), ...Object.keys(remotes)]),
    });
    if (!res.ok) return setAddError(res.error);
    setRemote(res.id, res.entry);
    setNid('');
    setNtitle('');
    setNurl('');
    setNroute('');
    setNorder('90');
    setNicon('');
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const row = await superApi.patchStore(store.id, {
        enabled_modules: [...enabled],
        module_remotes: remotes,
      });
      onSaved(row);
      setRemotes({ ...row.module_remotes });
      setEnabled(new Set(row.enabled_modules));
      const dropped = Object.keys(remotes).filter((id) => !(id in row.module_remotes));
      setMessage(
        dropped.length
          ? `Збережено. Сервер відкинув записи: ${dropped.join(', ')}.`
          : 'Збережено.'
      );
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  const stringEntries = Object.entries(remotes).filter(([, v]) => typeof v === 'string') as Array<[string, string]>;
  const objectEntries = Object.entries(remotes).filter(([, v]) => typeof v !== 'string') as Array<[string, ModuleRemoteEntry]>;

  return (
    <div className="space-y-4 text-sm">
      <section>
        <p className="sq-section-label">Модулі магазину</p>
        <div className="mt-2 grid gap-1 sm:grid-cols-3">
          {toggleable.map((m) => (
            <label key={m.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={enabled.has(m.id)}
                onChange={(e) =>
                  setEnabled((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(m.id);
                    else next.delete(m.id);
                    return next;
                  })
                }
                className="h-4 w-4"
              />
              <span>
                {m.title} <span className="text-xs text-sq-secondary">({m.id})</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <p className="sq-section-label">Джерела вбудованих модулів (override)</p>
        {stringEntries.length === 0 && <p className="text-xs text-sq-secondary">Немає — усі вбудовані.</p>}
        {stringEntries.map(([id, url]) => (
          <RemoteRow
            key={id}
            id={id}
            label={`${id} (override)`}
            url={url}
            probe={probes[id]}
            onUrl={(u) => setUrl(id, u)}
            onProbe={() => void probe(id)}
            onRemove={() => setRemote(id, null)}
          />
        ))}
        <AddOverride
          remotes={remotes}
          onAdd={(id, url) => setRemote(id, url)}
        />
      </section>

      <section className="space-y-2">
        <p className="sq-section-label">Онлайн-модулі</p>
        {objectEntries.length === 0 && <p className="text-xs text-sq-secondary">Немає.</p>}
        {objectEntries.map(([id, entry]) => (
          <RemoteRow
            key={id}
            id={id}
            label={`${entry.title} (${id}) · ${entry.routePath}`}
            url={entry.url}
            probe={probes[id]}
            onUrl={(u) => setUrl(id, u)}
            onProbe={() => void probe(id)}
            onRemove={() => setRemote(id, null)}
          />
        ))}
        <div className="rounded-sq border border-dashed border-sq-divider p-3 space-y-2">
          <p className="text-xs text-sq-secondary">Додати онлайн-модуль</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={nid} onChange={(e) => setNid(e.target.value)} placeholder="id (напр. stocktake)" className="rounded-sq border border-sq-divider bg-sq-surface px-2 py-1.5 text-xs" />
            <input value={ntitle} onChange={(e) => setNtitle(e.target.value)} placeholder="Назва" className="rounded-sq border border-sq-divider bg-sq-surface px-2 py-1.5 text-xs" />
            <input value={nroute} onChange={(e) => setNroute(e.target.value)} placeholder="Маршрут (/stocktake)" className="rounded-sq border border-sq-divider bg-sq-surface px-2 py-1.5 text-xs" />
            <input value={nurl} onChange={(e) => setNurl(e.target.value)} placeholder="URL remote-entry.js" className="rounded-sq border border-sq-divider bg-sq-surface px-2 py-1.5 text-xs sm:col-span-2" />
            <div className="flex gap-2">
              <input value={norder} onChange={(e) => setNorder(e.target.value)} placeholder="Порядок" className="w-20 rounded-sq border border-sq-divider bg-sq-surface px-2 py-1.5 text-xs" />
              <input value={nicon} onChange={(e) => setNicon(e.target.value)} placeholder="Іконка" className="min-w-0 flex-1 rounded-sq border border-sq-divider bg-sq-surface px-2 py-1.5 text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-sq border border-sq-divider px-2.5 py-1 text-xs" onClick={() => void runAddProbe(nurl, nid.trim() || null)} disabled={!nurl.trim()}>
              Перевірити джерело
            </button>
            <button type="button" className="rounded-sq border border-sq-divider px-2.5 py-1 text-xs" onClick={addOnlineOnly}>
              + Додати
            </button>
            <ProbeNote probe={addProbe} />
          </div>
          {addError && <p className="text-xs text-rose-600">{addError}</p>}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" className="sq-btn-primary px-4 py-1.5" onClick={() => void save()} disabled={busy}>
          {busy ? 'Зберігаю…' : 'Зберегти'}
        </button>
        <button type="button" className="px-2 py-1.5 text-sq-secondary" onClick={onClose}>
          Закрити
        </button>
        {message && <span className="text-xs text-emerald-700">{message}</span>}
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    </div>
  );
}

function RemoteRow({
  id,
  label,
  url,
  probe,
  onUrl,
  onProbe,
  onRemove,
}: {
  id: string;
  label: string;
  url: string;
  probe: ProbeState | undefined;
  onUrl: (url: string) => void;
  onProbe: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-sq border border-sq-divider bg-sq-surface px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-sq-text">{label}</span>
        <button type="button" className="text-xs text-sq-secondary hover:text-rose-600" onClick={onRemove}>
          Прибрати
        </button>
      </div>
      <div className="flex gap-2">
        <input
          aria-label={`Джерело ${id}`}
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          className="min-w-0 flex-1 rounded-sq border border-sq-divider bg-sq-bg px-2 py-1 text-xs"
        />
        <button type="button" className="rounded-sq border border-sq-divider px-2 py-1 text-xs" onClick={onProbe}>
          Перевірити
        </button>
      </div>
      {probe && <ProbeNote probe={probe} />}
    </div>
  );
}

function AddOverride({ remotes, onAdd }: { remotes: Remotes; onAdd: (id: string, url: string) => void }) {
  const free = toggleable.filter((m) => !(m.id in remotes));
  const [id, setId] = useState<string>(free[0]?.id ?? '');
  const [url, setUrl] = useState('');
  if (free.length === 0) return null;
  return (
    <div className="flex gap-2">
      <select value={id} onChange={(e) => setId(e.target.value)} className="rounded-sq border border-sq-divider bg-sq-surface px-2 py-1 text-xs">
        {free.map((m) => (
          <option key={m.id} value={m.id}>
            {m.id}
          </option>
        ))}
      </select>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL remote-entry.js" className="min-w-0 flex-1 rounded-sq border border-sq-divider bg-sq-surface px-2 py-1 text-xs" />
      <button
        type="button"
        className="rounded-sq border border-sq-divider px-2 py-1 text-xs"
        disabled={!id || !url.trim()}
        onClick={() => {
          onAdd(id, url.trim());
          setUrl('');
        }}
      >
        + Override
      </button>
    </div>
  );
}
