// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { Modifier, ModifierGroup } from '@pos/platform';
import {
  GROUP_TEMPLATES,
  addSizeColumn,
  centsToInput,
  draftOfGroup,
  draftOfTemplate,
  emptyGroupDraft,
  moveAnswer,
  namedAnswers,
  patchAnswer,
  removeAnswer,
  removeSizeColumn,
  ruleOf,
  sameDraft,
  setPick,
  sizeColumnsOf,
  toWholeInput,
  toggleDefault,
  validateDraft,
} from './groupDraft';

function answer(patch: Partial<Modifier> & { id: number; name: string }): Modifier {
  return {
    group_id: 1,
    price_delta_cents: 0,
    label_deltas: [],
    component_variant_id: null,
    component_quantity: null,
    component: null,
    is_default: false,
    sort_order: 0,
    is_active: true,
    ...patch,
  };
}

const crust: ModifierGroup = {
  id: 1,
  name: 'Бортики',
  min_select: 0,
  max_select: 1,
  sort_order: 0,
  is_active: true,
  labels_in_use: ['30 см', '50 см'],
  modifiers: [
    answer({
      id: 11,
      name: 'Філадельфія',
      price_delta_cents: 8000,
      label_deltas: [{ label: '50 СМ', price_delta_cents: 15000 }],
    }),
    answer({ id: 12, name: 'Кунжутний', price_delta_cents: 1000, component_variant_id: 20, component_quantity: 30 }),
  ],
};

describe('groupDraft: a question as the owner edits it', () => {
  it('types money the way an owner would', () => {
    expect([0, 1500, -2000, 1250, -50].map(centsToInput)).toEqual(['', '15', '-20', '12,5', '-0,5']);
  });

  it('opens a question with one column per size some answer prices on its own', () => {
    // «50 СМ» is the stored spelling; the column takes the one the products use.
    expect(sizeColumnsOf(crust)).toEqual(['50 см']);
    const draft = draftOfGroup(crust);
    expect(draft.pick).toBe('one');
    expect(draft.required).toBe(false);
    expect(draft.answers.map((a) => [a.name, a.delta, a.sizes['50 см']])).toEqual([
      ['Філадельфія', '80', '150'],
      ['Кунжутний', '10', ''],
      ['', '', undefined],
    ]);
  });

  it('round-trips: an untouched draft sends exactly what the server has', () => {
    const draft = draftOfGroup(crust);
    expect(toWholeInput(draft)).toEqual({
      name: 'Бортики',
      min_select: 0,
      max_select: 1,
      is_active: true,
      modifiers: [
        {
          id: 11,
          name: 'Філадельфія',
          price_delta_cents: 8000,
          label_deltas: [{ label: '50 см', price_delta_cents: 15000 }],
          is_default: false,
          is_active: true,
          component_variant_id: null,
          component_quantity: null,
        },
        {
          id: 12,
          name: 'Кунжутний',
          price_delta_cents: 1000,
          label_deltas: [],
          is_default: false,
          is_active: true,
          component_variant_id: 20,
          component_quantity: 30,
        },
      ],
    });
    expect(sameDraft(draft, draftOfGroup(crust))).toBe(true);
  });

  it('for the marketer, sends the answers without what they write off — the server keeps it (МР5)', () => {
    const sent = toWholeInput(draftOfGroup(crust), { writeOffs: false });
    for (const answer of sent.modifiers) {
      expect(answer).not.toHaveProperty('component_variant_id');
      expect(answer).not.toHaveProperty('component_quantity');
    }
    expect(sent.modifiers.map((m) => [m.id, m.name, m.price_delta_cents])).toEqual([
      [11, 'Філадельфія', 8000],
      [12, 'Кунжутний', 1000],
    ]);
  });

  it('says the rule in the server’s two numbers', () => {
    const base = emptyGroupDraft();
    expect(ruleOf({ ...base, pick: 'one', required: false })).toEqual({ min_select: 0, max_select: 1 });
    expect(ruleOf({ ...base, pick: 'one', required: true })).toEqual({ min_select: 1, max_select: 1 });
    expect(ruleOf({ ...base, pick: 'many', required: false, max: 3 })).toEqual({ min_select: 0, max_select: 3 });
    expect(ruleOf({ ...base, pick: 'many', required: true, min: 2, max: 3 })).toEqual({ min_select: 2, max_select: 3 });
    // «At least» can never exceed «no more than».
    expect(ruleOf({ ...base, pick: 'many', required: true, min: 5, max: 3 })).toEqual({ min_select: 3, max_select: 3 });
    // «Several» is never one: a draft that says so is read as two.
    expect(ruleOf({ ...base, pick: 'many', required: false, max: 1 }).max_select).toBe(2);
  });

  it('adds an answer by typing into the last row, and keeps one blank row at the end', () => {
    let draft = emptyGroupDraft('Сироп');
    expect(draft.answers).toHaveLength(1);
    draft = patchAnswer(draft, draft.answers[0].key, { name: 'ваніль' });
    expect(draft.answers.map((a) => a.name)).toEqual(['ваніль', '']);
    draft = patchAnswer(draft, draft.answers[1].key, { name: 'карамель', delta: '10' });
    expect(draft.answers.map((a) => a.name)).toEqual(['ваніль', 'карамель', '']);
    expect(namedAnswers(draft)).toHaveLength(2);
    // The blank row is never sent.
    expect(toWholeInput(draft).modifiers.map((m) => [m.name, m.price_delta_cents])).toEqual([
      ['ваніль', 0],
      ['карамель', 1000],
    ]);
  });

  it('reads a minus as a discount and an empty price as free', () => {
    let draft = emptyGroupDraft('Порція');
    draft = patchAnswer(draft, draft.answers[0].key, { name: 'половина', delta: '−20' });
    draft = patchAnswer(draft, draft.answers[1].key, { name: 'звичайна' });
    expect(toWholeInput(draft).modifiers.map((m) => m.price_delta_cents)).toEqual([-2000, 0]);
  });

  it('moves an answer among the named ones only', () => {
    const draft = draftOfGroup(crust);
    const [first, second, blank] = draft.answers;
    expect(moveAnswer(draft, second.key, -1).answers.map((a) => a.name)).toEqual(['Кунжутний', 'Філадельфія', '']);
    expect(moveAnswer(draft, second.key, 1)).toBe(draft);
    expect(moveAnswer(draft, first.key, -1)).toBe(draft);
    expect(moveAnswer(draft, blank.key, -1)).toBe(draft);
  });

  it('removes an answer; the server deletes what the list leaves out', () => {
    const draft = draftOfGroup(crust);
    const next = removeAnswer(draft, draft.answers[0].key);
    expect(toWholeInput(next).modifiers.map((m) => m.id)).toEqual([12]);
  });

  it('«як завжди» is a radio under «one», and bounded by «no more than» under «several»', () => {
    let draft = draftOfGroup(crust);
    const [a, b] = draft.answers;
    draft = toggleDefault(draft, a.key).draft;
    draft = toggleDefault(draft, b.key).draft;
    expect(draft.answers.map((x) => x.isDefault)).toEqual([false, true, false]);
    // A second tap clears it.
    expect(toggleDefault(draft, b.key).draft.answers.some((x) => x.isDefault)).toBe(false);

    let many = { ...draftOfGroup(crust), pick: 'many' as const, max: 2 };
    many = patchAnswer(many, many.answers[2].key, { name: 'Моцарела' });
    many = toggleDefault(many, many.answers[0].key).draft;
    many = toggleDefault(many, many.answers[1].key).draft;
    const third = toggleDefault(many, many.answers[2].key);
    expect(third.refused).toBe(true);
    expect(third.draft).toBe(many);

    // Back to «one»: only the first usual answer survives.
    expect(setPick(many, 'one').answers.map((x) => x.isDefault)).toEqual([true, false, false, false]);
  });

  it('a hidden answer is never «як завжди» on the wire', () => {
    let draft = draftOfGroup(crust);
    draft = toggleDefault(draft, draft.answers[0].key).draft;
    draft = patchAnswer(draft, draft.answers[0].key, { isActive: false });
    expect(toWholeInput(draft).modifiers[0]).toMatchObject({ is_default: false, is_active: false });
  });

  it('a size is a column: added once, removed with its prices', () => {
    let draft = draftOfGroup(crust);
    draft = addSizeColumn(draft, ' 30  см ');
    draft = addSizeColumn(draft, '30 СМ');
    expect(draft.sizeColumns).toEqual(['50 см', '30 см']);
    draft = patchAnswer(draft, draft.answers[1].key, { sizes: { ...draft.answers[1].sizes, '30 см': '0' } });
    // A typed «0» is a price of its own («free on the small one»), not «no override».
    expect(toWholeInput(draft).modifiers[1].label_deltas).toEqual([{ label: '30 см', price_delta_cents: 0 }]);
    draft = removeSizeColumn(draft, '50 см');
    expect(toWholeInput(draft).modifiers[0].label_deltas).toEqual([]);
  });

  it('refuses in words what the server would refuse — before the request', () => {
    const blank = emptyGroupDraft();
    expect(validateDraft(blank)).toMatch(/Назвіть питання/);
    expect(validateDraft({ ...blank, name: 'Молоко' })).toMatch(/хоча б одну відповідь/);

    let draft = draftOfGroup(crust);
    expect(validateDraft(draft)).toBeNull();
    expect(validateDraft(patchAnswer(draft, draft.answers[0].key, { name: ' ' }))).toMatch(/без назви/);
    expect(validateDraft(patchAnswer(draft, draft.answers[0].key, { name: 'кунжутний' }))).toMatch(/двічі/);
    expect(validateDraft(patchAnswer(draft, draft.answers[1].key, { componentQty: '' }))).toMatch(/скільки списувати/);
    draft = { ...draft, answers: draft.answers.map((a) => ({ ...a, isDefault: a.name !== '' })) };
    expect(validateDraft(draft)).toMatch(/лише одна/);
  });

  it('starts a typical question from a template, without prices', () => {
    const milk = draftOfTemplate(GROUP_TEMPLATES.find((t) => t.id === 'milk')!);
    expect(milk.required).toBe(true);
    expect(milk.answers.filter((a) => a.isDefault).map((a) => a.name)).toEqual(['звичайне']);
    expect(validateDraft(milk)).toBeNull();
    // «Просмаження» must be asked every time: required, and no usual answer.
    const doneness = draftOfTemplate(GROUP_TEMPLATES.find((t) => t.id === 'doneness')!);
    expect(doneness.required).toBe(true);
    expect(doneness.answers.some((a) => a.isDefault)).toBe(false);
    const syrup = draftOfTemplate(GROUP_TEMPLATES.find((t) => t.id === 'syrup')!);
    expect(ruleOf(syrup)).toEqual({ min_select: 0, max_select: 3 });
  });
});
