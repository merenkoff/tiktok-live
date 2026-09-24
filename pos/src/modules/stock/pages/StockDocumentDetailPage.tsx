// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatUah } from '@pos/platform';
import type { StockDocument } from '@pos/platform';
import { ArrowLeft, FileText, PageHeader, SectionHead } from '@pos/platform/ui';
import { STATUS_LABEL, TYPE_GLYPH, TYPE_LABEL, statusChipClass } from '../lib/documents';

function apiError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (msg) return msg;
  }
  if (err instanceof Error) return err.message;
  return 'Помилка';
}

export function StockDocumentDetailPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState<StockDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api
      .getStockDocument(Number(id))
      .then(setDoc)
      .catch(() => setError('Документ не знайдено'));
  }, [id]);

  async function post() {
    if (!doc) return;
    const stubs = (doc.lines ?? []).filter((l) => l.is_placeholder).length;
    if (stubs > 0) {
      const ok = window.confirm(
        `Буде створено ${stubs} ${stubs === 1 ? 'новий товар' : 'нових товарів'} у каталозі. Продовжити?`
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      setDoc(await api.postStockDocument(doc.id, crypto.randomUUID()));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function reverse() {
    if (!doc) return;
    if (!window.confirm('Скасувати проведення цього документа?')) return;
    setBusy(true);
    try {
      const rev = await api.reverseStockDocument(doc.id);
      setDoc(await api.getStockDocument(doc.id));
      void rev;
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !doc) {
    return (
      <div>
        <Link
          to="/admin/stock"
          className="inline-flex items-center gap-1 min-h-9 text-[15px] font-semibold text-sq-blue"
        >
          <ArrowLeft size={20} />
          Склад
        </Link>
        <p className="mt-4 text-red-600">{error}</p>
      </div>
    );
  }

  if (!doc) return <p className="text-sq-secondary text-sm">Завантаження…</p>;

  const lines = doc.lines ?? [];

  return (
    <div className="max-w-3xl space-y-6 animate-fade-up text-sq-text">
      <PageHeader
        back={{ to: '/admin/stock', label: 'Склад' }}
        glyph={TYPE_GLYPH[doc.type] ?? FileText}
        title={doc.doc_number}
        actions={<span className={statusChipClass(doc.status)}>{STATUS_LABEL[doc.status] ?? doc.status}</span>}
        subtitle={
          <>
            <span className="tabular-nums">
              {TYPE_LABEL[doc.type] ?? doc.type} · {new Date(doc.occurred_at).toLocaleString('uk-UA')}
              {doc.reason_code ? ` · ${doc.reason_code}` : ''}
            </span>
            {doc.note && <span className="block mt-1 text-sq-text">{doc.note}</span>}
          </>
        }
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <SectionHead title="Товари" count={lines.length} />
        <ul>
          {lines.map((line) => {
            const isStub = Boolean(line.is_placeholder);
            const fromStub = Boolean(line.placeholder_name) && !isStub;
            return (
              <li key={line.id} className="sq-row min-h-12 py-2 flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base">
                      {line.product_name} {line.label}
                    </p>
                    {isStub && (
                      <span className="h-[22px] px-2 rounded-md inline-flex items-center bg-amber-50 text-amber-800 text-xs font-medium">
                        Новий
                      </span>
                    )}
                  </div>
                  {isStub && (
                    <p className="text-[13px] text-sq-muted">Створиться при проведенні</p>
                  )}
                  {fromStub && line.product_id != null && (
                    <Link to="/admin/products" className="text-[13px] font-semibold text-sq-blue">
                      Відкрити в каталозі
                    </Link>
                  )}
                  {doc.type === 'inventory' && (
                    <p className="text-[13px] text-sq-muted tabular-nums">
                      Облік {line.system_qty} → пораховано {line.counted_qty}
                    </p>
                  )}
                  {line.unit_cost_cents != null && (
                    <p className="text-[13px] text-sq-muted tabular-nums">
                      Закупка {formatUah(line.unit_cost_cents)}
                    </p>
                  )}
                  {isStub && line.placeholder_price_cents != null && (
                    <p className="text-[13px] text-sq-muted tabular-nums">
                      Ціна продажу {formatUah(line.placeholder_price_cents)}
                    </p>
                  )}
                </div>
                <p className="text-base font-semibold tabular-nums shrink-0">
                  {doc.type === 'inventory'
                    ? line.quantity
                    : doc.type === 'writeoff'
                      ? `−${line.quantity}`
                      : doc.type === 'adjustment'
                        ? line.quantity > 0
                          ? `+${line.quantity}`
                          : line.quantity
                        : `+${line.quantity}`}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        {doc.status === 'draft' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void post()}
            className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]"
          >
            Провести
          </button>
        )}
        {doc.status === 'posted' && doc.type !== 'inventory' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void reverse()}
            className="sq-btn-quiet"
          >
            Скасувати проведення
          </button>
        )}
        {doc.type === 'inventory' && (
          <Link to={`/admin/stock/inventory/${doc.id}`} className="sq-btn-quiet">
            Відкрити підрахунок
          </Link>
        )}
      </div>
    </div>
  );
}
