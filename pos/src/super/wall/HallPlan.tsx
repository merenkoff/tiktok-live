// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { assetUrl } from '../../lib/urls';
import { packHalls } from './hallPack';
import { heat, isRecent, opens, plural, textOn, type WallStore } from './menuWall';

/** The smallest a table is drawn, in em — a one-cell stool still shows its number from across the room. */
const MIN_TABLE_EM = 2.4;
const GAP_EM = 0.7;
const LABEL_EM = 1.5;

function useBox<T extends HTMLElement>(): [React.RefObject<T>, { width: number; height: number; fontPx: number }] {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ width: 0, height: 0, fontPx: 16 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const fontPx = parseFloat(getComputedStyle(el).fontSize) || 16;
      setBox((prev) =>
        prev.width === r.width && prev.height === r.height && prev.fontPx === fontPx ? prev : { width: r.width, height: r.height, fontPx }
      );
    };
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box];
}

/** A hex colour at an alpha — how warm a table's fill is. */
function rgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * One place on the television (Д8): every live hall on the screen at once,
 * packed to fit, the tables where the owner put them, each as warm as its
 * share of today's opens. A table opened in the last two minutes pulses, the
 * day's most opened table wears a star.
 */
export function HallPlan({ store, now }: { store: WallStore; now: Date }) {
  const [ref, box] = useBox<HTMLDivElement>();
  const halls = (store.halls ?? []).filter((h) => h.tables.length > 0);
  const fontPx = box.fontPx;
  const pad = 0.9 * fontPx;
  const packing = packHalls(halls, {
    width: Math.max(0, box.width - pad * 2),
    height: Math.max(0, box.height - pad * 2),
    gap: GAP_EM * fontPx,
    label: LABEL_EM * fontPx,
  });
  const max = Math.max(0, ...halls.flatMap((h) => h.tables.map((t) => t.today)));
  const topId = max > 0 ? halls.flatMap((h) => h.tables).find((t) => t.today === max)?.id ?? null : null;
  const minPx = MIN_TABLE_EM * fontPx;
  const fg = textOn(store.color);
  const noTable = store.today - store.tableToday;

  return (
    <div className="mw-place" style={{ '--c': store.color, '--fg': fg } as CSSProperties} aria-label={`План залів: ${store.name}`}>
      <div className="mw-place-head">
        <span className="mw-ava" aria-hidden="true">
          {store.logoUrl ? <img src={assetUrl(store.logoUrl) ?? undefined} alt="" /> : store.initial}
        </span>
        <h2 className="mw-place-name">{store.name}</h2>
        <div className="mw-place-stats">
          <span>
            <b>{store.today}</b> сьогодні
          </span>
          <span>
            столів <b>{store.tablesScanned}</b> з {store.tablesTotal}
          </span>
          {noTable > 0 && (
            <span>
              без столу <b>{noTable}</b>
            </span>
          )}
        </div>
      </div>
      <div className="mw-plan" ref={ref} data-testid="hall-plan">
        {box.width > 0 &&
          packing.items.map((item) => (
            <div
              key={item.hall.id}
              className="mw-hall"
              style={{
                left: pad + item.x,
                top: pad + item.y,
                width: item.w,
                height: item.h,
                '--cell': `${packing.cell}px`,
              } as CSSProperties}
            >
              <p className="mw-hall-name">{item.hall.name}</p>
              {item.hall.tables.map((t) => {
                const cx = (t.pos_x + t.width / 2) * packing.cell;
                const cy = (t.pos_y + t.height / 2) * packing.cell;
                const w = Math.max(t.width * packing.cell, minPx);
                const h = Math.max(t.height * packing.cell, minPx);
                const warmth = heat(t.today, max);
                const recent = isRecent(t.lastAt, now);
                const warm = warmth > 0;
                return (
                  <div
                    key={t.id}
                    data-testid={`plan-table-${t.id}`}
                    data-today={t.today}
                    className={`mw-table${t.shape === 'round' ? ' mw-table--round' : ''}${warm ? ' mw-table--warm' : ' mw-table--idle'}${
                      recent ? ' mw-table--recent' : ''
                    }`}
                    style={{
                      left: cx - w / 2,
                      top: cy - h / 2,
                      width: w,
                      height: h,
                      backgroundColor: warm ? rgba(store.color, 0.18 + 0.82 * warmth) : undefined,
                      color: warmth > 0.6 ? fg : undefined,
                    }}
                    title={`Стіл ${t.name}: ${t.today} ${opens(t.today)} сьогодні`}
                  >
                    {t.id === topId && (
                      <span className="mw-table-top" aria-hidden="true">
                        ★
                      </span>
                    )}
                    <span className="mw-table-name">{t.name}</span>
                    <span className="mw-table-count">{t.today > 0 ? t.today : '·'}</span>
                  </div>
                );
              })}
            </div>
          ))}
      </div>
      <div className="mw-legend" aria-hidden="true">
        <span>менше</span>
        <span className="mw-legend-scale" />
        <span>більше {plural(max, ['відкриття', 'відкриття', 'відкриттів'])}</span>
        <span className="mw-legend-dot" />
        <span>щойно відкрили</span>
      </div>
    </div>
  );
}
