// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The editor's model of one question («Молоко?») and its answers. The owner
// edits a draft — text for money, so a price can be typed digit by digit — and
// one «Зберегти» sends the whole question (`data/modifiersApi.ts`).
//
// Two things are said in the owner's terms rather than the table's:
// the rule is «one answer / several» + «must answer», never a pair of numbers,
// and a price that depends on the size is a COLUMN per size, never a list of
// exceptions under each answer.

import type { Modifier, ModifierGroup } from '@pos/platform';
import { signedUahInputToCents } from '../components/modifierInput';
import type { WholeAnswerInput, WholeGroupInput } from '../data/modifiersApi';

export interface AnswerDraft {
  /** Stable for React and for focus; never sent. */
  key: string;
  /** An answer the question already has; absent on a new row. */
  id?: number;
  name: string;
  /** As typed: «15», «-20», «» (free). */
  delta: string;
  /** Size column → as typed; «» = this size costs what «delta» says. */
  sizes: Record<string, string>;
  isDefault: boolean;
  isActive: boolean;
  componentId: number | null;
  componentQty: string;
}

export interface GroupDraft {
  name: string;
  /** May the cashier pick one answer, or several. */
  pick: 'one' | 'many';
  /** Must the cashier answer at all. */
  required: boolean;
  /** «At least» — read only for `many` + `required`. */
  min: number;
  /** «No more than» — read only for `many`. */
  max: number;
  isActive: boolean;
  /** The sizes that have a price column of their own, in order. */
  sizeColumns: string[];
  /** Always ends with one blank row: typing into it is how an answer is added. */
  answers: AnswerDraft[];
}

let keySeq = 0;
function newKey(): string {
  keySeq += 1;
  return `a${keySeq}`;
}

export function blankAnswer(): AnswerDraft {
  return {
    key: newKey(),
    name: '',
    delta: '',
    sizes: {},
    isDefault: false,
    isActive: true,
    componentId: null,
    componentQty: '',
  };
}

/** A row the owner has not started: nothing typed, nothing chosen, not on the server. */
export function isBlank(answer: AnswerDraft): boolean {
  return (
    answer.id === undefined &&
    answer.name.trim() === '' &&
    answer.delta.trim() === '' &&
    !answer.isDefault &&
    answer.componentId == null &&
    Object.values(answer.sizes).every((text) => text.trim() === '')
  );
}

function withTrailingBlank(answers: AnswerDraft[]): AnswerDraft[] {
  const last = answers[answers.length - 1];
  return last && isBlank(last) ? answers : [...answers, blankAnswer()];
}

/** Kopecks as the owner would type them: 1500 → «15», −2050 → «-20,5», 0 → «». */
export function centsToInput(cents: number): string {
  if (cents === 0) return '';
  return String(cents / 100).replace('.', ',');
}

/** The same reading the server gives a label: spaces collapsed, case folded. */
export function labelKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function answerDraftOf(m: Modifier, columns: string[]): AnswerDraft {
  const sizes: Record<string, string> = {};
  for (const column of columns) {
    const hit = (m.label_deltas ?? []).find((d) => labelKey(d.label) === labelKey(column));
    // An override of exactly 0 is still an override («free on the small one»).
    sizes[column] = hit ? (hit.price_delta_cents === 0 ? '0' : centsToInput(hit.price_delta_cents)) : '';
  }
  return {
    key: newKey(),
    id: m.id,
    name: m.name,
    delta: centsToInput(m.price_delta_cents),
    sizes,
    isDefault: m.is_default,
    isActive: m.is_active,
    componentId: m.component_variant_id,
    componentQty: m.component_quantity == null ? '' : String(m.component_quantity),
  };
}

/**
 * The size columns a question opens with: every size some answer already
 * prices on its own — the ones its products come in first, in size order,
 * then any the products no longer have (still shown, so it can be removed).
 */
export function sizeColumnsOf(group: ModifierGroup): string[] {
  const priced = new Map<string, string>();
  for (const m of group.modifiers) {
    for (const d of m.label_deltas ?? []) {
      if (!priced.has(labelKey(d.label))) priced.set(labelKey(d.label), d.label);
    }
  }
  const columns: string[] = [];
  for (const label of group.labels_in_use ?? []) {
    if (priced.has(labelKey(label))) {
      columns.push(label);
      priced.delete(labelKey(label));
    }
  }
  return [...columns, ...priced.values()];
}

export function draftOfGroup(group: ModifierGroup): GroupDraft {
  const columns = sizeColumnsOf(group);
  return {
    name: group.name,
    pick: group.max_select === 1 ? 'one' : 'many',
    required: group.min_select >= 1,
    min: Math.max(1, group.min_select),
    max: Math.max(2, group.max_select),
    isActive: group.is_active,
    sizeColumns: columns,
    answers: withTrailingBlank(group.modifiers.map((m) => answerDraftOf(m, columns))),
  };
}

export function emptyGroupDraft(name = ''): GroupDraft {
  return {
    name,
    pick: 'one',
    required: false,
    min: 1,
    max: 3,
    isActive: true,
    sizeColumns: [],
    answers: [blankAnswer()],
  };
}

/** A typical question, so the first one is not built from an empty form. */
export interface GroupTemplate {
  id: string;
  name: string;
  pick: 'one' | 'many';
  required: boolean;
  max?: number;
  /** The first answer of a required single-choice question is «як завжди». */
  answers: string[];
}

export const GROUP_TEMPLATES: GroupTemplate[] = [
  { id: 'milk', name: 'Молоко', pick: 'one', required: true, answers: ['звичайне', 'безлактозне', 'вівсяне', 'кокосове'] },
  { id: 'syrup', name: 'Сироп', pick: 'many', required: false, max: 3, answers: ['ваніль', 'карамель', 'лісовий горіх'] },
  { id: 'doneness', name: 'Просмаження', pick: 'one', required: true, answers: ['rare', 'medium rare', 'medium', 'medium well', 'well done'] },
  { id: 'side', name: 'Гарнір', pick: 'one', required: true, answers: ['картопля фрі', 'пюре', 'овочі гриль', 'рис'] },
  { id: 'sauce', name: 'Соус', pick: 'many', required: false, max: 2, answers: ['кетчуп', 'часниковий', 'барбекю', 'сирний'] },
  { id: 'extras', name: 'Додатки', pick: 'many', required: false, max: 5, answers: ['подвійний сир', 'бекон', 'яйце', 'халапеньйо'] },
  { id: 'portion', name: 'Порція', pick: 'one', required: false, answers: ['половина', 'подвійна'] },
];

export function draftOfTemplate(template: GroupTemplate): GroupDraft {
  // «Просмаження» is required but deliberately has no «як завжди»: the cook
  // must be told, so the sheet must open. A milk does have a usual one.
  const usual = template.id === 'milk' ? 0 : -1;
  return {
    name: template.name,
    pick: template.pick,
    required: template.required,
    min: 1,
    max: template.max ?? 3,
    isActive: true,
    sizeColumns: [],
    answers: withTrailingBlank(
      template.answers.map((name, index) => ({ ...blankAnswer(), name, isDefault: index === usual }))
    ),
  };
}

/** The rule as the server stores it. */
export function ruleOf(draft: Pick<GroupDraft, 'pick' | 'required' | 'min' | 'max'>): {
  min_select: number;
  max_select: number;
} {
  if (draft.pick === 'one') return { min_select: draft.required ? 1 : 0, max_select: 1 };
  const max = Math.min(50, Math.max(2, draft.max));
  return { min_select: draft.required ? Math.min(max, Math.max(1, draft.min)) : 0, max_select: max };
}

/** The rows that will be sent: everything but the untouched blank ones. */
export function namedAnswers(draft: GroupDraft): AnswerDraft[] {
  return draft.answers.filter((answer) => !isBlank(answer));
}

/**
 * The question as one request. `writeOffs: false` leaves what each answer takes
 * off the shelf out of the body altogether — the café's marketer edits the
 * menu's half of a question (МР5), and an answer that does not mention it
 * keeps what it had on the server.
 */
export function toWholeInput(draft: GroupDraft, { writeOffs = true }: { writeOffs?: boolean } = {}): WholeGroupInput {
  const modifiers: WholeAnswerInput[] = namedAnswers(draft).map((answer) => {
    const withComponent = answer.componentId != null;
    const writeOff = writeOffs
      ? {
          component_variant_id: withComponent ? answer.componentId : null,
          component_quantity: withComponent ? Number(answer.componentQty) || 0 : null,
        }
      : {};
    return {
      ...(answer.id !== undefined ? { id: answer.id } : {}),
      name: answer.name.trim(),
      price_delta_cents: signedUahInputToCents(answer.delta),
      // Sent every time, wholesale: a column the owner removed is gone on the server too.
      label_deltas: draft.sizeColumns
        .filter((column) => (answer.sizes[column] ?? '').trim() !== '')
        .map((column) => ({ label: column, price_delta_cents: signedUahInputToCents(answer.sizes[column]) })),
      is_default: answer.isDefault && answer.isActive,
      is_active: answer.isActive,
      ...writeOff,
    };
  });
  return { name: draft.name.trim(), ...ruleOf(draft), is_active: draft.isActive, modifiers };
}

/** Why the draft cannot be saved, in the owner's words — or null. */
export function validateDraft(draft: GroupDraft): string | null {
  if (draft.name.trim() === '') return 'Назвіть питання — наприклад, «Молоко» чи «Соус»';
  const answers = namedAnswers(draft);
  if (answers.length === 0) return 'Додайте хоча б одну відповідь';
  const seen = new Set<string>();
  for (const answer of answers) {
    const name = answer.name.trim();
    if (name === '') return 'Одна з відповідей без назви — впишіть її або приберіть рядок';
    const key = labelKey(name);
    if (seen.has(key)) return `Відповідь «${name}» записано двічі`;
    seen.add(key);
    if (answer.componentId != null) {
      const qty = Number(answer.componentQty);
      if (!Number.isInteger(qty) || qty <= 0) return `«${name}»: вкажіть, скільки списувати — цілим числом`;
    }
  }
  const { max_select } = ruleOf(draft);
  const defaults = answers.filter((a) => a.isDefault && a.isActive).length;
  if (defaults > max_select) {
    return max_select === 1
      ? 'Відповіддю «як завжди» може бути лише одна'
      : `Відповідей «як завжди» (${defaults}) більше, ніж можна обрати (${max_select})`;
  }
  return null;
}

/** Has the owner changed anything worth a «Зберегти» — or worth asking before closing. */
export function sameDraft(a: GroupDraft, b: GroupDraft): boolean {
  return JSON.stringify(toWholeInput(a)) === JSON.stringify(toWholeInput(b));
}

// ── edits ───────────────────────────────────────────────────────────

export function patchAnswer(draft: GroupDraft, key: string, patch: Partial<AnswerDraft>): GroupDraft {
  return {
    ...draft,
    answers: withTrailingBlank(draft.answers.map((a) => (a.key === key ? { ...a, ...patch } : a))),
  };
}

export function removeAnswer(draft: GroupDraft, key: string): GroupDraft {
  return { ...draft, answers: withTrailingBlank(draft.answers.filter((a) => a.key !== key)) };
}

/** Move an answer one place up or down among the named ones; the blank row stays last. */
export function moveAnswer(draft: GroupDraft, key: string, direction: -1 | 1): GroupDraft {
  const index = draft.answers.findIndex((a) => a.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft.answers.length) return draft;
  if (isBlank(draft.answers[index]) || isBlank(draft.answers[target])) return draft;
  const answers = [...draft.answers];
  [answers[index], answers[target]] = [answers[target], answers[index]];
  return { ...draft, answers };
}

/**
 * «Як завжди» on an answer. With one answer allowed it behaves as a radio
 * that can be cleared; with several, it refuses the tick that would make more
 * usual answers than the cashier may pick — the caller reads `false` and says so.
 */
export function toggleDefault(draft: GroupDraft, key: string): { draft: GroupDraft; refused: boolean } {
  const target = draft.answers.find((a) => a.key === key);
  if (!target) return { draft, refused: false };
  if (target.isDefault) return { draft: patchAnswer(draft, key, { isDefault: false }), refused: false };
  if (draft.pick === 'one') {
    return {
      draft: {
        ...draft,
        answers: withTrailingBlank(draft.answers.map((a) => ({ ...a, isDefault: a.key === key }))),
      },
      refused: false,
    };
  }
  const { max_select } = ruleOf(draft);
  const defaults = draft.answers.filter((a) => a.isDefault && a.isActive).length;
  if (defaults >= max_select) return { draft, refused: true };
  return { draft: patchAnswer(draft, key, { isDefault: true }), refused: false };
}

/** Switching to «one answer» keeps the first usual answer and drops the rest. */
export function setPick(draft: GroupDraft, pick: 'one' | 'many'): GroupDraft {
  if (pick === draft.pick) return draft;
  if (pick === 'many') return { ...draft, pick };
  let kept = false;
  return {
    ...draft,
    pick,
    answers: draft.answers.map((a) => {
      if (!a.isDefault) return a;
      if (kept) return { ...a, isDefault: false };
      kept = true;
      return a;
    }),
  };
}

export function addSizeColumn(draft: GroupDraft, label: string): GroupDraft {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (clean === '' || draft.sizeColumns.some((c) => labelKey(c) === labelKey(clean))) return draft;
  return { ...draft, sizeColumns: [...draft.sizeColumns, clean] };
}

export function removeSizeColumn(draft: GroupDraft, label: string): GroupDraft {
  return {
    ...draft,
    sizeColumns: draft.sizeColumns.filter((c) => c !== label),
    answers: draft.answers.map((a) => {
      const sizes = { ...a.sizes };
      delete sizes[label];
      return { ...a, sizes };
    }),
  };
}
