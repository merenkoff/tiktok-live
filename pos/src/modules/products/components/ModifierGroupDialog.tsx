// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ModifierGroup } from '@pos/platform';
import { ArrowDown, ArrowUp, Check, MoreHorizontal, Segmented, Trash2, X } from '@pos/platform/ui';
import { Dialog } from './Dialog';
import { IngredientPicker } from './IngredientPicker';
import type { ComponentOption } from './componentOptions';
import { captionClass, checkboxClass, chipClass, panelFieldClass } from './formStyles';
import { errorText, signedUahInputToCents } from './modifierInput';
import { saveGroupWhole } from '../data/modifiersApi';
import { useMenuOnly } from '../lib/menuOnly';
import {
  GROUP_TEMPLATES,
  addSizeColumn,
  draftOfGroup,
  draftOfTemplate,
  emptyGroupDraft,
  isBlank,
  labelKey,
  moveAnswer,
  namedAnswers,
  patchAnswer,
  removeAnswer,
  removeSizeColumn,
  ruleOf,
  sameDraft,
  setPick,
  toWholeInput,
  toggleDefault,
  validateDraft,
  type AnswerDraft,
  type GroupDraft,
} from '../lib/groupDraft';
import { deltaText, namesPreview, nounFor, ruleSentence, ruleText, usageText } from '../lib/modifierWords';

/** Where else the question is asked — so a change here is made knowingly. */
export interface GroupUsage {
  count: number;
  names: string[];
}

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  testId,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
  testId?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={testId}>
      <span className="text-[15px] text-sq-text">{label}</span>
      <button
        type="button"
        className="w-9 h-9 grid place-items-center rounded-lg bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text disabled:opacity-40"
        aria-label={`${label}: менше`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="min-w-6 text-center text-[15px] font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        className="w-9 h-9 grid place-items-center rounded-lg bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text disabled:opacity-40"
        aria-label={`${label}: більше`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </span>
  );
}

/**
 * One question and all its answers, on one sheet, saved by one button.
 *
 * The same editor wherever a question is met — in the product card (where it
 * is created without leaving the dish) and on «Модифікатори». Three things it
 * does that the old inline form did not: the rule is asked in words («одну /
 * кілька», «обовʼязково»), an answer is added by typing into the last row and
 * Enter moves down, and what an answer takes off the shelf is found by typing
 * rather than scrolled to in a list of every variant in the store.
 *
 * A question shared with other products says so before anything is changed,
 * and — from a product card — offers to save the changes as that product's
 * own copy instead.
 */
export function ModifierGroupDialog({
  group,
  initialName = '',
  options,
  dish,
  others,
  fork,
  onSaved,
  onClose,
}: {
  /** The question to change; null = a new one. */
  group: ModifierGroup | null;
  /** What the owner had typed into the search when they chose «create». */
  initialName?: string;
  /** Every variant an answer may take off the shelf. */
  options: ComponentOption[];
  /** A café says «страва», every other shop «товар». */
  dish: boolean;
  /** The other products that ask this question. */
  others?: GroupUsage;
  /** Opened from a product card: «save as this product's own copy» is offered. */
  fork?: { productName: string };
  onSaved: (group: ModifierGroup, how: 'saved' | 'forked') => void;
  onClose: () => void;
}) {
  const initial = useMemo(
    () => (group ? draftOfGroup(group) : emptyGroupDraft(initialName)),
    [group, initialName]
  );
  const [draft, setDraft] = useState<GroupDraft>(initial);
  const [baseline, setBaseline] = useState<GroupDraft>(initial);
  const [open, setOpen] = useState<string | null>(null);
  // The café's marketer edits the answers, prices and rule — never what an
  // answer writes off the shelf (МР5): she neither sees it nor sends it, and
  // a copy of a question that writes something off is the owner's to make.
  const menuOnly = useMenuOnly();
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sizesOpen, setSizesOpen] = useState(initial.sizeColumns.length > 0);
  const [customSize, setCustomSize] = useState('');
  const nameRefs = useRef(new Map<string, HTMLInputElement>());

  const noun = nounFor(dish);
  const byVariant = useMemo(() => new Map(options.map((o) => [o.variant_id, o])), [options]);
  const labelsInUse = group?.labels_in_use ?? [];
  const knownLabels = new Set(labelsInUse.map(labelKey));
  const dirty = !sameDraft(draft, baseline);
  const rule = ruleOf(draft);
  const shared = (others?.count ?? 0) > 0;
  // A copy of a question whose answers write something off would carry the
  // kitchen's half: the marketer leaves that to the owner.
  const canFork = !!fork && !(menuOnly && draft.answers.some((answer) => answer.componentId != null));
  // Up to two size columns a row stays on one line, so the heads are said once.
  const columnHead = draft.sizeColumns.length <= 2;

  function update(next: GroupDraft) {
    setDraft(next);
    setError(null);
    setHint(null);
  }

  function requestClose() {
    if (dirty && !busy) setClosing(true);
    else onClose();
  }

  function focusName(key: string | undefined) {
    if (key) nameRefs.current.get(key)?.focus();
  }

  /** Enter never submits the sheet from a row: it goes to the next answer. */
  function onRowEnter(e: KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    focusName(draft.answers[index + 1]?.key);
  }

  async function save(asCopy: boolean) {
    if (busy) return;
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input = toWholeInput(draft, { writeOffs: !menuOnly });
      if (asCopy && group && fork) {
        // The copy is a NEW question: no answer ids, and a name that tells it
        // from the shared one in every list.
        const renamed = labelKey(input.name) !== labelKey(group.name);
        const name = renamed ? input.name : `${input.name} (${fork.productName || 'копія'})`.slice(0, 80);
        const saved = await saveGroupWhole(null, {
          ...input,
          name,
          modifiers: input.modifiers.map(({ id: _id, ...rest }) => rest),
        });
        onSaved(saved, 'forked');
      } else {
        const saved = await saveGroupWhole(group?.id ?? null, input);
        setBaseline(draft);
        onSaved(saved, 'saved');
      }
    } catch (err) {
      setError(errorText(err, 'Не вдалося зберегти'));
      setBusy(false);
    }
  }

  function onToggleDefault(answer: AnswerDraft) {
    const result = toggleDefault(draft, answer.key);
    if (result.refused) {
      setHint(`«Як завжди» вже ${rule.max_select} — стільки касир і може обрати. Зніміть одну або збільште «не більше».`);
      return;
    }
    update(result.draft);
  }

  const named = namedAnswers(draft);
  const previewAnswers = named.filter((a) => a.isActive && a.name.trim() !== '');
  const requiredNoUsual = draft.required && draft.pick === 'one' && !named.some((a) => a.isDefault && a.isActive);

  return (
    <Dialog
      title={group ? 'Модифікатор' : 'Новий модифікатор'}
      description="Питання, яке каса ставить про позицію, і відповіді на нього."
      size="lg"
      onClose={requestClose}
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      testId="modifier-group-dialog"
      footer={
        closing ? (
          <>
            <span className="mr-auto text-[15px] text-sq-text">Закрити без збереження?</span>
            <button type="button" className="sq-btn-quiet" onClick={() => setClosing(false)}>
              Ні, повернутись
            </button>
            <button
              type="button"
              className="min-h-11 px-4 rounded-sq text-[15px] font-semibold text-red-600 hover:bg-red-50"
              onClick={onClose}
              data-testid="modifier-group-discard"
            >
              Закрити
            </button>
          </>
        ) : (
          <>
            {shared && canFork && group && (
              <button
                type="button"
                className="sq-btn-quiet mr-auto"
                disabled={busy}
                onClick={() => void save(true)}
                data-testid="modifier-group-fork"
              >
                Зберегти лише для цієї {dish ? 'страви' : 'позиції'}
              </button>
            )}
            <button type="button" className="sq-btn-quiet" onClick={requestClose}>
              Скасувати
            </button>
            <button
              type="submit"
              className="pos-btn-primary min-h-11 px-6 rounded-sq text-[15px] disabled:opacity-50"
              disabled={busy || (!!group && !dirty)}
              data-testid="modifier-group-save"
            >
              {busy ? 'Збереження…' : shared ? `Зберегти для всіх (${(others?.count ?? 0) + (fork ? 1 : 0)})` : 'Зберегти'}
            </button>
          </>
        )
      }
    >
      <div className="space-y-6 pb-3">
        {shared && others && (
          <div className="rounded-sq bg-amber-50 text-amber-900 px-4 py-3 text-[15px] leading-relaxed" data-testid="modifier-group-shared">
            Це питання ставлять {fork ? 'ще ' : ''}
            {usageText(others.count, noun)}: {namesPreview(others.names)}. Зміни побачать усі.
            {canFork && ` Щоб змінити лише тут — «Зберегти лише для цієї ${dish ? 'страви' : 'позиції'}».`}
          </div>
        )}
        {error && (
          <div className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" role="alert" data-testid="modifier-group-error">
            {error}
          </div>
        )}

        <section className="space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className={captionClass}>Питання</span>
            <input
              className="sq-input"
              placeholder="Молоко, соус, просмаження…"
              value={draft.name}
              maxLength={80}
              onChange={(e) => update({ ...draft, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                focusName(draft.answers[0]?.key);
              }}
              data-testid="modifier-group-name"
            />
          </label>
          {!group && dish && (
            <div className="flex flex-wrap items-center gap-2" data-testid="modifier-group-templates">
              <span className="text-[13px] text-sq-muted">Почати з готового:</span>
              {GROUP_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="min-h-8 px-3 rounded-full bg-sq-surface ring-1 ring-inset ring-sq-divider text-[14px] font-medium text-sq-text hover:bg-sq-sidebar"
                  onClick={() => {
                    const next = draftOfTemplate(template);
                    update(next);
                    setSizesOpen(false);
                  }}
                  data-testid={`modifier-template-${template.id}`}
                >
                  {template.name}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <p className={captionClass}>Скільки відповідей обирає касир</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Segmented
              ariaLabel="Скільки відповідей"
              value={draft.pick}
              options={[
                { value: 'one', label: 'Одну', testId: 'modifier-pick-one' },
                { value: 'many', label: 'Кілька', testId: 'modifier-pick-many' },
              ]}
              onChange={(pick) => update(setPick(draft, pick))}
            />
            <label className="inline-flex items-center gap-2 min-h-9 text-[15px] text-sq-text cursor-pointer">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={draft.required}
                onChange={(e) => update({ ...draft, required: e.target.checked })}
                data-testid="modifier-required"
              />
              Обовʼязково обрати
            </label>
            {draft.pick === 'many' && (
              <Stepper
                label="не більше"
                value={Math.max(2, draft.max)}
                min={2}
                max={50}
                onChange={(max) => update({ ...draft, max, min: Math.min(draft.min, max) })}
                testId="modifier-max"
              />
            )}
            {draft.pick === 'many' && draft.required && (
              <Stepper
                label="щонайменше"
                value={Math.min(draft.min, Math.max(2, draft.max))}
                min={1}
                max={Math.max(2, draft.max)}
                onChange={(min) => update({ ...draft, min })}
                testId="modifier-min"
              />
            )}
          </div>
          <p className="text-[13px] text-sq-muted leading-relaxed" data-testid="modifier-rule-sentence">
            {ruleSentence(rule)}
            {requiredNoUsual &&
              ' Позначте одну відповідь «як завжди» — тоді каса пробиває позицію одним дотиком, а питає лише коли треба інакше.'}
          </p>
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className={captionClass}>Відповіді</p>
            <p className="text-[13px] text-sq-muted">Доплата може бути з мінусом: «половина −20»</p>
          </div>

          {/* The column heads, once — while the row fits on one line. With more
              size columns the row wraps, and every field carries its own. */}
          {columnHead && (
            <div className="hidden sm:flex items-end gap-2 px-2 text-[11px] leading-4 text-sq-muted" aria-hidden>
              <span className="w-7 shrink-0" />
              <span className="flex-1 min-w-[10rem]" />
              <span className="w-24 text-right pr-1">
                {draft.sizeColumns.length > 0 ? 'інші розміри, ₴' : 'доплата, ₴'}
              </span>
              {draft.sizeColumns.map((column) => (
                <span key={column} className="w-24 text-right pr-1 truncate">
                  {column}, ₴
                </span>
              ))}
              <span className="w-[7.25rem] shrink-0" />
              <span className="w-11 shrink-0" />
            </div>
          )}

          <ul className="space-y-2">
            {draft.answers.map((answer, index) => {
              const blank = isBlank(answer);
              const part = answer.componentId == null ? null : byVariant.get(answer.componentId);
              const expanded = open === answer.key;
              const prevNamed = index > 0 && !isBlank(draft.answers[index - 1]);
              const nextNamed = index < draft.answers.length - 1 && !isBlank(draft.answers[index + 1]);
              return (
                <li
                  key={answer.key}
                  className={`rounded-xl ring-1 ring-inset ${
                    blank ? 'ring-sq-divider bg-transparent' : 'ring-sq-divider bg-sq-surface'
                  } ${answer.isActive ? '' : 'opacity-60'}`}
                  data-testid={blank ? 'answer-row-new' : 'answer-row'}
                >
                  <div className="flex flex-wrap items-start gap-2 p-2">
                    <div className="flex flex-col shrink-0 pt-0.5">
                      <button
                        type="button"
                        className="w-7 h-5 grid place-items-center rounded text-sq-secondary hover:bg-sq-sidebar disabled:opacity-25"
                        aria-label="Вище"
                        disabled={blank || !prevNamed}
                        onClick={() => update(moveAnswer(draft, answer.key, -1))}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        className="w-7 h-5 grid place-items-center rounded text-sq-secondary hover:bg-sq-sidebar disabled:opacity-25"
                        aria-label="Нижче"
                        disabled={blank || !nextNamed}
                        onClick={() => update(moveAnswer(draft, answer.key, 1))}
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>

                    <div className="flex-1 min-w-[10rem]">
                      <input
                        ref={(el) => {
                          if (el) nameRefs.current.set(answer.key, el);
                          else nameRefs.current.delete(answer.key);
                        }}
                        className="sq-input"
                        placeholder={blank ? (index === 0 ? 'Перша відповідь — наприклад, «звичайне»' : 'Ще відповідь…') : 'Назва відповіді'}
                        aria-label="Відповідь"
                        value={answer.name}
                        maxLength={80}
                        onChange={(e) => update(patchAnswer(draft, answer.key, { name: e.target.value }))}
                        onKeyDown={(e) => onRowEnter(e, index)}
                        data-testid="answer-name"
                      />
                      {!blank && !expanded && !menuOnly && (
                        <button
                          type="button"
                          className="mt-1 text-left text-[13px] text-sq-blue font-medium"
                          onClick={() => setOpen(answer.key)}
                          data-testid="answer-writeoff-link"
                        >
                          {answer.componentId != null
                            ? `списує: ${part?.caption ?? 'складник'} × ${answer.componentQty || '?'} ${part?.unit ?? ''}`.trim()
                            : '+ списання зі складу'}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col">
                        {draft.sizeColumns.length > 0 && (
                          <span className={columnHead ? 'sm:hidden text-[11px] leading-4 text-sq-muted' : 'text-[11px] leading-4 text-sq-muted'}>
                            інші розміри
                          </span>
                        )}
                        <input
                          className="sq-input tabular-nums !w-24 text-right"
                          inputMode="decimal"
                          placeholder="0 ₴"
                          aria-label="Доплата, ₴"
                          value={answer.delta}
                          onChange={(e) => update(patchAnswer(draft, answer.key, { delta: e.target.value }))}
                          onKeyDown={(e) => onRowEnter(e, index)}
                          data-testid="answer-delta"
                        />
                      </label>
                      {draft.sizeColumns.map((column) => (
                        <label key={column} className="flex flex-col">
                          <span
                            className={
                              columnHead
                                ? 'sm:hidden text-[11px] leading-4 text-sq-muted max-w-24 truncate'
                                : 'text-[11px] leading-4 text-sq-muted max-w-24 truncate'
                            }
                          >
                            {column}
                          </span>
                          <input
                            className="sq-input tabular-nums !w-24 text-right"
                            inputMode="decimal"
                            placeholder={answer.delta.trim() === '' ? '0 ₴' : answer.delta}
                            aria-label={`Доплата для «${column}», ₴`}
                            value={answer.sizes[column] ?? ''}
                            onChange={(e) =>
                              update(
                                patchAnswer(draft, answer.key, { sizes: { ...answer.sizes, [column]: e.target.value } })
                              )
                            }
                            onKeyDown={(e) => onRowEnter(e, index)}
                            data-testid={`answer-size-${column}`}
                          />
                        </label>
                      ))}
                    </div>

                    <button
                      type="button"
                      aria-pressed={answer.isDefault}
                      disabled={blank || !answer.isActive}
                      onClick={() => onToggleDefault(answer)}
                      className={`shrink-0 min-h-11 w-[7.25rem] rounded-[10px] inline-flex items-center justify-center gap-1.5 text-[14px] disabled:opacity-40 ${
                        answer.isDefault
                          ? 'bg-sq-blue/[0.08] ring-2 ring-inset ring-sq-blue text-sq-blue font-semibold'
                          : 'ring-1 ring-inset ring-sq-divider text-sq-secondary font-medium hover:bg-sq-sidebar'
                      }`}
                      data-testid="answer-default"
                    >
                      {answer.isDefault && <Check size={16} />}
                      як завжди
                    </button>

                    <button
                      type="button"
                      className="shrink-0 w-11 h-11 grid place-items-center rounded-[10px] text-sq-secondary hover:bg-sq-sidebar disabled:opacity-25"
                      aria-label={expanded ? 'Згорнути' : menuOnly ? 'Інше' : 'Списання й інше'}
                      aria-expanded={expanded}
                      disabled={blank}
                      onClick={() => setOpen(expanded ? null : answer.key)}
                      data-testid="answer-more"
                    >
                      {expanded ? <X size={18} /> : <MoreHorizontal size={20} />}
                    </button>
                  </div>

                  {expanded && !blank && (
                    <div className="mx-2 mb-2 rounded-[10px] bg-sq-sidebar p-3 space-y-3" data-testid="answer-details">
                      {!menuOnly && (
                      <>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem] items-end">
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <span className={captionClass}>Списує зі складу</span>
                          <IngredientPicker
                            options={options}
                            value={answer.componentId}
                            onChange={(componentId) =>
                              update(
                                patchAnswer(draft, answer.key, {
                                  componentId,
                                  componentQty: componentId == null ? '' : answer.componentQty || '1',
                                })
                              )
                            }
                            testId="answer-component"
                          />
                        </div>
                        {answer.componentId != null && (
                          <label className="flex flex-col gap-1.5">
                            <span className={captionClass}>Скільки{part ? `, ${part.unit}` : ''}</span>
                            <input
                              className={`${panelFieldClass} tabular-nums text-right`}
                              inputMode="numeric"
                              value={answer.componentQty}
                              onChange={(e) =>
                                update(
                                  patchAnswer(draft, answer.key, { componentQty: e.target.value.replace(/\D/g, '') })
                                )
                              }
                              data-testid="answer-component-qty"
                            />
                          </label>
                        )}
                      </div>
                      <p className="text-[13px] text-sq-muted leading-relaxed">
                        «Вівсяне» списує вівсяне молоко, а не звичайне — так склад сходиться з тим, що налили.
                      </p>
                      </>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 min-h-9 text-[15px] text-sq-text cursor-pointer">
                          <input
                            type="checkbox"
                            className={checkboxClass}
                            checked={!answer.isActive}
                            onChange={(e) =>
                              update(
                                patchAnswer(draft, answer.key, {
                                  isActive: !e.target.checked,
                                  ...(e.target.checked ? { isDefault: false } : {}),
                                })
                              )
                            }
                            data-testid="answer-hidden"
                          />
                          Тимчасово не показувати на касі
                        </label>
                        <button
                          type="button"
                          className="min-h-9 px-2 rounded-lg inline-flex items-center gap-1.5 text-[15px] font-semibold text-red-600 hover:bg-red-50"
                          onClick={() => {
                            update(removeAnswer(draft, answer.key));
                            setOpen(null);
                          }}
                          data-testid="answer-remove"
                        >
                          <Trash2 size={18} />
                          Видалити відповідь
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {hint && (
            <p className="text-[13px] text-amber-700" role="status" data-testid="modifier-group-hint">
              {hint}
            </p>
          )}
        </section>

        <section className="space-y-2" data-testid="modifier-sizes">
          <label className="inline-flex items-center gap-2 min-h-9 text-[15px] text-sq-text cursor-pointer">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={sizesOpen}
              onChange={(e) => {
                setSizesOpen(e.target.checked);
                if (!e.target.checked) {
                  update(draft.sizeColumns.reduce((d, column) => removeSizeColumn(d, column), draft));
                }
              }}
              data-testid="modifier-sizes-toggle"
            />
            Доплата залежить від розміру
            <span className="text-[13px] text-sq-muted">— бортик дорожчий на великій піці</span>
          </label>
          {sizesOpen && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {[...labelsInUse, ...draft.sizeColumns.filter((c) => !knownLabels.has(labelKey(c)))].map((label) => {
                  const on = draft.sizeColumns.some((c) => labelKey(c) === labelKey(label));
                  const missing = labelsInUse.length > 0 && !knownLabels.has(labelKey(label));
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      title={missing ? 'Жоден товар цього питання не має такого розміру' : undefined}
                      onClick={() =>
                        update(
                          on
                            ? removeSizeColumn(draft, draft.sizeColumns.find((c) => labelKey(c) === labelKey(label)) ?? label)
                            : addSizeColumn(draft, label)
                        )
                      }
                      className={`min-h-9 px-3 rounded-[10px] text-[15px] ${
                        on
                          ? 'bg-sq-blue/[0.08] ring-2 ring-inset ring-sq-blue text-sq-blue font-semibold'
                          : 'bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text font-medium hover:bg-sq-sidebar'
                      }`}
                      data-testid={`modifier-size-chip-${label}`}
                    >
                      {label}
                      {missing && <span className="ml-1.5 text-[13px] font-normal text-amber-700">немає в товарах</span>}
                    </button>
                  );
                })}
                <input
                  className="sq-input !w-36"
                  placeholder="Свій розмір"
                  aria-label="Свій розмір"
                  value={customSize}
                  onChange={(e) => setCustomSize(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    update(addSizeColumn(draft, customSize));
                    setCustomSize('');
                  }}
                  data-testid="modifier-size-custom"
                />
                <button
                  type="button"
                  className="min-h-9 px-2 text-[15px] font-semibold text-sq-blue disabled:opacity-40"
                  disabled={customSize.trim() === ''}
                  onClick={() => {
                    update(addSizeColumn(draft, customSize));
                    setCustomSize('');
                  }}
                >
                  Додати
                </button>
              </div>
              <p className="text-[13px] text-sq-muted leading-relaxed">
                Оберіть розміри — біля кожної відповіді зʼявиться поле для них. Порожнє поле розміру означає
                звичайну доплату.
                {labelsInUse.length === 0 &&
                  ' Розміри підставляться самі, щойно питання буде додано до товарів із варіантами.'}
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-sq-sidebar p-3.5 space-y-2.5" data-testid="modifier-preview">
          <p className={captionClass}>Так побачить касир</p>
          <p className="text-[15px] font-semibold text-sq-heading">
            {draft.name.trim() || 'Питання'}{' '}
            <span className="text-[13px] font-normal text-sq-muted">{ruleText(rule)}</span>
            {!draft.isActive && <span className={`${chipClass} ml-2 ring-1 ring-inset ring-sq-divider text-sq-secondary`}>вимкнено</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {previewAnswers.map((answer) => {
              const delta = deltaText(signedUahInputToCents(answer.delta));
              return (
                <span
                  key={answer.key}
                  className={`inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-[10px] text-[15px] ${
                    answer.isDefault
                      ? 'bg-sq-blue text-white font-semibold'
                      : 'bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text font-medium'
                  }`}
                >
                  {answer.name.trim()}
                  {delta && (
                    <span className={answer.isDefault ? 'text-white/85 font-normal' : 'text-sq-secondary font-normal'}>
                      {delta}
                    </span>
                  )}
                </span>
              );
            })}
            {previewAnswers.length === 0 && (
              <span className="text-[15px] text-sq-muted">Без відповідей каса питання не покаже</span>
            )}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
