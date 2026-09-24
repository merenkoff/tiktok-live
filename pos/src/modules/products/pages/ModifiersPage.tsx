// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@pos/platform';
import type { ModifierGroup, Product } from '@pos/platform';
import { Layers, PageHeader, Plus, SectionHead } from '@pos/platform/ui';
import { ModifierEditor } from '../components/ModifierEditor';
import { errorText } from '../components/modifierInput';
import { componentOptions } from '../components/componentOptions';

const captionClass = 'text-[13px] font-semibold text-sq-secondary';

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
    <div className="animate-fade-up text-sq-text max-w-5xl">
      <PageHeader
        glyph={Layers}
        title="Модифікатори"
        subtitle={
          <>
            Питання, які каса ставить про товар, і відповіді на них. Ціна відповіді додається
            до ціни картки; відповідь може списувати інгредієнт. Які товари що питають —
            у{' '}
            <Link to="/admin/products" className="text-sq-blue font-semibold">
              картці товару
            </Link>
            .
          </>
        }
      />

      <div className="space-y-6">
        {error && (
          <div className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" data-testid="modifiers-error">
            {error}
          </div>
        )}

        <form
          onSubmit={onCreate}
          className="rounded-card bg-sq-surface shadow-card p-5 grid sm:grid-cols-[1fr_120px_120px_auto] gap-3 items-end"
        >
          <label className="flex flex-col gap-1.5">
            <span className={captionClass}>Питання</span>
            <input
              className="sq-input"
              placeholder="Молоко"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              data-testid="group-form-name"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={captionClass}>Щонайменше</span>
            <input
              className="sq-input tabular-nums"
              type="number"
              min={0}
              max={50}
              value={draft.min}
              onChange={(e) => setDraft({ ...draft, min: e.target.value })}
              data-testid="group-form-min"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={captionClass}>Щонайбільше</span>
            <input
              className="sq-input tabular-nums"
              type="number"
              min={1}
              max={50}
              value={draft.max}
              onChange={(e) => setDraft({ ...draft, max: e.target.value })}
              data-testid="group-form-max"
            />
          </label>
          <button
            type="submit"
            className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-1.5"
            data-testid="group-form-submit"
          >
            <Plus size={20} />
            Додати групу
          </button>
          <p className="sm:col-span-4 text-[13px] text-sq-muted leading-relaxed">
            «Щонайменше 1» робить питання обовʼязковим — тоді одну відповідь позначте «за
            умовчанням», щоб «як завжди» лишалось одним тапом. «Щонайбільше» — скільки
            відповідей можна обрати разом.
          </p>
        </form>

        {groups.length === 0 && (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <Layers size={48} />
            <p className="text-[15px] text-sq-secondary">Поки жодного питання.</p>
          </div>
        )}

        {groups.map((group) => (
          <section
            key={group.id}
            className="rounded-card bg-sq-surface shadow-card p-5 space-y-3"
            data-testid={`group-card-${group.id}`}
          >
            {editing?.id === group.id ? (
              <form
                onSubmit={onSaveEdit}
                className="grid sm:grid-cols-[1fr_120px_120px_auto_auto] gap-3 items-end pb-3 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]"
              >
                <label className="flex flex-col gap-1.5">
                  <span className={captionClass}>Питання</span>
                  <input
                    className="sq-input"
                    value={editing.draft.name}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={captionClass}>Щонайменше</span>
                  <input
                    className="sq-input tabular-nums"
                    type="number"
                    min={0}
                    max={50}
                    value={editing.draft.min}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, min: e.target.value } })}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={captionClass}>Щонайбільше</span>
                  <input
                    className="sq-input tabular-nums"
                    type="number"
                    min={1}
                    max={50}
                    value={editing.draft.max}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, max: e.target.value } })}
                  />
                </label>
                <button type="submit" className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]">
                  Зберегти
                </button>
                <button
                  type="button"
                  className="min-h-11 px-1 text-[15px] font-semibold text-sq-secondary"
                  onClick={() => setEditing(null)}
                >
                  Скасувати
                </button>
              </form>
            ) : (
              <SectionHead
                title={
                  <>
                    {group.name}
                    <span className="text-[13px] font-normal text-sq-muted">{rangeText(group)}</span>
                    {!group.is_active && (
                      <span className="self-center h-[22px] px-2 rounded-md ring-1 ring-inset ring-sq-divider text-xs font-medium text-sq-secondary inline-flex items-center">
                        вимкнено
                      </span>
                    )}
                  </>
                }
                action={
                  <span className="flex items-center gap-1">
                    <label className="inline-flex items-center gap-2 min-h-9 px-2 font-medium text-sq-text cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-[rgb(var(--sq-blue-rgb))]"
                        checked={group.is_active}
                        onChange={() => void toggleActive(group)}
                        data-testid={`group-active-${group.id}`}
                      />
                      активна
                    </label>
                    <button
                      type="button"
                      className="min-h-9 px-2 rounded-lg text-sq-blue hover:bg-sq-sidebar"
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
                      className="min-h-9 px-2 rounded-lg text-red-600 hover:bg-red-50"
                      onClick={() => void remove(group)}
                      data-testid={`group-delete-${group.id}`}
                    >
                      Видалити
                    </button>
                  </span>
                }
              />
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
