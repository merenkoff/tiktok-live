// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useMemo, useState } from 'react';
import { api, formatUah } from '@pos/platform';
import type { Modifier, ModifierGroup, ModifierInput } from '@pos/platform';
import type { ComponentOption } from './componentOptions';
import { errorText, signedUahInputToCents } from './modifierInput';

// White wells on the grey add-answer panel: the grey one would vanish into it.
const fieldClass = 'sq-input !bg-sq-surface';
const captionClass = 'text-[13px] font-semibold text-sq-secondary';

function deltaText(cents: number): string {
  if (cents > 0) return `+${formatUah(cents)}`;
  if (cents < 0) return `−${formatUah(-cents)}`;
  return 'без доплати';
}

interface Draft {
  name: string;
  delta: string;
  isDefault: boolean;
  componentId: number | '';
  componentQty: string;
}

const EMPTY: Draft = { name: '', delta: '0', isDefault: false, componentId: '', componentQty: '1' };

function draftOf(m: Modifier): Draft {
  return {
    name: m.name,
    delta: String(m.price_delta_cents / 100),
    isDefault: m.is_default,
    componentId: m.component_variant_id ?? '',
    componentQty: String(m.component_quantity ?? 1),
  };
}

/**
 * The answers of one question — «звичайне», «вівсяне +15», «половина −20».
 *
 * Every answer is one row: what it is called, what it does to the price
 * (signed — a smaller portion is a discount), whether the till pre-selects it,
 * and, optionally, what it takes off the shelf. The server answers every
 * write with the whole group, which is what `onChanged` hands back.
 */
export function ModifierEditor({
  group,
  options,
  onChanged,
  onError,
}: {
  group: ModifierGroup;
  /** Every variant of the store, a recipe included — the server allows any. */
  options: ComponentOption[];
  onChanged: (group: ModifierGroup) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const byVariant = useMemo(
    () => new Map(options.map((option) => [option.variant_id, option])),
    [options]
  );
  const component = draft.componentId === '' ? null : byVariant.get(Number(draft.componentId));

  function toInput(d: Draft): ModifierInput {
    const withComponent = d.componentId !== '';
    return {
      name: d.name.trim(),
      price_delta_cents: signedUahInputToCents(d.delta),
      is_default: d.isDefault,
      component_variant_id: withComponent ? Number(d.componentId) : null,
      component_quantity: withComponent ? Number(d.componentQty) || 1 : null,
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const next =
        editingId == null
          ? await api.createModifier(group.id, toInput(draft))
          : await api.updateModifier(editingId, toInput(draft));
      onChanged(next);
      setDraft(EMPTY);
      setEditingId(null);
    } catch (err) {
      onError(errorText(err, 'Не вдалося зберегти відповідь'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleDefault(m: Modifier) {
    try {
      onChanged(await api.updateModifier(m.id, { is_default: !m.is_default }));
    } catch (err) {
      onError(errorText(err, 'Не вдалося змінити відповідь'));
    }
  }

  async function remove(m: Modifier) {
    if (!confirm(`Прибрати відповідь «${m.name}»?`)) return;
    try {
      await api.deleteModifier(m.id);
      onChanged({ ...group, modifiers: group.modifiers.filter((x) => x.id !== m.id) });
      if (editingId === m.id) {
        setEditingId(null);
        setDraft(EMPTY);
      }
    } catch (err) {
      onError(errorText(err, 'Не вдалося прибрати відповідь'));
    }
  }

  return (
    <div className="space-y-3">
      {group.modifiers.length === 0 && (
        <p className="py-1 text-[15px] text-sq-muted">
          Ще жодної відповіді. Без відповідей питання на касі не зʼявиться.
        </p>
      )}

      <ul>
        {group.modifiers.map((m) => {
          const part = m.component_variant_id == null ? null : byVariant.get(m.component_variant_id);
          const partCaption = part
            ? part.caption
            : m.component
              ? [m.component.product_name, m.component.label].filter(Boolean).join(' · ')
              : null;
          return (
            <li
              key={m.id}
              className="sq-row min-h-12 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1"
              data-testid="modifier-row"
            >
              <span className="text-base font-medium text-sq-text">{m.name}</span>
              <span className="text-sm text-sq-secondary tabular-nums">{deltaText(m.price_delta_cents)}</span>
              {m.is_default && (
                <span className="h-[22px] px-2 rounded-md bg-sq-blue/10 text-sq-blue-press text-xs font-medium inline-flex items-center">
                  за умовчанням
                </span>
              )}
              <span className="text-[13px] text-sq-muted">
                {partCaption
                  ? `списує ${partCaption} × ${m.component_quantity} ${part?.unit ?? m.component?.unit ?? ''}`.trim()
                  : 'без списання'}
              </span>
              {!m.is_active && (
                <span className="h-[22px] px-2 rounded-md ring-1 ring-inset ring-sq-divider text-xs font-medium text-sq-secondary inline-flex items-center">
                  вимкнено
                </span>
              )}
              <span className="ml-auto flex items-center gap-1 text-[15px] font-semibold">
                <button
                  type="button"
                  className="min-h-9 px-2 rounded-lg text-sq-blue hover:bg-sq-sidebar"
                  onClick={() => void toggleDefault(m)}
                >
                  {m.is_default ? 'Не за умовчанням' : 'За умовчанням'}
                </button>
                <button
                  type="button"
                  className="min-h-9 px-2 rounded-lg text-sq-blue hover:bg-sq-sidebar"
                  onClick={() => {
                    setEditingId(m.id);
                    setDraft(draftOf(m));
                  }}
                >
                  Змінити
                </button>
                <button
                  type="button"
                  className="min-h-9 px-2 rounded-lg text-red-600 hover:bg-red-50"
                  onClick={() => void remove(m)}
                >
                  Прибрати
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <form
        onSubmit={submit}
        className="grid gap-3 sm:grid-cols-[1fr_120px_1fr_100px_auto] items-end rounded-xl bg-sq-sidebar p-3.5"
      >
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>Відповідь</span>
          <input
            className={fieldClass}
            placeholder="вівсяне"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            data-testid="modifier-form-name"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>До ціни, ₴</span>
          <input
            className={`${fieldClass} tabular-nums`}
            inputMode="decimal"
            placeholder="15 або -20"
            value={draft.delta}
            onChange={(e) => setDraft({ ...draft, delta: e.target.value })}
            data-testid="modifier-form-delta"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>Списує</span>
          <select
            className={fieldClass}
            value={draft.componentId}
            onChange={(e) =>
              setDraft({ ...draft, componentId: e.target.value === '' ? '' : Number(e.target.value) })
            }
            data-testid="modifier-form-component"
          >
            <option value="">нічого</option>
            {options.map((option) => (
              <option key={option.variant_id} value={option.variant_id}>
                {option.caption}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>Кількість{component ? `, ${component.unit}` : ''}</span>
          <input
            className={`${fieldClass} tabular-nums`}
            type="number"
            min={1}
            step={1}
            disabled={draft.componentId === ''}
            value={draft.componentQty}
            onChange={(e) => setDraft({ ...draft, componentQty: e.target.value })}
            data-testid="modifier-form-qty"
          />
        </label>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 min-h-11 text-[15px] text-sq-text whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[rgb(var(--sq-blue-rgb))]"
              checked={draft.isDefault}
              onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
              data-testid="modifier-form-default"
            />
            за умовчанням
          </label>
          <button
            type="submit"
            className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] whitespace-nowrap"
            disabled={busy}
            data-testid="modifier-form-submit"
          >
            {editingId == null ? 'Додати' : 'Зберегти'}
          </button>
          {editingId != null && (
            <button
              type="button"
              className="min-h-11 px-1 text-[15px] font-semibold text-sq-secondary"
              onClick={() => {
                setEditingId(null);
                setDraft(EMPTY);
              }}
            >
              Скасувати
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
