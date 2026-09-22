// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Choosing a dish to put on a bill (phase К4f).
//
// A search box and a list, not the sell screen's tile grid. The design doc
// §3.2 drew the catalog slot here, from the days when tables were to live
// inside `vertical-cafe`; they are their own module now (§4.11), and a module
// cannot render another module's slot — the host resolves that one for the
// `/register` frame alone. It turns out to be the better screen anyway: the
// waiter is standing at the table with a guest talking, and what they need is
// to find «борщ» in one word rather than to browse a wall of tiles.
//
// The tap rule IS the café's, borrowed whole rather than reinvented: a tap
// rings the dish «як завжди» with every required answer at its default, and
// asks first only when it has to — a size to pick, or a required question
// with no default. The sheet that asks is the host's `ModifierSheet`, so the
// wording, the arithmetic and the server's refusals stay in one place.
//
// A dish the kitchen has stopped for the day is greyed rather than dropped:
// the guest asked for it, and «сьогодні не робимо» is an answer the waiter
// has to give out loud, not a row that silently is not there.

import { useEffect, useMemo, useState } from 'react';
import { defaultModifierIds, formatUah, groupsOf, needsModifierSheet } from '@pos/platform';
import type { CatalogItem } from '@pos/platform';
import { ModifierSheet } from '@pos/platform/ui';
import { searchMenu } from '../lib/hostPlatform';
import { groupMenu, menuSubtitle } from '../lib/menu';
import type { MenuProduct } from '../lib/menu';
import { serverMessage } from '../lib/useHallMap';

/** What the picker hands back — the same shape the café's tap rule produces. */
export interface DishChoice {
  item: CatalogItem;
  modifiers: number[];
  note: string;
}

export interface DishPickerProps {
  onPick: (choice: DishChoice) => void;
  onClose: () => void;
  busy?: boolean;
  /** «Розмір» in a café — what the sheet calls its variant row. */
  variantLabel?: string;
  /** How many lines the draft holds, shown on the way out. */
  draftCount?: number;
}

export function DishPicker({
  onPick,
  onClose,
  busy,
  variantLabel = 'Розмір',
  draftCount = 0,
}: DishPickerProps): JSX.Element {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<MenuProduct | null>(null);

  useEffect(() => {
    let alive = true;
    // A short debounce: a waiter types with one thumb, and a request per
    // keystroke would put the tablet's radio in the way of the search.
    const id = setTimeout(() => {
      setLoading(true);
      searchMenu(q)
        .then((rows) => {
          if (alive) {
            setItems(rows);
            setError(null);
          }
        })
        .catch((err) => {
          if (alive) setError(serverMessage(err, 'Не вдалося прочитати меню'));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q]);

  const rows = useMemo(() => groupMenu(items).slice(0, 60), [items]);

  /** The café's tap rule, verbatim: ring it, or ask first when it has to. */
  function ring(row: MenuProduct): void {
    const groups = groupsOf(row.variants);
    if (needsModifierSheet(row.variants, groups)) {
      setSheet(row);
      return;
    }
    // The defaults travel explicitly — the server never applies `is_default`,
    // and a bill line that arrives without them is refused by name.
    onPick({ item: row.variants[0], modifiers: defaultModifierIds(groups), note: '' });
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-sq-bg" data-testid="dish-picker">
      <div className="flex items-center gap-2 border-b border-sq-divider p-3">
        <input
          className="sq-field flex-1"
          data-testid="dish-search"
          placeholder="Що додати?"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
        />
        {/*
          The picker stays open after a dish is chosen: a table orders «два
          лате і чізкейк», and closing after each one would cost a tap per
          dish. What it must not do is hide what has been taken, so the way
          out carries the count — «Готово · 3».
        */}
        <button type="button" className="sq-btn-primary" onClick={onClose} data-testid="dish-close">
          Готово{draftCount > 0 ? ` · ${draftCount}` : ''}
        </button>
      </div>

      {error && <p className="p-3 text-sm">{error}</p>}
      {!error && loading && rows.length === 0 && (
        <p className="p-6 text-center text-sm text-sq-muted">Шукаємо…</p>
      )}
      {!error && !loading && rows.length === 0 && (
        <p className="p-6 text-center text-sm text-sq-muted">Нічого не знайшли</p>
      )}

      <div className="flex-1 overflow-auto">
        {rows.map((row) => {
          const subtitle = menuSubtitle(row);
          return (
            <button
              key={row.product_id}
              type="button"
              data-testid={`dish-${row.product_id}`}
              disabled={busy || row.stopped}
              onClick={() => ring(row)}
              className="flex w-full items-center justify-between gap-3 border-b border-sq-divider p-3 text-left disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate">{row.name}</span>
                {subtitle && <span className="block text-xs text-sq-muted">{subtitle}</span>}
              </span>
              <span className="shrink-0 tabular-nums">
                {row.variants.length > 1 ? 'від ' : ''}
                {formatUah(row.from_cents)}
              </span>
            </button>
          );
        })}
      </div>

      {sheet && (
        <ModifierSheet
          productName={sheet.name}
          variants={sheet.variants}
          variantLabel={variantLabel}
          initialVariantId={sheet.variants.length === 1 ? sheet.variants[0].variant_id : null}
          initialModifierIds={defaultModifierIds(groupsOf(sheet.variants))}
          onAdd={({ item, modifiers, note }) => {
            onPick({ item, modifiers, note });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
