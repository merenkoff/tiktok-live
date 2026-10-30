// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/ReviewsPage.tsx — «Відгуки»: what guests wrote from the
// QR menu, for the owner (TechDocs/POS_QR_MENU_FEEDBACK.md, phase F4).
//
// The head is arithmetic (average, how many, the spread, the chips ticked
// most, and the low scores nobody has answered); the list is the guests'
// own words, newest first, with where they sat and a phone when they left
// one. «Опрацьовано» is the owner's own bookkeeping — nothing is sent to the
// guest, there is no channel; the owner calls.
//
// Host page in the `analytics` module, through `api.posRequest`: the
// `@pos/platform` surface does not move for it.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, SectionHead, Segmented } from '../../components/ui/Page';
import { Star } from '../../platform/glyphs';
import {
  FACE_WORDS,
  daysBefore,
  feedbackSummary,
  listFeedback,
  setFeedbackHandled,
  whenText,
  whereText,
  type FeedbackRow,
  type FeedbackSummary,
} from './reviewsApi';

type Period = '7' | '30' | '90';
type LoadState = 'loading' | 'ready' | 'older' | 'forbidden' | 'error';

const PAGE = 30;
const CHECKBOX = 'w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]';

/** Today on the device: the server clips to the store's day anyway, this only names the window. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function scoreTone(score: number): string {
  if (score >= 4) return 'text-sq-success';
  if (score === 3) return 'text-sq-warning';
  return 'text-red-600';
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } }).response?.status;
}

export function ReviewsPage() {
  const [period, setPeriod] = useState<Period>('30');
  const [score, setScore] = useState<number>(0);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [state, setState] = useState<LoadState>('loading');
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const window = useCallback(() => {
    const to = today();
    return { from: daysBefore(to, Number(period) - 1), to };
  }, [period]);

  const load = useCallback(async () => {
    setState('loading');
    setMessage(null);
    try {
      const { from, to } = window();
      const [head, list] = await Promise.all([
        feedbackSummary({ from, to }),
        listFeedback({ from, to, score: score || undefined, handled: onlyOpen ? false : undefined, limit: PAGE }),
      ]);
      setSummary(head);
      setRows(list.rows);
      setTotal(list.total);
      setState('ready');
    } catch (error) {
      const status = statusOf(error);
      setState(status === 403 ? 'forbidden' : status === 404 ? 'older' : 'error');
    }
  }, [window, score, onlyOpen]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    setMore(true);
    try {
      const { from, to } = window();
      const list = await listFeedback({
        from,
        to,
        score: score || undefined,
        handled: onlyOpen ? false : undefined,
        limit: PAGE,
        offset: rows.length,
      });
      setRows((current) => [...current, ...list.rows.filter((row) => !current.some((r) => r.id === row.id))]);
      setTotal(list.total);
    } catch {
      setMessage('Не вдалося завантажити ще. Спробуйте ще раз.');
    } finally {
      setMore(false);
    }
  }

  async function toggleHandled(row: FeedbackRow) {
    setBusy(row.id);
    setMessage(null);
    try {
      const next = await setFeedbackHandled(row.id, row.handled_at === null);
      setRows((current) => current.map((r) => (r.id === next.id ? next : r)));
      setSummary((current) =>
        current && next.score <= 3
          ? { ...current, unhandled_low: Math.max(0, current.unhandled_low + (next.handled_at ? -1 : 1)) }
          : current
      );
    } catch (error) {
      setMessage(statusOf(error) === 403 ? 'Лише власник магазину може змінювати це.' : 'Не вдалося зберегти. Спробуйте ще раз.');
    } finally {
      setBusy(null);
    }
  }

  const filtered = score !== 0 || onlyOpen;

  return (
    <div>
      <PageHeader
        title="Відгуки"
        glyph={Star}
        subtitle="Що гості написали з QR-меню: оцінка одним дотиком, що сподобалось чи пішло не так, кілька слів і телефон, якщо вони хочуть дзвінка. Читаєте лише ви; гостям це не показується."
        actions={
          <Segmented<Period>
            ariaLabel="Період"
            value={period}
            onChange={setPeriod}
            options={[
              { value: '7', label: '7 днів' },
              { value: '30', label: '30 днів' },
              { value: '90', label: '90 днів' },
            ]}
          />
        }
      />

      {state === 'forbidden' && <p className="text-[15px] text-sq-secondary">Відгуки читає лише власник магазину.</p>}
      {state === 'older' && (
        <p className="text-[15px] text-sq-secondary">
          Сервер ще не знає відгуків гостей — оновлення вийде найближчим часом.
        </p>
      )}
      {state === 'error' && (
        <div className="space-y-3">
          <p className="text-[15px] text-sq-secondary">Не вдалося завантажити відгуки.</p>
          <button type="button" className="sq-btn-quiet" onClick={() => void load()}>
            Спробувати ще раз
          </button>
        </div>
      )}

      {summary && state !== 'forbidden' && state !== 'older' && (
        <section className="mb-8" data-testid="reviews-summary">
          <SectionHead title="За період" />
          <div className="pt-3 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-sq-sidebar p-4">
              <p className="text-[13px] font-semibold text-sq-secondary">Середня оцінка</p>
              <p className="mt-1 text-[32px] font-bold leading-none text-sq-heading">
                {summary.average === null ? '—' : summary.average.toFixed(1).replace('.', ',')}
                <span className="ml-1 text-[15px] font-semibold text-sq-muted">із 5</span>
              </p>
              <p className="mt-1 text-[15px] text-sq-secondary">
                {summary.count === 0
                  ? 'Відгуків ще немає'
                  : `${summary.count} ${summary.count % 10 === 1 && summary.count % 100 !== 11 ? 'відгук' : summary.count % 10 >= 2 && summary.count % 10 <= 4 && (summary.count % 100 < 10 || summary.count % 100 >= 20) ? 'відгуки' : 'відгуків'}`}
              </p>
            </div>
            <div className="rounded-2xl bg-sq-sidebar p-4">
              <p className="text-[13px] font-semibold text-sq-secondary">Оцінки</p>
              <ul className="mt-2 space-y-1" aria-label="Розподіл оцінок">
                {([5, 4, 3, 2, 1] as const).map((s) => {
                  const n = summary.distribution[String(s) as keyof FeedbackSummary['distribution']];
                  const share = summary.count ? Math.round((n / summary.count) * 100) : 0;
                  return (
                    <li key={s} className="flex items-center gap-2 text-[13px]">
                      <span className="w-4 font-semibold text-sq-secondary">{s}</span>
                      <span className="flex-1 h-2 rounded-full bg-sq-empty overflow-hidden">
                        <span className="block h-full rounded-full bg-sq-blue" style={{ width: `${share}%` }} />
                      </span>
                      <span className="w-6 text-right text-sq-muted">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="rounded-2xl bg-sq-sidebar p-4">
              <p className="text-[13px] font-semibold text-sq-secondary">Найчастіше відмічають</p>
              {summary.tags.length === 0 ? (
                <p className="mt-1 text-[15px] text-sq-muted">—</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {summary.tags.map((tag) => (
                    <li key={tag.code} className="rounded-full bg-sq-bg px-2.5 py-1 text-[13px] text-sq-text ring-1 ring-inset ring-sq-divider">
                      {tag.label} <span className="text-sq-muted">{tag.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              {summary.unhandled_low > 0 && (
                <p className="mt-3 text-[13px] font-semibold text-red-600" data-testid="reviews-unhandled">
                  Низьких оцінок без відповіді: {summary.unhandled_low}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {state !== 'forbidden' && state !== 'older' && (
        <section>
          <SectionHead title="Відгуки" count={total || undefined} />
          <div className="pt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Фільтр за оцінкою">
            {[0, 5, 4, 3, 2, 1].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={score === s}
                onClick={() => setScore(s)}
                className={`min-h-9 rounded-full px-3 text-[14px] font-semibold ring-1 ring-inset ${
                  score === s ? 'bg-sq-blue text-white ring-sq-blue' : 'bg-sq-bg text-sq-text ring-sq-divider'
                }`}
              >
                {s === 0 ? 'Усі' : `${s} · ${FACE_WORDS[s]}`}
              </button>
            ))}
            <label className="ml-2 min-h-9 flex items-center gap-2 text-[14px] text-sq-text">
              <input type="checkbox" className={CHECKBOX} checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
              Лише неопрацьовані
            </label>
          </div>

          {state === 'loading' && <p className="pt-4 text-[15px] text-sq-muted">Завантаження…</p>}

          {state === 'ready' && rows.length === 0 && (
            <div className="pt-4 space-y-2 text-[15px] text-sq-secondary" data-testid="reviews-empty">
              {filtered ? (
                <p>За цим фільтром відгуків немає.</p>
              ) : (
                <>
                  <p>Відгуків за цей період немає.</p>
                  <p>
                    Гості пишуть їх з QR-меню, коли в «Налаштуваннях» → «QR-меню для гостей» увімкнено{' '}
                    <Link to="/admin/settings" className="font-semibold text-sq-blue">
                      «Приймати відгуки гостей»
                    </Link>
                    .
                  </p>
                </>
              )}
            </div>
          )}

          <ul className="pt-4 space-y-3" aria-label="Список відгуків">
            {rows.map((row) => (
              <li
                key={row.id}
                data-testid="review-row"
                className={`rounded-2xl p-4 ring-1 ring-inset ring-sq-divider ${row.handled_at ? 'bg-sq-bg opacity-70' : 'bg-sq-sidebar'}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`text-[22px] font-bold leading-none ${scoreTone(row.score)}`}>
                    {row.score}
                    <span className="text-[13px] font-semibold text-sq-muted">/5</span>
                  </span>
                  <span className="text-[15px] font-semibold text-sq-heading">{FACE_WORDS[row.score]}</span>
                  <span className="text-[13px] text-sq-muted">
                    {whenText(row.created_at)} · {whereText(row)}
                    {row.bill_no !== null && ` · рахунок ${row.bill_no}`}
                    {row.source === 'bill' && ' · з рахунку'}
                  </span>
                </div>
                {row.tag_labels.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {row.tag_labels.map((label) => (
                      <li key={label} className="rounded-full bg-sq-bg px-2.5 py-1 text-[13px] text-sq-text ring-1 ring-inset ring-sq-divider">
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
                {row.comment && <p className="mt-2 whitespace-pre-line text-[15px] text-sq-text">{row.comment}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
                  {row.phone && (
                    <a href={`tel:${row.phone.replace(/[^\d+]/g, '')}`} className="font-semibold text-sq-blue">
                      {row.phone}
                    </a>
                  )}
                  {row.handled_at ? (
                    <span className="text-sq-muted">
                      Опрацьовано{row.handled_by ? ` · ${row.handled_by}` : ''} · {whenText(row.handled_at)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="sq-btn-quiet ml-auto"
                    disabled={busy === row.id}
                    onClick={() => void toggleHandled(row)}
                  >
                    {row.handled_at ? 'Повернути в нові' : 'Опрацьовано'}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {rows.length < total && (
            <div className="pt-4">
              <button type="button" className="sq-btn-quiet" disabled={more} onClick={() => void loadMore()}>
                {more ? 'Завантаження…' : `Показати ще (${total - rows.length})`}
              </button>
            </div>
          )}
          <p role="status" className="min-h-5 pt-2 text-[15px] text-sq-secondary">
            {message}
          </p>
        </section>
      )}
    </div>
  );
}
