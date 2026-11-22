// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Доступ до каси» on «Співробітники» (TechDocs/POS_STAFF_SECTIONS.md): what
// the owner can close for one person, and how the till will look after.
// Pure — the dialog only draws what this works out.
//
// A section is a module: the store's own till decides which there are, so the
// list is read off the modules this store runs, the way the till's rail is
// built (`selectNavItems`), never typed by hand — a module connected tomorrow
// shows up here by itself.

import type { AnyModuleDescriptor } from '../../modules/registry';
import { selectNavItems } from '../../modules/selectNav';
import { ALWAYS_OPEN_SECTION } from '../../modules/staffSections';
import type { NavOverrides } from '../../modules/navOverrides';
import type { ModuleId, NavItem } from '../../modules/types';
import type { PosShell } from '../../shell';

export interface TillSection {
  moduleId: string;
  /** The rail's own name for it — the owner's «Вигляд меню» rename included. */
  label: string;
  icon: NavItem['icon'];
  /** One sentence: what is in there. */
  words: string;
  /** «Каса»: never closed, drawn with a lock. */
  locked: boolean;
  /** Only hidden from the menu: the server still lets the till use it while selling. */
  hideOnly: boolean;
  /** The other entries the same section puts on the rail («Замовлення», «Пляшки»). */
  alsoLabels: string[];
}

/** What each section holds, in the owner's words. A module not listed gets its own title. */
const SECTION_WORDS: Record<string, string> = {
  'catalog-checkout': 'Продаж, замовлення наперед, пляшки. Відкрита завжди — без неї нічим продавати.',
  customers: 'Картки покупців. Обрати покупця в чеку можна й без цього розділу.',
  returns: 'Чеки зміни, повернення й обмін.',
  hardware: 'Принтери, сканер, оновлення каси. Друк працює й без цього розділу.',
  debts: 'Борги покупців: «Під запис», погашення, повернення товару.',
  tables: 'Зал, рахунки столів, замовлення й виклики гостей з QR.',
  stocktake: 'Перерахунок товару на полиці.',
  'vertical-cafe': 'Екран кухні: «Готово», «Видано», стоп-лист.',
  'vertical-flowers': 'Вітрина букетів: на вітрину, фото, списання.',
  'tiktok-live': 'Коментарі TikTok і запуск прямого ефіру.',
  'fiscal-checkbox': 'Зміна ПРРО: відкрити, закрити, X-звіт, передати касу.',
  'fiscal-cashalot': 'Зміна ПРРО: відкрити, закрити, X-звіт, передати касу.',
};

/** Sections the server leaves usable while selling — closing them only hides the menu entry. */
const HIDE_ONLY = new Set(['customers', 'hardware']);

/** The shells a cashier sells in, the desktop first: its rail is the one drawn. */
const SHELLS: PosShell[] = ['cashier', 'web', 'tablet'];

/**
 * Every section of this store's till a cashier would see, in the rail's order:
 * one row per module, named and drawn as its first rail entry.
 */
export function tillSections(
  modules: readonly AnyModuleDescriptor[],
  enabled: ReadonlySet<ModuleId>,
  overrides: NavOverrides = {}
): TillSection[] {
  const seen = new Map<string, { section: TillSection; order: number }>();
  for (const shell of SHELLS) {
    for (const m of modules) {
      if (seen.has(m.id)) continue;
      const items = selectNavItems([m], enabled, { shell, role: 'seller', variant: 'rail' }, 'cashier-primary', overrides);
      if (items.length === 0) continue;
      const [first, ...rest] = items;
      seen.set(m.id, {
        order: first.order,
        section: {
          moduleId: m.id,
          label: first.label,
          icon: first.icon,
          words: SECTION_WORDS[m.id] ?? `Розділ «${m.title}».`,
          locked: m.id === ALWAYS_OPEN_SECTION,
          hideOnly: HIDE_ONLY.has(m.id),
          alsoLabels: rest.map((n) => n.label),
        },
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.order - b.order).map((entry) => entry.section);
}

/** The desktop till's rail as this person will see it once `blocked` is saved. */
export function railPreview(
  modules: readonly AnyModuleDescriptor[],
  enabled: ReadonlySet<ModuleId>,
  blocked: ReadonlySet<string>,
  overrides: NavOverrides = {}
): NavItem[] {
  return selectNavItems(modules, enabled, { shell: 'cashier', role: 'seller', variant: 'rail', blocked }, 'cashier-primary', overrides);
}

/**
 * The row's summary on «Співробітники»: the names of what is closed, in the
 * rail's order. A closed id this store's till no longer has (a module taken
 * off) is left out — there is nothing of it to hide.
 */
export function closedLabels(blocked: readonly string[] | undefined, sections: readonly TillSection[]): string[] {
  if (!blocked || blocked.length === 0) return [];
  const closed = new Set(blocked);
  return sections.filter((s) => !s.locked && closed.has(s.moduleId)).map((s) => s.label);
}

/** The list as it is sent: sorted, «Каса» never in it. */
export function toBlockedList(draft: ReadonlySet<string>): string[] {
  return [...draft].filter((id) => id !== ALWAYS_OPEN_SECTION).sort();
}

/** Whether two lists close the same sections. */
export function sameSections(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const x = [...(a ?? [])].sort();
  const y = [...(b ?? [])].sort();
  return x.length === y.length && x.every((id, i) => id === y[i]);
}
