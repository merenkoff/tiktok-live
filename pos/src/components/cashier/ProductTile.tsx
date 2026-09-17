// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { formatUah } from '../../lib/money';
import { assetUrl } from '../../lib/urls';
import { useState } from 'react';

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
}: Props) {
  const [broken, setBroken] = useState(false);
  const src = !broken ? assetUrl(imageUrl) : null;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`aspect-square rounded-sq overflow-hidden relative text-left bg-sq-empty hover:brightness-[0.97] transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed ${
        count ? 'ring-2 ring-sq-blue' : ''
      }`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none">
          {subtitle || ' '}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />

      <div className="absolute bottom-2 left-2 right-2 text-white pointer-events-none">
        <p className="text-[12px] leading-tight font-medium line-clamp-2 drop-shadow-sm">{name}</p>
        {priceCents != null && (
          <p className="text-[12px] mt-0.5 opacity-95 drop-shadow-sm">{formatUah(priceCents)}</p>
        )}
      </div>

      {count != null && count > 0 && (
        <span
          className="absolute top-2 left-2 min-w-7 h-7 px-1.5 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-semibold tabular-nums shadow-sm pointer-events-none"
          data-testid="tile-count"
        >
          {count}
        </span>
      )}

      {stock != null && stock <= 0 && (
        <span className="absolute top-2 right-2 text-[10px] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded-sq pointer-events-none">
          немає
        </span>
      )}
    </button>
  );
}
