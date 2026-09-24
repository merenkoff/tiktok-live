// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import {
  DEFAULT_TAG_COLOR,
  TAG_COLOR_KEYS,
  TAG_COLORS,
  type TagColorKey,
  isTagColorKey,
} from '@pos/platform';

interface Props {
  value: string | null;
  onChange: (color: TagColorKey) => void;
  size?: 'sm' | 'md';
}

export function TagColorSwatches({ value, onChange, size = 'md' }: Props) {
  const selected = isTagColorKey(value) ? value : DEFAULT_TAG_COLOR;
  const dim = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7';

  return (
    <div className="flex flex-wrap gap-2" role="listbox" aria-label="Колір мітки">
      {TAG_COLOR_KEYS.map((key) => {
        const active = selected === key;
        return (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected={active}
            title={key}
            onClick={() => onChange(key)}
            className={`${dim} rounded-full shrink-0 transition-shadow ${
              active ? 'ring-2 ring-sq-blue ring-offset-2' : 'ring-1 ring-inset ring-black/10'
            }`}
            style={{ backgroundColor: TAG_COLORS[key] }}
          />
        );
      })}
    </div>
  );
}
