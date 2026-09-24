// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Folder } from '../../platform/glyphs';
import { resolveTagColorHex } from '../../lib/tagColors';

interface Props {
  name: string;
  color?: string | null;
  onClick: () => void;
}

/**
 * A tag folder as a card of the same shape as a product tile: the tag's own
 * colour fills the picture area with a folder glyph, the name sits under it.
 */
export function TagFolderTile({ name, color, onClick }: Props) {
  const bg = resolveTagColorHex(color);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface ring-1 ring-sq-divider hover:ring-sq-muted/50 transition-shadow"
    >
      <span className="relative w-full aspect-[4/3] grid place-items-center" style={{ backgroundColor: bg }}>
        <Folder size={40} className="text-white/95" />
      </span>
      <span className="px-3 pt-2 pb-2.5 text-[14px] font-semibold leading-tight line-clamp-2 text-sq-text">
        {name}
        <span className="block text-[14px] font-normal text-sq-secondary">Папка</span>
      </span>
    </button>
  );
}
