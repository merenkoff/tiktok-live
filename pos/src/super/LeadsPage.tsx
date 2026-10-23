// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { superApi, superErrorText, type SuperLeadList, type SuperLeadRow, type SuperLeadStatus } from './superApi';
import { INTEREST_OPTIONS, STATUS_LABEL, STATUS_ORDER, formatWhen, interestLabel, intentLabel } from './leadLabels';
import { LeadCard } from './LeadCard';

const PAGE = 50;

/**
 * «Ліди» — people who left a phone on the-live.shop (TechDocs/CRM_LEADS.md):
 * who, what they want, where they came from and the «hot» chips, newest
 * activity first. Read only when this tab is open; nothing here touches stores.
 */
export function LeadsPage() {
  const [status, setStatus] = useState<SuperLeadStatus | ''>('');
  const [interest, setInterest] = useState('');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState<SuperLeadList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  // The search box waits for a pause in typing before it asks the server.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (offset = 0) => {
      setLoading(true);
      setError(null);
      try {
        const next = await superApi.listLeads({ status: status || undefined, interest, q, limit: PAGE, offset });
        setList((prev) => (offset > 0 && prev ? { ...next, items: [...prev.items, ...next.items] } : next));
      } catch (err) {
        setError(superErrorText(err));
      } finally {
        setLoading(false);
      }
    },
    [status, interest, q]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  function replaceRow(row: Pick<SuperLeadRow, 'id' | 'status' | 'note'>) {
    setList((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === row.id ? { ...i, status: row.status, note: row.note } : i)) } : prev
    );
  }

  const all = list ? STATUS_ORDER.reduce((n, s) => n + list.counts[s], 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Статус">
        <StatusChip active={status === ''} onClick={() => setStatus('')} label="Усі" count={all} />
        {STATUS_ORDER.map((s) => (
          <StatusChip
            key={s}
            active={status === s}
            onClick={() => setStatus(s)}
            label={STATUS_LABEL[s]}
            count={list?.counts[s] ?? 0}
          />
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <select
            aria-label="Інтерес"
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            className="rounded-sq border border-sq-divider bg-sq-surface px-2 py-1.5 text-sm text-sq-text"
          >
            <option value="">Усі продукти</option>
            {INTEREST_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="search"
            aria-label="Пошук"
            placeholder="Ім’я або телефон"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-48 rounded-sq border border-sq-divider bg-sq-surface px-2 py-1.5 text-sm text-sq-text"
          />
          <button
            type="button"
            className="rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary"
            onClick={() => void load(0)}
          >
            Оновити
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="overflow-x-auto rounded-sq border border-sq-divider bg-sq-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs uppercase text-sq-secondary">
            <tr>
              <th className="px-3 py-2">Коли</th>
              <th className="px-3 py-2">Хто</th>
              <th className="px-3 py-2">Що хоче</th>
              <th className="px-3 py-2">Звідки</th>
              <th className="px-3 py-2">Сигнали</th>
              <th className="px-3 py-2">Заявок</th>
              <th className="px-3 py-2">Статус</th>
            </tr>
          </thead>
          <tbody>
            {list?.items.map((lead) => (
              <tr
                key={lead.id}
                className="cursor-pointer border-t border-sq-divider align-top hover:bg-sq-bg"
                onClick={() => setOpen(lead.id)}
                data-testid={`lead-row-${lead.id}`}
              >
                <td className="px-3 py-2 whitespace-nowrap text-sq-secondary">{formatWhen(lead.last_touch_at)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-sq-text">{lead.name ?? '—'}</div>
                  <a
                    href={`tel:${lead.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sq-blue tabular-nums"
                  >
                    {lead.phone}
                  </a>
                </td>
                <td className="px-3 py-2">
                  <div className="text-sq-text">{interestLabel(lead.interest)}</div>
                  <div className="text-xs text-sq-secondary">{intentLabel(lead.last?.intent ?? null)}</div>
                </td>
                <td className="px-3 py-2 text-sq-text">{lead.last?.source ?? '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(lead.last?.signals ?? []).map((s) => (
                      <span key={s} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums text-sq-secondary">{lead.touches}</td>
                <td className="px-3 py-2 whitespace-nowrap">{STATUS_LABEL[lead.status]}</td>
              </tr>
            ))}
            {list && list.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sq-secondary">
                  Лідів за цими умовами немає.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {list && list.items.length < list.total && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(list.items.length)}
          className="rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary disabled:opacity-50"
        >
          Показати ще ({list.total - list.items.length})
        </button>
      )}

      {open != null && <LeadCard id={open} onClose={() => setOpen(null)} onSaved={replaceRow} />}
    </div>
  );
}

function StatusChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm ${
        active ? 'bg-sq-text text-sq-surface' : 'border border-sq-divider text-sq-secondary hover:text-sq-text'
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
