// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { superApi, superErrorText, type MenuScansSummary } from './superApi';
import { formatWhen } from './leadLabels';
import { wallUrl } from './wall/menuWall';

/**
 * «QR-меню» — how often guests open the places' menus (TechDocs/POS_MENU_WALL.md):
 * today / 7 days / 30 days / all time per place, and the button that opens the
 * office television's widget. The widget's address carries a read-only key, so
 * the screen never logs in; the key itself is not printed on this page.
 */
export function MenuScansPage() {
  const [summary, setSummary] = useState<MenuScansSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wallKey, setWallKey] = useState<string | null>(null);
  const [wallError, setWallError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await superApi.menuScans());
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    superApi
      .menuWallKey()
      .then(setWallKey)
      .catch((err) => setWallError(superErrorText(err)));
  }, [load]);

  const link = wallKey ? wallUrl(window.location.origin, wallKey) : null;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Скопіюйте посилання', link);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-sq-secondary">
          Кожне відкриття сторінки меню чи страви за QR або посиланням — одне відкриття; прев&apos;ю месенджерів і
          роботи не рахуються. Доба — київська.
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

      <section
        aria-label="Віджет на телевізор"
        className="rounded-card border border-sq-divider bg-[#0f1420] p-5 text-white shadow-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">📺 Віджет на телевізор</h2>
            <p className="max-w-xl text-sm text-white/70">
              Сьогоднішні відкриття QR-меню наживо: усього й по годинах, заклади за популярністю, план залів кожного
              ресторану зі сканами столів — і святкування кожного нового відкриття. Відкрийте на телевізорі й натисніть
              «Почати».
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {link ? (
              <>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-[38px] items-center rounded-full bg-gradient-to-r from-[#00aff5] to-[#2a78d6] px-5 text-sm font-semibold text-white"
                >
                  Відкрити віджет
                </a>
                <button
                  type="button"
                  className="inline-flex min-h-[38px] items-center rounded-full border border-white/20 px-4 text-sm text-white/85"
                  onClick={() => void copyLink()}
                >
                  {copied ? 'Скопійовано' : 'Скопіювати посилання'}
                </button>
              </>
            ) : (
              <span className="text-sm text-white/70">{wallError ?? 'Отримуємо ключ…'}</span>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-white/50">
          Посилання несе ключ лише на читання лічильників (назви закладів і столів теж видно) — не публікуйте його.
          Зміна <code>POS_SUPER_PASSWORD</code> відкликає ключ: тоді відкрийте віджет звідси ще раз.
        </p>
      </section>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tile label="Сьогодні" value={summary.today} />
          <Tile label="За 7 днів" value={summary.last7d} />
          <Tile label="За 30 днів" value={summary.last30d} />
          <Tile label="Усього" value={summary.total} />
          <Tile label="Сканів столів сьогодні" value={summary.table_today} />
        </div>
      )}

      <div className="overflow-x-auto rounded-sq border border-sq-divider bg-sq-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs uppercase text-sq-secondary">
            <tr>
              <th className="px-3 py-2">Заклад</th>
              <th className="px-3 py-2">Меню</th>
              <th className="px-3 py-2 text-right">Сьогодні</th>
              <th className="px-3 py-2 text-right">7 днів</th>
              <th className="px-3 py-2 text-right">30 днів</th>
              <th className="px-3 py-2 text-right">Усього</th>
              <th className="px-3 py-2 text-right">Столи сьогодні</th>
              <th className="px-3 py-2">Останнє відкриття</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sq-divider">
            {summary?.stores.map((s) => (
              <tr key={s.id} className={s.today === 0 ? 'text-sq-secondary' : 'text-sq-text'}>
                <td className="px-3 py-2">
                  <div className="font-medium text-sq-text">{s.name}</div>
                  <div className="text-xs text-sq-secondary">
                    {s.slug} · #{s.id}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">{s.menu_enabled ? 'опубліковано' : 'вимкнено'}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{s.today}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.last7d}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.last30d}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.total}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {s.tables_total > 0 ? `${s.table_today} · столів ${s.tables_total}` : s.table_today}
                </td>
                <td className="px-3 py-2 text-xs">{s.last_at ? formatWhen(s.last_at) : '—'}</td>
              </tr>
            ))}
            {summary && summary.stores.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-sq-secondary">
                  Жоден заклад ще не опублікував QR-меню.
                </td>
              </tr>
            )}
            {!summary && !error && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-sq-secondary">
                  Завантаження…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sq border border-sq-divider bg-sq-surface px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-sq-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-sq-text">{value}</p>
    </div>
  );
}
