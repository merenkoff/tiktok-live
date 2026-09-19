// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@pos/platform';
import type { ModifierGroup, Product } from '@pos/platform';
import { ModifierEditor } from '../components/ModifierEditor';
import { errorText } from '../components/modifierInput';
import { componentOptions } from '../components/componentOptions';

const fieldClass =
  'w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm ' +
  'text-sq-text placeholder:text-sq-muted focus:outline-none focus:border-sq-blue';

function rangeText(group: ModifierGroup): string {
  if (group.min_select >= 1 && group.max_select === 1) return 'обовʼязково · одна відповідь';
  if (group.min_select >= 1) return `обовʼязково · від ${group.min_select} до ${group.max_select}`;
  if (group.max_select === 1) return 'за бажанням · одна відповідь';
  return `за бажанням · до ${group.max_select}`;
}

interface GroupDraft {
  name: string;
  min: string;
  max: string;
}

/**
 * The owner's modifiers: every question the till may ask about a product
 * («Молоко?», «Сироп?») and the answers it takes (TechDocs/POS_CAFE.md §3–§4,
 * POS_VERTICALS.md §7k).
 *
 * Host code in the `products` module rather than café code: a bakery will ask
 * «нарізати?» one day, and the question a product asks belongs next to the
 * product. Which products ask which questions is set in the product card, in
 * order — this page only owns the questions themselves.
 */
export function ModifiersPage() {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GroupDraft>({ name: '', min: '1', max: '1' });
  const [editing, setEditing] = useState<{ id: number; draft: GroupDraft } | null>(null);

  // Any variant of the store may be what an answer takes off the shelf — a
  // portion of syrup that is itself a recipe included, so no depth cap here.
  const options = useMemo(() => componentOptions(products, { maxDepth: 99 }), [products]);

  async function reload() {
    const [glist, plist] = await Promise.all([api.listModifierGroups(), api.getProducts()]);
    setGroups(glist);
    setProducts(plist);
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити'));
  }, []);

  function replaceGroup(next: ModifierGroup) {
    setGroups((prev) => prev.map((g) => (g.id === next.id ? next : g)));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.createModifierGroup({
        name: draft.name.trim(),
        min_select: Number(draft.min) || 0,
        max_select: Number(draft.max) || 1,
      });
      setGroups((prev) => [...prev, created]);
      setDraft({ name: '', min: '1', max: '1' });
    } catch (err) {
      setError(errorText(err, 'Не вдалося створити групу'));
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      replaceGroup(
        await api.updateModifierGroup(editing.id, {
          name: editing.draft.name.trim(),
          min_select: Number(editing.draft.min) || 0,
          max_select: Number(editing.draft.max) || 1,
        })
      );
      setEditing(null);
    } catch (err) {
      setError(errorText(err, 'Не вдалося зберегти групу'));
    }
  }

  async function toggleActive(group: ModifierGroup) {
    setError(null);
    try {
      replaceGroup(await api.updateModifierGroup(group.id, { is_active: !group.is_active }));
    } catch (err) {
      setError(errorText(err, 'Не вдалося змінити групу'));
    }
  }

  async function remove(group: ModifierGroup) {
    if (!confirm(`Видалити групу «${group.name}»? Товари перестануть її питати.`)) return;
    setError(null);
    try {
      await api.deleteModifierGroup(group.id);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
    } catch (err) {
      setError(errorText(err, 'Не вдалося видалити групу'));
    }
  }

  return (
    <div className="space-y-6 animate-fade-up text-sq-text">
      <div>
        <h2 className="text-2xl font-semibold">Модифікатори</h2>
        <p className="text-sq-secondary mt-1 text-sm">
          Питання, які каса ставить про товар, і відповіді на них. Ціна відповіді додається
          до ціни картки; відповідь може списувати інгредієнт. Які товари що питають —
          у <Link to="/admin/products" className="text-sq-blue">картці товару</Link>.
        </p>
      </div>

      {error && (
        <div className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm" data-testid="modifiers-error">
          {error}
        </div>
      )}

      <form
        onSubmit={onCreate}
        className="bg-sq-surface border border-sq-divider rounded-sq p-5 grid sm:grid-cols-[1fr_110px_110px_auto] gap-3 items-end shadow-sm"
      >
        <label className="text-xs text-sq-secondary">
          Питання
          <input
            className={fieldClass}
            placeholder="Молоко"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            data-testid="group-form-name"
          />
        </label>
        <label className="text-xs text-sq-secondary">
          Щонайменше
          <input
            className={fieldClass}
            type="number"
            min={0}
            max={50}
            value={draft.min}
            onChange={(e) => setDraft({ ...draft, min: e.target.value })}
            data-testid="group-form-min"
          />
        </label>
        <label className="text-xs text-sq-secondary">
          Щонайбільше
          <input
            className={fieldClass}
            type="number"
            min={1}
            max={50}
            value={draft.max}
            onChange={(e) => setDraft({ ...draft, max: e.target.value })}
            data-testid="group-form-max"
          />
        </label>
        <button type="submit" className="sq-btn-primary px-4 py-2.5" data-testid="group-form-submit">
          Додати групу
        </button>
        <p className="sm:col-span-4 text-[11px] text-sq-secondary">
          «Щонайменше 1» робить питання обовʼязковим — тоді одну відповідь позначте «за
          умовчанням», щоб «як завжди» лишалось одним тапом. «Щонайбільше» — скільки
          відповідей можна обрати разом.
        </p>
      </form>

      {groups.length === 0 && (
        <p className="text-sm text-sq-muted">Поки жодного питання.</p>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <section
            key={group.id}
            className="bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm"
            data-testid={`group-card-${group.id}`}
          >
            {editing?.id === group.id ? (
              <form onSubmit={onSaveEdit} className="grid sm:grid-cols-[1fr_110px_110px_auto_auto] gap-3 items-end">
                <label className="text-xs text-sq-secondary">
                  Питання
                  <input
                    className={fieldClass}
                    value={editing.draft.name}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })}
                    required
                  />
                </label>
                <label className="text-xs text-sq-secondary">
                  Щонайменше
                  <input
                    className={fieldClass}
                    type="number"
                    min={0}
                    max={50}
                    value={editing.draft.min}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, min: e.target.value } })}
                  />
                </label>
                <label className="text-xs text-sq-secondary">
                  Щонайбільше
                  <input
                    className={fieldClass}
                    type="number"
                    min={1}
                    max={50}
                    value={editing.draft.max}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, max: e.target.value } })}
                  />
                </label>
                <button type="submit" className="sq-btn-primary px-3 py-2">
                  Зберегти
                </button>
                <button type="button" className="text-sm text-sq-secondary" onClick={() => setEditing(null)}>
                  Скасувати
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold text-sq-text">{group.name}</h3>
                <span className="text-sm text-sq-secondary">{rangeText(group)}</span>
                {!group.is_active && <span className="text-xs text-sq-muted">вимкнено</span>}
                <span className="ml-auto flex gap-3 text-sm">
                  <label className="inline-flex items-center gap-1.5 text-sq-text">
                    <input
                      type="checkbox"
                      checked={group.is_active}
                      onChange={() => void toggleActive(group)}
                      data-testid={`group-active-${group.id}`}
                    />
                    активна
                  </label>
                  <button
                    type="button"
                    className="text-sq-blue"
                    onClick={() =>
                      setEditing({
                        id: group.id,
                        draft: {
                          name: group.name,
                          min: String(group.min_select),
                          max: String(group.max_select),
                        },
                      })
                    }
                  >
                    Змінити
                  </button>
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => void remove(group)}
                    data-testid={`group-delete-${group.id}`}
                  >
                    Видалити
                  </button>
                </span>
              </div>
            )}

            <ModifierEditor
              group={group}
              options={options}
              onChanged={replaceGroup}
              onError={setError}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
