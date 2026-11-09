// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { CSSProperties } from 'react';
import type { MenuWallSnapshot } from '../superApi';
import { assetUrl } from '../../lib/urls';
import { HallPlan } from './HallPlan';
import {
  PLACE_PALETTE,
  TAB_ROTATE_MS,
  agoLabel,
  kyivClock,
  kyivHour,
  opens,
  plural,
  rankedStores,
  rankingView,
  sameTab,
  tabKey,
  textOn,
  whereLabel,
  type WallStore,
  type WallTab,
} from './menuWall';

export interface WallBoardProps {
  snapshot: MenuWallSnapshot | null;
  stores: WallStore[];
  now: Date;
  tabs: WallTab[];
  tab: WallTab;
  onTab: (t: WallTab) => void;
  /** Counts the tab changes — restarts the auto-rotation bar. */
  tabCycle: number;
  awake: boolean;
  offline: boolean;
  soundOn: boolean;
}

/**
 * The television's main screen: left — today in one number and by hour;
 * right — the tabs: «Заклади» ranked, then a floor plan per place whose
 * tables were scanned today.
 */
export function WallBoard({ snapshot, stores, now, tabs, tab, onTab, tabCycle, awake, offline, soundOn }: WallBoardProps) {
  const clock = kyivClock(now);
  const hour = kyivHour(now);
  const total = snapshot?.total ?? 0;
  const delta = snapshot ? total - snapshot.yesterdaySameTime : 0;
  const hourly = snapshot?.hourly ?? Array.from({ length: 24 }, () => 0);
  const peak = Math.max(1, ...hourly);
  const ranked = rankedStores(stores);
  const accent = ranked.find((s) => s.today > 0)?.color ?? PLACE_PALETTE[0];
  const best = snapshot?.bestDay ?? null;
  const lastStore = [...stores].filter((s) => s.lastAt).sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))[0] ?? null;
  const lastEvent = snapshot?.events.length ? snapshot.events[snapshot.events.length - 1] : null;
  const lastWhere = lastEvent && lastStore && lastEvent.storeId === lastStore.id ? whereLabel(lastEvent) : null;
  const byId = new Map(stores.map((s) => [s.id, s]));
  const place = tab.kind === 'place' ? byId.get(tab.storeId) ?? null : null;

  return (
    <div className="mw-board" style={{ '--accent': accent } as CSSProperties}>
      <header className="mw-top">
        <div className="mw-brand">
          <span className="mw-brand-name">LIVESHOP</span>
          <span className="mw-brand-sub">відкриття QR-меню</span>
        </div>
        <div className="mw-status" aria-label="Стан віджета">
          {offline && <span className="mw-chip mw-chip--warn">немає зв&apos;язку</span>}
          {awake && (
            <span className="mw-chip" title="Екран не гасне">
              ☀
            </span>
          )}
          <span className="mw-chip" title={soundOn ? 'Звук увімкнено' : 'Без звуку'}>
            {soundOn ? '♪' : '🔇'}
          </span>
        </div>
        <div className="mw-clock">
          <span className="mw-clock-time">{clock.time}</span>
          <span className="mw-clock-date">{clock.date}</span>
        </div>
      </header>

      <section className="mw-today" aria-label="Сьогодні">
        <div className="mw-stripe" aria-hidden="true">
          {PLACE_PALETTE.map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </div>
        <p className="mw-today-label">Сьогодні</p>
        <p className="mw-today-total" data-testid="wall-total">
          {total}
        </p>
        <p className="mw-today-unit">{opens(total)} меню</p>
        {snapshot && (
          <p className={`mw-today-delta${delta > 0 ? ' mw-today-delta--up' : ''}`}>
            {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '='} до вчора на цю пору
            {best && <span className="mw-muted"> · рекорд {best.count}</span>}
          </p>
        )}
        {snapshot && (
          <p className="mw-today-tables">
            зі столів <b>{snapshot.tableToday}</b> · закладів сканували{' '}
            <b>{stores.filter((s) => s.today > 0).length}</b> з {stores.length}
          </p>
        )}
        <div className="mw-hours" aria-label="Сьогодні по годинах">
          {hourly.map((v, h) => (
            <span
              key={h}
              className={`mw-hour${h === hour ? ' mw-hour--now' : ''}${h > hour ? ' mw-hour--future' : ''}`}
              style={{ height: `${Math.max(v > 0 ? 8 : 3, (v / peak) * 100)}%` }}
              title={`${String(h).padStart(2, '0')}:00 — ${v}`}
            />
          ))}
        </div>
        <div className="mw-hours-axis" aria-hidden="true">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
        {lastStore && (
          <p className="mw-last">
            <span className="mw-muted">Останнє відкриття · {agoLabel(lastStore.lastAt, now)}</span>
            <b>
              {lastStore.name}
              {lastWhere ? ` · ${lastWhere}` : ''}
            </b>
          </p>
        )}
      </section>

      <section className="mw-list" aria-label={tab.kind === 'places' ? 'Заклади' : `План залів: ${place?.name ?? ''}`}>
        <div className="mw-tabs" role="tablist">
          {tabs.map((t) => {
            const s = t.kind === 'place' ? byId.get(t.storeId) : null;
            return (
              <button
                key={tabKey(t)}
                type="button"
                role="tab"
                aria-selected={sameTab(t, tab)}
                className={`mw-tab${t.kind === 'place' ? ' mw-tab--place' : ''}`}
                style={s ? ({ '--c': s.color, '--fg': textOn(s.color) } as CSSProperties) : undefined}
                onClick={(e) => {
                  e.stopPropagation(); // a touch on a tab is not a touch for the controls
                  onTab(t);
                }}
              >
                {t.kind === 'places' ? 'Заклади' : s?.name ?? '…'}
              </button>
            );
          })}
          {tabs.length > 1 && (
            <span
              key={`${tabKey(tab)}-${tabCycle}`}
              className="mw-tabs-timer"
              style={{ animationDuration: `${TAB_ROTATE_MS}ms` }}
              aria-hidden="true"
            />
          )}
        </div>
        {place ? <HallPlan store={place} now={now} /> : <PlacesRanking stores={stores} now={now} />}
      </section>
    </div>
  );
}

function PlacesRanking({ stores, now }: { stores: WallStore[]; now: Date }) {
  const view = rankingView(stores);
  const listMax = Math.max(1, ...view.rows.map((s) => s.today));
  const active = view.rows.filter((s) => s.today > 0);
  const lastStore = [...stores].filter((s) => s.lastAt).sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))[0] ?? null;

  if (view.rows.length === 0) {
    return (
      <div className="mw-empty">
        <span className="mw-empty-qr" aria-hidden="true" />
        <p>Жоден заклад ще не опублікував QR-меню</p>
      </div>
    );
  }
  if (active.length === 0) {
    return (
      <div className="mw-empty">
        <span className="mw-empty-qr" aria-hidden="true" />
        <p>
          Сьогодні ще ніхто не відкривав меню — чекаємо на перше відкриття
          {lastStore ? (
            <>
              {' '}
              · востаннє «{lastStore.name}», {agoLabel(lastStore.lastAt, now)}
            </>
          ) : null}
        </p>
      </div>
    );
  }
  return (
    <>
      <ol className="mw-rows">
        {view.rows.map((s, i) => (
          <li
            key={s.id}
            className={`mw-row${s.today === 0 ? ' mw-row--idle' : ''}`}
            style={{ '--c': s.color, '--fg': textOn(s.color) } as CSSProperties}
            data-testid={`rank-row-${s.id}`}
          >
            <span className="mw-row-bar" style={{ width: `${(s.today / listMax) * 100}%` }} aria-hidden="true" />
            <span className="mw-row-rank">{i + 1}</span>
            <span className="mw-ava" aria-hidden="true">
              {s.logoUrl ? <img src={assetUrl(s.logoUrl) ?? undefined} alt="" /> : s.initial}
            </span>
            <span className="mw-row-main">
              <span className="mw-row-name">{s.name}</span>
              <span className="mw-row-sub">
                {s.tableToday > 0
                  ? `столів ${s.tablesScanned} з ${s.tablesTotal} · ${s.tableToday} зі столів`
                  : s.today > 0
                    ? 'без столів'
                    : s.lastAt
                      ? `востаннє ${agoLabel(s.lastAt, now)}`
                      : 'сьогодні тихо'}
              </span>
            </span>
            <span className="mw-row-value">
              <b>{s.today}</b>
              {s.lastHour > 0 && <small>+{s.lastHour} за год</small>}
            </span>
          </li>
        ))}
      </ol>
      {view.hiddenActive + view.hiddenIdle > 0 && (
        <p className="mw-rows-more">
          {view.hiddenActive > 0 && `ще ${view.hiddenActive} ${plural(view.hiddenActive, ['заклад', 'заклади', 'закладів'])} з відкриттями`}
          {view.hiddenActive > 0 && view.hiddenIdle > 0 && ' · '}
          {view.hiddenIdle > 0 && `${view.hiddenIdle} без відкриттів сьогодні`}
        </p>
      )}
    </>
  );
}
