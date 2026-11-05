// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * «Пляшки» — the bar's open bottles (track ДК, ДК5, TechDocs/POS_DUAL_REGISTER.md
 * §4.4). One page in two frames: `/bottles` on the till's rail, where the
 * bartender works at 23:00 without the owner, and `/admin/bottles` in the
 * owner's cabinet, which adds the report over a period.
 *
 * What the screen answers, in this order:
 *   1. Which table waits for a stamp (Д18): a round with a pour went to the
 *      kitchen, its bill cannot be paid until the bar scans the new bottle.
 *   2. What is open and how much the count says is left.
 *   3. A bottle to open by hand — before a shift, or when the count says there
 *      is still some but the bottle is empty («Замінити»: the difference is
 *      written off), or a broken one («Розбилась»).
 *   4. What closed since yesterday, and what was physically left in a bottle
 *      the count closed as empty (Д19) — a discrepancy for the owner, stock
 *      untouched.
 *
 * The stamp is scanned on the till's own stamps sheet, the same one a whole
 * bottle uses, with one line: «Нова пляшка: …».
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@pos/platform';
import { ExciseStampSheet } from '../../components/cashier/ExciseStampSheet';
import { ConfirmSheet } from '../../components/cashier/ConfirmSheet';
import {
  bottleBroken,
  bottleLeftover,
  bottleReport,
  listBottles,
  mlText,
  openBottle,
  refusalText,
  type BottleReport,
  type BottlesState,
  type ClosedBottle,
  type OpenBottle,
} from './bottlesApi';

const POLL_MS = 15_000;

/** What the stamps sheet is opening. */
interface Opening {
  variant_id: number;
  product_name: string;
  replace: boolean;
  labels: string[];
}

const quietClass =
  'min-h-11 px-4 rounded-xl bg-white ring-1 ring-sq-divider text-[15px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-40';
const primaryClass = 'pos-btn-primary min-h-11 px-4 rounded-xl text-[15px] disabled:opacity-40';

function closeReasonText(bottle: ClosedBottle): string {
  if (bottle.close_reason === 'broken') return 'розбилась';
  if (bottle.close_reason === 'replaced') return 'замінили раніше';
  return 'налито все';
}

function discrepancyText(ml: number | null): string | null {
  if (ml == null || ml === 0) return null;
  return ml > 0 ? `списано ${mlText(ml)}` : `залишилось ${mlText(-ml)}`;
}

function timeText(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  return at.toDateString() === new Date().toDateString()
    ? time
    : `${at.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}, ${time}`;
}

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function BottlesPage({ admin = false }: { admin?: boolean }) {
  const role = useAuthStore((s) => s.auth?.staff.role ?? null);
  const [state, setState] = useState<BottlesState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState<OpenBottle | null>(null);
  const [leftover, setLeftover] = useState<{ id: number; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await listBottles());
      setError(null);
    } catch (err) {
      setError(refusalText(err, 'Не вдалося завантажити пляшки — перевірте мережу'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A table's round can wait for a stamp at any moment: poll while the screen
  // is on, and once more when it comes back. Paused while a sheet is open.
  const latest = useRef(load);
  latest.current = load;
  const paused = opening != null || broken != null;
  useEffect(() => {
    if (paused || typeof document === 'undefined') return;
    const seen = () => document.visibilityState === 'visible';
    const id = setInterval(() => {
      if (seen()) void latest.current();
    }, POLL_MS);
    const onReturn = () => {
      if (seen()) void latest.current();
    };
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [paused]);

  function startOpening(variantId: number, productName: string, replace: boolean) {
    setOpenError(null);
    setOpening({ variant_id: variantId, product_name: productName, replace, labels: [] });
  }

  async function submitOpening() {
    if (!opening || opening.labels.length === 0) return;
    setBusy(true);
    setOpenError(null);
    try {
      const next = await openBottle({
        variant_id: opening.variant_id,
        excise_label: opening.labels[0],
        ...(opening.replace ? { replace: true } : {}),
      });
      setState(next);
      setOpening(null);
    } catch (err) {
      const code = (err as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
      // A bottle of this drink is still open and the bartender did not say why
      // they start another: the same sheet becomes «Замінити».
      if (code === 'bottle_still_open' && !opening.replace) {
        setOpening({ ...opening, replace: true });
      }
      setOpenError(refusalText(err, 'Не вдалося відкрити пляшку'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmBroken() {
    if (!broken) return;
    setBusy(true);
    try {
      setState(await bottleBroken(broken.id));
      setBroken(null);
    } catch (err) {
      setError(refusalText(err, 'Не вдалося закрити пляшку'));
      setBroken(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveLeftover() {
    if (!leftover) return;
    const ml = Number(leftover.text);
    if (!Number.isInteger(ml) || ml <= 0) {
      setError('Залишок — ціле число мл');
      return;
    }
    setBusy(true);
    try {
      setState(await bottleLeftover(leftover.id, ml));
      setLeftover(null);
      setError(null);
    } catch (err) {
      setError(refusalText(err, 'Не вдалося записати залишок'));
    } finally {
      setBusy(false);
    }
  }

  const openIds = new Set((state?.open ?? []).map((b) => b.variant_id));
  const closedDrinks = (state?.drinks ?? []).filter((d) => !openIds.has(d.variant_id));

  return (
    <div className="flex-1 min-h-0 overflow-auto" data-testid="bottles-page">
      <header className="px-4 md:px-7 py-4 md:min-h-[72px]">
        <h1 className="text-2xl font-bold text-sq-heading">Пляшки</h1>
        <p className="mt-0.5 text-[15px] text-sq-secondary">
          Розлив за акцизною маркою: марку пляшки вносять у чек першої порції з неї
        </p>
      </header>

      <div className="px-4 md:px-7 pb-8 space-y-6 max-w-3xl">
        {error && (
          <p role="alert" className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-[15px]" data-testid="bottles-error">
            {error}
          </p>
        )}
        {!state && !error && <p className="text-sm text-sq-muted">Завантаження…</p>}

        {state && state.waiting.length > 0 && (
          <section className="space-y-2" data-testid="bottles-waiting">
            <h2 className="sq-section-label">Чекають марку нової пляшки</h2>
            {state.waiting.map((w) => (
              <article
                key={w.variant_id}
                className="rounded-card bg-amber-50 ring-1 ring-amber-200 px-5 py-4 flex flex-wrap items-center gap-3"
                data-testid={`bottles-waiting-${w.variant_id}`}
              >
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[17px] font-semibold text-sq-heading">{w.product_name}</p>
                  <p className="text-[14px] text-amber-900">
                    Налити ще {mlText(w.ml)}
                    {w.tables.length > 0 ? ` · ${w.tables.join(', ')}` : ''} — рахунок не оплатять, доки марку не
                    відскановано
                  </p>
                </div>
                <button
                  type="button"
                  className={primaryClass}
                  onClick={() => startOpening(w.variant_id, w.product_name, false)}
                  data-testid={`bottles-scan-${w.variant_id}`}
                >
                  Скануйте марку
                </button>
              </article>
            ))}
          </section>
        )}

        {state && (
          <section className="space-y-2" data-testid="bottles-open">
            <h2 className="sq-section-label">Відкриті</h2>
            {state.open.length === 0 && (
              <p className="text-[15px] text-sq-secondary">
                Жодної. Пляшку відкривають скануванням марки — тут або на касі, коли порція її потребує.
              </p>
            )}
            {state.open.map((b) => {
              const left = b.capacity_ml - b.poured_ml;
              const share = Math.max(0, Math.min(1, left / b.capacity_ml));
              return (
                <article key={b.id} className="rounded-card bg-white shadow-card px-5 py-4" data-testid={`bottle-${b.id}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[17px] font-semibold text-sq-heading">{b.product_name}</p>
                    <p className="text-[15px] tabular-nums text-sq-secondary shrink-0">
                      залишилось {mlText(left)} з {mlText(b.capacity_ml)}
                    </p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-sq-empty overflow-clip" aria-hidden>
                    <div className="h-full rounded-full bg-sq-blue" style={{ width: `${share * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-[13px] text-sq-muted tabular-nums">
                    Марка {b.label} · відкрито {timeText(b.opened_at)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={quietClass}
                      onClick={() => startOpening(b.variant_id, b.product_name, true)}
                      data-testid={`bottle-replace-${b.id}`}
                    >
                      Замінити
                    </button>
                    <button
                      type="button"
                      className={quietClass}
                      onClick={() => setBroken(b)}
                      data-testid={`bottle-broken-${b.id}`}
                    >
                      Розбилась
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {state && closedDrinks.length > 0 && (
          <section className="space-y-2" data-testid="bottles-drinks">
            <h2 className="sq-section-label">Відкрити пляшку</h2>
            <ul className="rounded-card bg-white shadow-card divide-y divide-sq-divider">
              {closedDrinks.map((d) => (
                <li key={d.variant_id} className="px-5 py-3 flex items-center gap-3">
                  <span className="flex-1 text-[15px]">
                    {d.product_name} <span className="text-sq-muted tabular-nums">· {mlText(d.bottle_ml)}</span>
                  </span>
                  <button
                    type="button"
                    className={quietClass}
                    onClick={() => startOpening(d.variant_id, d.product_name, false)}
                    data-testid={`bottles-open-${d.variant_id}`}
                  >
                    Відкрити
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {state && state.closed.length > 0 && (
          <section className="space-y-2" data-testid="bottles-closed">
            <h2 className="sq-section-label">Закриті за добу</h2>
            <ul className="rounded-card bg-white shadow-card divide-y divide-sq-divider">
              {state.closed.map((b) => {
                const diff = discrepancyText(b.discrepancy_ml);
                return (
                  <li key={b.id} className="px-5 py-3" data-testid={`bottle-closed-${b.id}`}>
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px]">
                      <span className="font-semibold">{b.product_name}</span>
                      <span className="text-sq-muted text-[13px] tabular-nums">
                        {timeText(b.closed_at)} · {closeReasonText(b)}
                        {diff ? ` · ${diff}` : ''}
                      </span>
                    </p>
                    <p className="text-[13px] text-sq-muted tabular-nums">Марка {b.label}</p>
                    {b.close_reason === 'empty' &&
                      b.discrepancy_ml == null &&
                      (leftover?.id === b.id ? (
                        <form
                          className="mt-2 flex flex-wrap gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveLeftover();
                          }}
                        >
                          <input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            aria-label="Скільки мл залишилось у пляшці"
                            placeholder="мл"
                            className="sq-input w-28 tabular-nums"
                            value={leftover.text}
                            autoFocus
                            onChange={(e) => setLeftover({ id: b.id, text: e.target.value })}
                            data-testid={`bottle-leftover-input-${b.id}`}
                          />
                          <button type="submit" className={primaryClass} disabled={busy}>
                            Записати
                          </button>
                          <button type="button" className={quietClass} onClick={() => setLeftover(null)}>
                            Скасувати
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="mt-1 text-[14px] font-semibold text-sq-blue"
                          onClick={() => setLeftover({ id: b.id, text: '' })}
                          data-testid={`bottle-leftover-${b.id}`}
                        >
                          У пляшці ще щось лишилось
                        </button>
                      ))}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {admin && role === 'owner' && <BottleReportCard />}
      </div>

      {opening && (
        <ExciseStampSheet
          lines={[
            {
              uid: 'open',
              product_name: `${opening.replace ? 'Замінити пляшку' : 'Нова пляшка'}: ${opening.product_name}`,
              quantity: 1,
              excise_per_unit: true,
              excise_labels: opening.labels,
            },
          ]}
          error={
            openError ??
            (opening.replace
              ? 'Попередню пляшку буде закрито, а те, що за лічильником у ній лишалось, — списано як розбіжність'
              : null)
          }
          onSetLabels={(_uid, labels) => setOpening({ ...opening, labels })}
          onClose={() => setOpening(null)}
          onDone={() => void submitOpening()}
          doneLabel={opening.replace ? 'Замінити пляшку' : 'Відкрити пляшку'}
          busy={busy}
        />
      )}

      {broken && (
        <ConfirmSheet
          title="Пляшка розбилась?"
          message={`«${broken.product_name}» закриється, а ${mlText(
            broken.capacity_ml - broken.poured_ml
          )}, що за лічильником у ній лишались, буде списано як пошкоджене.`}
          confirmLabel="Так, списати"
          tone="danger"
          onConfirm={() => void confirmBroken()}
          onCancel={() => setBroken(null)}
        />
      )}
    </div>
  );
}

/** The owner's report: bottles closed in a period, and what the discrepancies came to per drink. */
function BottleReportCard() {
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [report, setReport] = useState<BottleReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReport(await bottleReport(from, to));
      setError(null);
    } catch (err) {
      setError(refusalText(err, 'Не вдалося побудувати звіт'));
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-2" data-testid="bottles-report">
      <h2 className="sq-section-label">Розбіжності за період</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px] text-sq-secondary">
          Від
          <input type="date" className="sq-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-sq-secondary">
          До
          <input type="date" className="sq-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {error && <p className="text-[15px] text-red-700">{error}</p>}
      {report && report.totals.length === 0 && (
        <p className="text-[15px] text-sq-secondary">За цей період жодна пляшка не закрилась.</p>
      )}
      {report && report.totals.length > 0 && (
        <table className="w-full rounded-card bg-white shadow-card text-[15px]">
          <thead>
            <tr className="text-left text-[13px] text-sq-muted">
              <th className="px-4 py-2 font-medium">Напій</th>
              <th className="px-4 py-2 font-medium text-right">Пляшок</th>
              <th className="px-4 py-2 font-medium text-right">Списано</th>
              <th className="px-4 py-2 font-medium text-right">Лишалось</th>
            </tr>
          </thead>
          <tbody>
            {report.totals.map((t) => (
              <tr key={t.variant_id} className="border-t border-sq-divider" data-testid={`bottles-report-${t.variant_id}`}>
                <td className="px-4 py-2">{t.product_name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{t.bottles}</td>
                <td className="px-4 py-2 text-right tabular-nums">{t.missing_ml ? mlText(t.missing_ml) : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{t.left_ml ? mlText(t.left_ml) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[13px] text-sq-muted">
        «Списано» — пляшка скінчилась раніше, ніж за лічильником, або розбилась: ці мл списано зі складу. «Лишалось» —
        у пляшці, яку лічильник закрив як порожню, ще щось було; склад не рухається.
      </p>
    </section>
  );
}

export default BottlesPage;
