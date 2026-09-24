// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@pos/platform';
import type { StockDocument, StockDocumentLine } from '@pos/platform';
import { ClipboardCheck, PageHeader } from '@pos/platform/ui';
import { STATUS_LABEL } from '../lib/documents';

export function StockInventoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<StockDocument | null>(null);
  const [lines, setLines] = useState<StockDocumentLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  async function load(documentId: number) {
    const d = await api.getStockDocument(documentId);
    setDoc(d);
    setLines(d.lines ?? []);
  }

  useEffect(() => {
    if (!id) return;
    void load(Number(id)).catch(() => setError('Не вдалося завантажити'));
  }, [id]);

  async function startFull() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createStockDocument({ type: 'inventory', note: 'Повна інвентаризація' });
      await api.bulkInventoryLines(created.id, {});
      navigate(`/admin/stock/inventory/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!doc) return;
    setBusy(true);
    try {
      const refreshed = await api.refreshInventorySystemQty(doc.id);
      setLines(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  async function setCounted(line: StockDocumentLine, counted: number) {
    if (!doc || doc.status !== 'draft') return;
    const updated = await api.updateStockDocumentLine(doc.id, line.id, { counted_qty: counted });
    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, ...updated } : l)));
  }

  async function post() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      const posted = await api.postStockDocument(doc.id, crypto.randomUUID());
      setDoc(posted);
      setLines(posted.lines ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка проведення');
    } finally {
      setBusy(false);
    }
  }

  const variances = useMemo(
    () =>
      lines.filter((l) => {
        const counted = l.counted_qty ?? l.system_qty ?? 0;
        const system = l.system_qty ?? 0;
        return counted !== system;
      }),
    [lines]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return lines;
    return lines.filter((l) =>
      [l.product_name, l.label].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [lines, q]);

  if (!id) {
    return (
      <div className="max-w-xl space-y-5 animate-fade-up text-sq-text">
        <PageHeader
          back={{ to: '/admin/stock', label: 'Склад' }}
          glyph={ClipboardCheck}
          title="Інвентаризація"
          subtitle="Порахуйте фактичні залишки. Система порівняє з обліком і виправить різницю після проведення."
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void startFull()}
          className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]"
        >
          Почати повну інвентаризацію
        </button>
      </div>
    );
  }

  const statusText =
    doc?.status === 'draft'
      ? 'Чернетка — можна правити'
      : doc
        ? STATUS_LABEL[doc.status] ?? doc.status
        : '…';

  return (
    // No `animate-fade-up` here: while it runs, the wrapper's transform would
    // make it the containing block of the fixed «Провести» bar below.
    <div className="max-w-4xl space-y-5 pb-24 text-sq-text">
      <PageHeader
        back={{ to: '/admin/stock', label: 'Склад' }}
        glyph={ClipboardCheck}
        title={doc?.doc_number ?? '…'}
        subtitle={`Інвентаризація · ${statusText}`}
        actions={
          doc?.status === 'draft' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              className="sq-btn-quiet"
            >
              Оновити облікові
            </button>
          )
        }
      />

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Пошук…"
        className="sq-input"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <table className="sq-table">
        <thead>
          <tr>
            <th>Товар</th>
            <th className="text-right">Облік</th>
            <th className="text-right">Пораховано</th>
            <th className="text-right">Різниця</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((line) => {
            const system = line.system_qty ?? 0;
            const counted = line.counted_qty ?? system;
            const diff = counted - system;
            return (
              <tr key={line.id}>
                <td>
                  {line.product_name}{' '}
                  <span className="text-sq-muted">
                    {line.label}
                  </span>
                </td>
                <td className="text-right tabular-nums">{system}</td>
                <td className="text-right">
                  {doc?.status === 'draft' ? (
                    <input
                      type="number"
                      min={0}
                      value={counted}
                      onChange={(e) => void setCounted(line, Number(e.target.value))}
                      className="sq-input max-w-[6rem] text-right"
                    />
                  ) : (
                    <span className="tabular-nums">{counted}</span>
                  )}
                </td>
                <td
                  className={`text-right tabular-nums font-semibold ${
                    diff === 0 ? 'text-sq-muted' : diff < 0 ? 'text-sq-danger' : 'text-sq-success-ink'
                  }`}
                >
                  {diff === 0 ? '—' : diff > 0 ? `+${diff}` : diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {doc?.status === 'draft' && (
        <div className="fixed bottom-0 left-0 right-0 md:left-[256px] z-10 bg-sq-surface shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))] px-5 md:px-12 py-3 flex items-center justify-between gap-3">
          <p className="text-[15px] text-sq-secondary">
            Розбіжностей: <strong className="text-sq-text tabular-nums">{variances.length}</strong>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Провести інвентаризацію? Залишки зміняться на пораховані (${variances.length} розбіжностей).`
                )
              ) {
                void post();
              }
            }}
            className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]"
          >
            Провести
          </button>
        </div>
      )}
    </div>
  );
}
