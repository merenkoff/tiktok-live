// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { formatUah } from '../../lib/money';
// Through the barrel, NOT `../../lib/urls`: this component is re-exported by
// `@pos/platform/ui`, which every remote bundles locally — and a bundled copy
// of `lib/urls` compiles with that build's `VITE_API_BASE`, which in CI is
// empty. That shipped: the flowers module asked the POS host for
// `/demo-flowers/*.svg`, got a 404, and every tile fell back to its caption
// while the cart — host code, host copy — showed the same photos fine.
// `@pos/platform` is external in a remote, so this is always the host's.
import { assetUrl } from '@pos/platform';
import { MoreHorizontal } from '../../platform/glyphs';

interface Props {
  name: string;
  subtitle?: string;
  priceCents?: number;
  imageUrl?: string | null;
  stock?: number;
  onClick: () => void;
  disabled?: boolean;
  /**
   * How many of this are already in what is being assembled — the florist's
   * bench puts the running count on the tile itself rather than behind a tap,
   * because "did I already put a rose in?" is the question a florist asks
   * constantly while their hands are full. 0 or absent draws nothing.
   */
  count?: number;
  /**
   * A second, visible way in: the «⋯» in the tile's corner. The café uses it
   * to open the modifier sheet for a product whose tap already adds it «як
   * завжди» — the tap stays one tap, and the way to change the answer is on
   * the tile rather than behind a long-press nobody finds. Absent, the tile
   * is exactly what it was.
   */
  onMore?: () => void;
  /**
   * A word in the tile's corner that says why it is greyed when stock is not
   * the reason — «стоп» for a dish the barista pulled for the day (К3). Wins
   * over the stock-driven «немає»: the dish may well be in the case.
   */
  badge?: string;
  /** Test id of the tile button; its «⋯» gets `<testId>-more`. */
  testId?: string;
}

export function ProductTile({
  name,
  subtitle,
  priceCents,
  imageUrl,
  stock,
  onClick,
  disabled,
  count,
  onMore,
  badge,
  testId,
}: Props) {
  const [broken, setBroken] = useState(false);
  const src = !broken ? assetUrl(imageUrl) : null;

  // A Things-style card: the photo on top, the name and the price under it —
  // not over it, so neither fights the picture. Badges sit on the photo.
  const muted = disabled || !!badge || (stock != null && stock <= 0);
  const tile = (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={`w-full ${onMore ? 'h-full' : ''} flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${
        count ? 'ring-2 ring-sq-blue' : 'ring-1 ring-sq-divider hover:ring-sq-muted/50'
      }`}
    >
      <div className="relative w-full aspect-[4/3] bg-sq-empty shrink-0">
        {src ? (
          <img
            src={src}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${muted ? 'opacity-45' : ''}`}
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none">
            {subtitle || ' '}
          </div>
        )}

        {count != null && count > 0 && (
          <span
            className="absolute top-2 left-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-bold tabular-nums pointer-events-none"
            data-testid="tile-count"
          >
            {count}
          </span>
        )}

        {badge ? (
          <span
            className={`absolute ${count ? 'top-10' : 'top-2'} left-2 text-[12px] font-semibold bg-[#F4386A] text-white px-2 py-0.5 rounded-md pointer-events-none`}
            data-testid="tile-badge"
          >
            {badge}
          </span>
        ) : (
          stock != null &&
          stock <= 0 && (
            <span className={`absolute ${count ? 'top-10' : 'top-2'} left-2 text-[12px] font-semibold bg-sq-secondary text-white px-2 py-0.5 rounded-md pointer-events-none`}>
              немає
            </span>
          )
        )}
      </div>

      <div className="px-3 pt-2 pb-2.5 flex flex-col gap-0.5 min-w-0 pointer-events-none">
        <p className={`text-[14px] leading-tight font-semibold line-clamp-2 ${muted ? 'text-sq-muted' : 'text-sq-text'}`}>{name}</p>
        {priceCents != null && (
          <p className="text-[14px] text-sq-secondary tabular-nums">{formatUah(priceCents)}</p>
        )}
      </div>
    </button>
  );

  if (!onMore) return tile;

  // A sibling of the tile, not a child: a button inside a button is invalid
  // HTML, and its click would bubble into the tile and add the line as well.
  return (
    <div className="relative">
      {tile}
      {!disabled && (
        <button
          type="button"
          onClick={onMore}
          aria-label={`Змінити: ${name}`}
          className="absolute top-0.5 right-0.5 w-11 h-11 grid place-items-center"
          data-testid={testId ? `${testId}-more` : 'tile-more'}
        >
          <span className="w-8 h-8 grid place-items-center rounded-full bg-white/95 text-sq-text shadow-[0_1px_3px_rgba(0,0,0,0.15)]">
            <MoreHorizontal size={20} />
          </span>
        </button>
      )}
    </div>
  );
}
