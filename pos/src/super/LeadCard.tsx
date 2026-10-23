// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { type ReactNode, useEffect, useState } from 'react';
import { superApi, superErrorText, type SuperLeadCard, type SuperLeadStatus, type SuperLeadTouch } from './superApi';
import { STATUS_LABEL, STATUS_ORDER, formLabel, formatWhen, interestLabel, intentLabel } from './leadLabels';

/**
 * One lead: the status and the note the super admin keeps, and every form the
 * person sent with where they came from and what they did before it.
 */
export function LeadCard({
  id,
  onClose,
  onSaved,
}: {
  id: number;
  onClose: () => void;
  onSaved: (lead: { id: number; status: SuperLeadStatus; note: string }) => void;
}) {
  const [lead, setLead] = useState<SuperLeadCard | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLead(null);
    superApi
      .getLead(id)
      .then((card) => {
        if (!alive) return;
        setLead(card);
        setNote(card.note);
      })
      .catch((err) => alive && setError(superErrorText(err)));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save(patch: { status?: SuperLeadStatus; note?: string }) {
    setBusy(true);
    setError(null);
    try {
      const card = await superApi.patchLead(id, patch);
      setLead(card);
      setNote(card.note);
      onSaved({ id: card.id, status: card.status, note: card.note });
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Лід"
        className="h-full w-full max-w-xl overflow-y-auto bg-sq-surface p-5 shadow-xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-sq-text">{lead?.name ?? 'Без імені'}</h2>
            {lead && (
              <a href={`tel:${lead.phone}`} className="text-sq-blue tabular-nums">
                {lead.phone}
              </a>
            )}
            {lead && (
              <p className="mt-1 text-sm text-sq-secondary">
                {interestLabel(lead.interest)} · заявок: {lead.touches} · перша {formatWhen(lead.created_at)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary">
            Закрити
          </button>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        {lead && (
          <>
            <section className="space-y-2">
              <h3 className="sq-section-label">Статус</h3>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Статус ліда">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    aria-pressed={lead.status === s}
                    onClick={() => lead.status !== s && void save({ status: s })}
                    className={`rounded-full px-3 py-1 text-sm disabled:opacity-60 ${
                      lead.status === s ? 'bg-sq-text text-sq-surface' : 'border border-sq-divider text-sq-secondary hover:text-sq-text'
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="sq-section-label">Нотатка</h3>
              <textarea
                aria-label="Нотатка"
                value={note}
                maxLength={2000}
                rows={3}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text"
                placeholder="Що домовились, коли передзвонити…"
              />
              <button
                type="button"
                disabled={busy || note.trim() === lead.note}
                onClick={() => void save({ note })}
                className="sq-btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Зберегти нотатку
              </button>
            </section>

            <section className="space-y-3">
              <h3 className="sq-section-label">Заявки</h3>
              {lead.history.map((t) => (
                <TouchCard key={t.id} touch={t} />
              ))}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
      <span className="text-sq-secondary">{label}</span>
      <span className="text-sq-text break-words">{children}</span>
    </div>
  );
}

function originText(t: SuperLeadTouch['journey']['first']): string | null {
  if (!t) return null;
  const parts = [
    t.ref && `з ${t.ref}`,
    t.landing && `на ${t.landing}`,
    t.utm && Object.entries(t.utm).map(([k, v]) => `utm_${k}=${v}`).join(' '),
    t.click && Object.keys(t.click).join(', '),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function TouchCard({ touch }: { touch: SuperLeadTouch }) {
  const j = touch.journey;
  const firstOrigin = originText(j.first);
  const lastOrigin = originText(j.last);
  return (
    <div className="rounded-sq border border-sq-divider p-3 space-y-1.5" data-testid={`lead-touch-${touch.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-sq-text">{formLabel(touch.form_id)}</span>
        <span className="text-xs text-sq-secondary">{formatWhen(touch.created_at)}</span>
      </div>
      {touch.signals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {touch.signals.map((s) => (
            <span key={s} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              {s}
            </span>
          ))}
        </div>
      )}
      <Row label="Намір">{intentLabel(touch.intent)}</Row>
      {(touch.product || touch.business) && (
        <Row label="Продукт">
          {interestLabel(touch.product ?? touch.business)}
          {touch.business && touch.product ? ` (сам обрав: ${interestLabel(touch.business)})` : ''}
        </Row>
      )}
      {touch.page_path && <Row label="Сторінка">{touch.page_path}</Row>}
      <Row label="Звідки (цей візит)">{touch.source}</Row>
      {touch.first_source !== touch.source && <Row label="Уперше прийшов">{touch.first_source}</Row>}
      {firstOrigin && <Row label="Перший дотик">{firstOrigin}</Row>}
      {lastOrigin && lastOrigin !== firstOrigin && <Row label="Останній дотик">{lastOrigin}</Row>}
      {(j.visits || touch.days_to_lead != null) && (
        <Row label="Візити">
          {j.visits ?? 1}
          {touch.days_to_lead != null ? ` · днів до заявки: ${touch.days_to_lead}` : ''}
          {j.device ? ` · ${j.device === 'mobile' ? 'телефон' : 'комп’ютер'}` : ''}
        </Row>
      )}
      {j.ctas && j.ctas.length > 0 && <Row label="Кнопки">{j.ctas.map((c) => c.id).join(' → ')}</Row>}
      {j.pages && j.pages.length > 0 && <Row label="Сторінки">{j.pages.map((p) => p.p).join(' → ')}</Row>}
    </div>
  );
}
