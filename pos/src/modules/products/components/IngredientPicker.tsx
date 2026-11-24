// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { Plus, Search, X } from '@pos/platform/ui';
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
  placeholder = 'Що списати: молоко, сироп…',
  ariaLabel = 'Що списати зі складу',
  noteOf,
  onCreate,
  inputRef,
  surface = 'panel',
}: {
  options: ComponentOption[];
  value: number | null;
  onChange: (variantId: number | null) => void;
  testId?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** What stands on the right of a line instead of the bare unit — «40 ₴/л». */
  noteOf?: (option: ComponentOption) => string;
  /**
   * «Create it»: offered under the matches whenever something is typed, so a
   * missing ingredient is made without leaving the recipe.
   */
  onCreate?: (name: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  /** Where the box sits: on a grey panel its well is white, on the white page grey. */
  surface?: 'panel' | 'page';
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  // The blur's «close a beat later» timer, cleared if the picker goes first —
  // a dialog saved and gone within those 150 ms must not set state after it.
  const blurTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
    },
    []
  );

  const chosen = useMemo(
    () => (value == null ? null : (options.find((o) => o.variant_id === value) ?? null)),
    [options, value]
  );
  const matches = useMemo(() => {
    const words = queryWords(query);
    const found = options.filter((o) => matchesWords(o.caption, words));
    // What BEGINS with the typing comes first: «картопля» is the potato, not
    // «Гарнір: картопля фрі» that merely contains it — Enter takes the top line.
    const typed = query.trim().toLocaleLowerCase('uk');
    if (typed === '') return found;
    const starts = (o: ComponentOption) => o.caption.toLocaleLowerCase('uk').startsWith(typed);
    return [...found.filter(starts), ...found.filter((o) => !starts(o))];
  }, [options, query]);
  const shown = matches.slice(0, SHOWN);

  function pick(option: ComponentOption) {
    onChange(option.variant_id);
    setQuery('');
    setOpen(false);
  }

  function create() {
    const name = query.trim();
    setQuery('');
    setOpen(false);
    onCreate?.(name);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(shown.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      // Never the dialog's submit: Enter here chooses the highlighted line —
      // or, with nothing to choose, makes the ingredient that was typed.
      e.preventDefault();
      if (shown[cursor]) pick(shown[cursor]);
      else if (onCreate && query.trim() !== '') create();
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
          ref={inputRef}
          className={surface === 'page' ? 'sq-input !pl-9' : `${panelFieldClass} !pl-9`}
          placeholder={placeholder}
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          onFocus={() => setOpen(true)}
          // Closes a beat later, so a tap on a line of the list still lands.
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150);
          }}
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
                <span className="shrink-0 text-[13px] text-sq-muted tabular-nums">
                  {noteOf ? noteOf(option) : option.unit}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && !onCreate && (
            <li className="px-3 py-2.5 text-[15px] text-sq-muted">Нічого не знайдено — перевірте назву в «Товарах»</li>
          )}
          {shown.length === 0 && onCreate && query.trim() === '' && (
            <li className="px-3 py-2.5 text-[15px] text-sq-muted">Почніть набирати назву</li>
          )}
          {matches.length > SHOWN && (
            <li className="px-3 py-2 text-[13px] text-sq-muted">
              Ще {matches.length - SHOWN} — уточніть назву
            </li>
          )}
          {onCreate && query.trim() !== '' && (
            <li className="shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
              <button
                type="button"
                className="w-full min-h-10 px-3 flex items-center gap-2 text-left text-[15px] font-semibold text-sq-blue hover:bg-sq-sidebar"
                onClick={create}
                data-testid="ingredient-create"
              >
                <Plus size={18} />
                Створити інгредієнт «{query.trim()}»
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
