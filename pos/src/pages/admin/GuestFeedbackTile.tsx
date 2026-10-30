// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/GuestFeedbackTile.tsx — the dashboard's glance at what
// guests wrote (TechDocs/POS_QR_MENU_FEEDBACK.md, phase F4): the average, how
// many, the low ones waiting, the newest words. Like the vertical's panels it
// has NO fallback: nothing at all on an older server, on a refusal or with
// no feedback in the window, so a failing request cannot take the owner's
// morning screen down with it.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHead } from '../../components/ui/Page';
import { FACE_WORDS, feedbackSummary, whenText, type FeedbackSummary } from './reviewsApi';

export function GuestFeedbackTile({ from, to }: { from: string; to: string }) {
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);

  useEffect(() => {
    let alive = true;
    feedbackSummary({ from, to })
      .then((view) => {
        if (alive) setSummary(view.count > 0 ? view : null);
      })
      .catch(() => {
        if (alive) setSummary(null);
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  if (!summary) return null;

  return (
    <section data-testid="dashboard-feedback">
      <SectionHead
        title="Відгуки гостей"
        action={
          <Link to="/admin/reviews" className="text-[15px] font-semibold text-sq-blue">
            Усі відгуки
          </Link>
        }
      />
      <div className="pt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[28px] font-bold leading-none text-sq-heading">
          {summary.average === null ? '—' : summary.average.toFixed(1).replace('.', ',')}
          <span className="ml-1 text-[15px] font-semibold text-sq-muted">із 5</span>
        </span>
        <span className="text-[15px] text-sq-secondary">відгуків: {summary.count}</span>
        {summary.unhandled_low > 0 && (
          <span className="text-[15px] font-semibold text-red-600">низьких без відповіді: {summary.unhandled_low}</span>
        )}
      </div>
      {summary.latest.length > 0 && (
        <ul className="pt-3 space-y-2">
          {summary.latest.map((row) => (
            <li key={row.id} className="text-[14px] text-sq-text">
              <span className="font-semibold text-sq-heading">
                {row.score} · {FACE_WORDS[row.score]}
              </span>
              <span className="text-sq-muted"> · {whenText(row.created_at)}</span>
              {row.comment && <span className="block text-sq-secondary line-clamp-2">{row.comment}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
