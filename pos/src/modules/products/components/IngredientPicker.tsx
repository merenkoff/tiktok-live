// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useState, type KeyboardEvent } from 'react';
import { Search, X } from '@pos/platform/ui';
import type { ComponentOption } from './componentOptions';
import { panelFieldClass } from './formStyles';
import { matchesWords, queryWords } from '../lib/modifierWords';

/** How many matches are listed; the box narrows the rest. */
const SHOWN = 6;

/**
 * What an answer takes off the shelf, found by typing.
 *
 * It replaces a native `<select>` of every variant in the store — four hundred
 * lines in a restaurant, scrolled by hand to reach «Молоко вівсяне». The list
 * is drawn in the flow under the box rather than floated over it: the editor
 * lives in a scrolling dialog, and a floating list is cut off by its edge.
 */
export function IngredientPicker({
  options,
  value,
  onChange,
  testId,
}: {
  options: ComponentOption[];
  value: number | null;
  onChange: (variantId: number | null) => void;
  testId?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);

  const chosen = useMemo(
    () => (value == null ? null : (options.find((o) => o.variant_id === value) ?? null)),
    [options, value]
  );
  const matches = useMemo(() => {
    const words = queryWords(query);
    return options.filter((o) => matchesWords(o.caption, words));
  }, [options, query]);
  const shown = matches.slice(0, SHOWN);

  function pick(option: ComponentOption) {
    onChange(option.variant_id);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(shown.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      // Never the dialog's submit: Enter here chooses the highlighted line.
      e.preventDefault();
      if (shown[cursor]) pick(shown[cursor]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  if (value != null) {
    return (
      <div className="flex items-center gap-2 min-h-11" data-testid={testId}>
        <span className="min-w-0 truncate text-[15px] text-sq-text">
          {chosen ? chosen.caption : 'Складник, якого вже немає в каталозі'}
        </span>
        <button
          type="button"
          className="shrink-0 w-8 h-8 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty"
          aria-label="Прибрати списання"
          onClick={() => onChange(null)}
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div data-testid={testId}>
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none" />
        <input
          className={`${panelFieldClass} !pl-9`}
          placeholder="Що списати: молоко, сироп…"
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-label="Що списати зі складу"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <ul className="mt-1 rounded-[10px] bg-sq-surface ring-1 ring-inset ring-sq-divider overflow-hidden" role="listbox">
          {shown.map((option, index) => (
            <li key={option.variant_id}>
              <button
                type="button"
                role="option"
                aria-selected={index === cursor}
                className={`w-full min-h-10 px-3 flex items-center justify-between gap-3 text-left text-[15px] ${
                  index === cursor ? 'bg-sq-blue/[0.08]' : 'hover:bg-sq-sidebar'
                }`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => pick(option)}
              >
                <span className="min-w-0 truncate text-sq-text">{option.caption}</span>
                <span className="shrink-0 text-[13px] text-sq-muted">{option.unit}</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-3 py-2.5 text-[15px] text-sq-muted">Нічого не знайдено — перевірте назву в «Товарах»</li>
          )}
          {matches.length > SHOWN && (
            <li className="px-3 py-2 text-[13px] text-sq-muted">
              Ще {matches.length - SHOWN} — уточніть назву
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
