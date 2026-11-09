// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { CSSProperties } from 'react';
import { PLACE_PALETTE, opens, textOn, type Celebration } from './menuWall';

const PIECES = 30;

/** A deterministic «random» from the celebration's key — the confetti differs per open but holds still between renders. */
function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * The celebration of a new open (Д10): the screen fills with the place's
 * colour, rings leave the centre «as from a QR», confetti flies; the place's
 * name, the table, «+1», how many today and the place's rank.
 */
export function WallCelebration({ celebration: c }: { celebration: Celebration }) {
  const rnd = seeded(c.key);
  const palette = [c.color, ...PLACE_PALETTE, '#ffffff'];
  const pieces = Array.from({ length: PIECES }, (_, i) => {
    const angle = rnd() * Math.PI * 2;
    const dist = 28 + rnd() * 34;
    return {
      i,
      style: {
        '--dx': `${Math.cos(angle) * dist}vw`,
        '--dy': `${Math.sin(angle) * dist}vh`,
        '--rot': `${Math.round(rnd() * 720 - 360)}deg`,
        '--delay': `${Math.round(rnd() * 350)}ms`,
        '--size': `${0.45 + rnd() * 0.7}em`,
        background: palette[Math.floor(rnd() * palette.length)],
        borderRadius: rnd() > 0.5 ? '50%' : '0.15em',
      } as CSSProperties,
    };
  });
  const fg = textOn(c.color);
  const special = c.kind === 'first' || c.kind === 'milestone' || c.kind === 'record';
  return (
    <div
      className={`mw-cele mw-cele--${c.kind}`}
      style={{ '--c': c.color, '--fg': fg } as CSSProperties}
      role="status"
      aria-live="assertive"
      aria-label={`${c.headline}: ${c.name}`}
    >
      <div className="mw-cele-bg" aria-hidden="true" />
      <div className="mw-cele-rings" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="mw-cele-confetti" aria-hidden="true">
        {pieces.map((p) => (
          <span key={p.i} style={p.style} />
        ))}
      </div>
      <div className="mw-cele-body">
        <p className={`mw-cele-headline${special ? ' mw-cele-headline--special' : ''}`}>{c.headline}</p>
        <h2 className="mw-cele-name">{c.name}</h2>
        {c.where && <p className="mw-cele-where">{c.where}</p>}
        <div className="mw-cele-plus" aria-hidden="true">
          +{c.added}
        </div>
        <p className="mw-cele-meta">
          {c.storeId != null ? (
            <>
              сьогодні вже <b>{c.storeToday}</b> {opens(c.storeToday)}
              {c.rank > 0 && <> · №{c.rank} серед закладів</>} · усього {c.totalAfter}
            </>
          ) : (
            <>
              усього сьогодні <b>{c.totalAfter}</b>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
