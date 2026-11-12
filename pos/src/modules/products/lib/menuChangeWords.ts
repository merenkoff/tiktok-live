// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The journal's rows in words (TechDocs/POS_MENU_CHANGES.md). The server keeps
// field codes and raw values — cents, codes, arrays — so this is the one place
// that turns «variant.price_cents 5500 → 6000» into «Ціна (M): 55,00 ₴ → 60,00 ₴».
// Pure: no React, no store.

import { formatUah } from '../../../lib/money';
import { ALLERGENS } from '../components/allergens';
import { MENU_LABELS } from '../components/menuLabels';
import type { MenuAction, MenuChange, MenuChangeRow } from '../data/menuChangesApi';

type Kind = 'text' | 'money' | 'bool' | 'list' | 'allergens' | 'labels' | 'kind' | 'mode' | 'register' | 'tenths' | 'number';

const FIELDS: Record<string, { label: string; kind: Kind }> = {
  name: { label: 'Назва', kind: 'text' },
  description: { label: 'Опис', kind: 'text' },
  composition: { label: 'Склад', kind: 'text' },
  allergens: { label: 'Алергени', kind: 'allergens' },
  menu_labels: { label: 'Позначки в QR-меню', kind: 'labels' },
  kcal: { label: 'Калорійність, ккал', kind: 'number' },
  strength_tenths: { label: 'Міцність', kind: 'tenths' },
  prep_minutes: { label: 'Готується, хв', kind: 'number' },
  image_url: { label: 'Фото', kind: 'text' },
  menu_hidden: { label: 'Не показувати в QR-меню', kind: 'bool' },
  sellable: { label: 'Продається на касі', kind: 'bool' },
  kind: { label: 'Тип товару', kind: 'kind' },
  stock_mode: { label: 'Склад складеного товару', kind: 'mode' },
  fiscal_register: { label: 'Каса', kind: 'register' },
  fiscal_excise: { label: 'Підакцизний', kind: 'bool' },
  excise_per_unit: { label: 'Марка на кожну одиницю', kind: 'bool' },
  fiscal_uktzed: { label: 'УКТ ЗЕД', kind: 'text' },
  tags: { label: 'Мітки', kind: 'list' },
  modifier_groups: { label: 'Модифікатори', kind: 'list' },
  'variant.label': { label: 'Назва варіанта', kind: 'text' },
  'variant.unit': { label: 'Одиниця', kind: 'text' },
  'variant.price_cents': { label: 'Ціна', kind: 'money' },
  'variant.compare_at_cents': { label: 'Стара ціна', kind: 'money' },
  'variant.cost_cents': { label: 'Закупівельна ціна', kind: 'money' },
  'variant.sku': { label: 'Артикул', kind: 'text' },
  'variant.barcode': { label: 'Штрихкод', kind: 'text' },
  'variant.pack_qty': { label: 'Фасування, кількість', kind: 'number' },
  'variant.pack_label': { label: 'Фасування', kind: 'text' },
  'variant.bottle_ml': { label: 'Пляшка за маркою, мл', kind: 'number' },
  'variant.is_active': { label: 'Варіант у продажу', kind: 'bool' },
  'variant.recipe': { label: 'Техкарта', kind: 'list' },
  'group.name': { label: 'Назва групи', kind: 'text' },
  'group.min_select': { label: 'Обрати щонайменше', kind: 'number' },
  'group.max_select': { label: 'Обрати щонайбільше', kind: 'number' },
  'group.is_active': { label: 'Група діє', kind: 'bool' },
  'modifier.name': { label: 'Назва відповіді', kind: 'text' },
  'modifier.price_delta_cents': { label: 'Доплата', kind: 'money' },
  'modifier.label_deltas': { label: 'Доплата за розміром', kind: 'text' },
  'modifier.is_default': { label: 'За замовчуванням', kind: 'bool' },
  'modifier.is_active': { label: 'Відповідь діє', kind: 'bool' },
  'modifier.component': { label: 'Що списує', kind: 'text' },
};

const ACTIONS: Record<MenuAction, string> = {
  create: 'створено',
  update: 'змінено',
  archive: 'в архіві',
  restore: 'повернуто з архіву',
  delete: 'видалено',
};

const ROLES: Record<string, string> = {
  owner: 'власник',
  seller: 'продавець',
  marketer: 'маркетолог',
};

function byCode(list: ReadonlyArray<{ code: string; label: string }>, codes: unknown): string {
  if (!Array.isArray(codes) || codes.length === 0) return '—';
  return codes.map((code) => list.find((x) => x.code === code)?.label ?? String(code)).join(', ');
}

/** One value of a field, the way the owner reads it. */
export function formatValue(kind: Kind, value: unknown): string {
  if (value == null || value === '') return '—';
  switch (kind) {
    case 'money':
      return typeof value === 'number' ? formatUah(value) : String(value);
    case 'bool':
      return value === true ? 'так' : 'ні';
    case 'list':
      return Array.isArray(value) && value.length > 0 ? value.map(String).join(', ') : '—';
    case 'allergens':
      return byCode(ALLERGENS, value);
    case 'labels':
      return byCode(MENU_LABELS, value);
    case 'kind':
      return value === 'composite' ? 'складений' : 'простий';
    case 'mode':
      return value === 'derived' ? 'збираємо при продажу' : 'збираємо заздалегідь';
    case 'register':
      return `каса ${String(value)}`;
    case 'tenths':
      return typeof value === 'number' ? `${(value / 10).toLocaleString('uk-UA')} %` : String(value);
    case 'number':
      return String(value);
    default:
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
  }
}

/** One line of a row: «Ціна (M): 55,00 ₴ → 60,00 ₴». */
export function describeChange(change: MenuChange): string {
  const where = change.variant ? ` (${change.variant})` : '';
  if (change.field === 'variant_added') {
    return `Новий варіант${change.variant ? ` «${change.variant}»` : ''}: ${formatValue('money', change.to)}`;
  }
  if (change.field === 'modifier_added') {
    return `Нова відповідь «${change.variant ?? ''}»: доплата ${formatValue('money', change.to)}`;
  }
  if (change.field === 'modifier_removed') return `Прибрано відповідь «${change.variant ?? ''}»`;
  const spec = FIELDS[change.field] ?? { label: change.field, kind: 'text' as Kind };
  if (spec.kind === 'text' && (change.field === 'description' || change.field === 'composition')) {
    // Long text: say that it changed, and what it says now.
    return `${spec.label}${where}: ${formatValue('text', change.to)}`;
  }
  if (change.field === 'image_url') return change.to ? `Фото${where} замінено` : `Фото${where} прибрано`;
  return `${spec.label}${where}: ${formatValue(spec.kind, change.from)} → ${formatValue(spec.kind, change.to)}`;
}

/** «Оля (маркетолог)». */
export function authorOf(row: Pick<MenuChangeRow, 'staff_name' | 'staff_role'>): string {
  const role = ROLES[row.staff_role];
  return role ? `${row.staff_name} (${role})` : row.staff_name;
}

export function actionWord(action: MenuAction): string {
  return ACTIONS[action] ?? action;
}

/** «12.11.2026, 14:05» on the device's clock. */
export function whenText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
