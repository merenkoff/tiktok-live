// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useDragScroll } from '../../hooks/useDragScroll';
import type { PosTag } from '../../types';

/**
 * The horizontal strip of catalog tags above the product grid: «Усі товари»,
 * the tags an owner pinned to it, and a back step when the cashier has walked
 * into a folder. Drag-scrollable, because on a till it is a finger.
 */
export function CatalogTagBar({
  tags,
  activeId,
  showBack,
  backLabel,
  onSelect,
  onBack,
}: {
  tags: PosTag[];
  activeId: number | 'all' | null;
  showBack: boolean;
  backLabel: string;
  onSelect: (tag: PosTag | null) => void;
  onBack: () => void;
}) {
  const ref = useDragScroll<HTMLDivElement>();
  const chip = (active: boolean) =>
    `shrink-0 px-3 py-2 text-sm whitespace-nowrap border-b-2 ${
      active
        ? 'font-semibold text-sq-text border-sq-text'
        : 'font-medium text-sq-secondary border-transparent'
    }`;

  return (
    <div ref={ref} className="flex items-stretch gap-0 overflow-x-auto -mx-1 px-1 select-none">
      {showBack && (
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 px-3 py-2 text-sm font-medium text-sq-blue whitespace-nowrap"
        >
          ‹ {backLabel}
        </button>
      )}
      <button type="button" onClick={() => onSelect(null)} className={chip(activeId === 'all')}>
        Усі товари
      </button>
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => onSelect(tag)}
          className={chip(activeId === tag.id)}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
