// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * «Вигляд меню» — the owner customises the navigation menus of their own store:
 * the cashier's left rail (and its phone bottom bar) and the admin sidebar.
 * Name, position and icon; nothing else. *Which* entries exist stays where it
 * belongs — the module checklist on «Налаштування» — so nothing on this screen
 * can strand a store without a till or without its settings.
 *
 * It is its own page rather than another card on the settings form because it
 * is direct manipulation, not a form: you drag the thing you are looking at and
 * the preview beside it is the real rail, rendered from the same `NavItem`s the
 * cashier gets. See TechDocs/POS_NAV_CUSTOMIZATION.md.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, Search, Sparkles } from '../../platform/glyphs';
import { PageHeader, SectionHead } from '../../components/ui/Page';
import { api, useAuthStore, useEnabledModules, resolveNavIcon, NAV_ICONS } from '@pos/platform';
import { adminIconOf } from '../../modules/navGroups';
import { allModules } from '../../modules/registry';
import {
  collectNavEntries,
  NAV_LABEL_MAX,
  type NavCatalogEntry,
  type NavOverride,
  type NavOverrides,
} from '../../modules/navOverrides';
import type { NavItem, NavLocation } from '../../modules/types';

const LOCATIONS: Array<{ id: NavLocation; label: string; hint: string }> = [
  {
    id: 'cashier-primary',
    label: 'Каса',
    hint: 'Бічна панель каси та нижня панель на телефоні. Тут видно іконки.',
  },
  {
    id: 'admin-sidebar',
    label: 'Адмінка',
    hint: 'Ліве меню адмінки: іконка й назва пункту, у групах.',
  },
];

/** Two overrides mean the same thing — key order and absent fields included. */
function sameOverrides(a: NavOverrides, b: NavOverrides): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key] ?? {};
    const y = b[key] ?? {};
    if (x.label !== y.label || x.icon !== y.icon || x.order !== y.order) return false;
  }
  return true;
}

/** Write one field of one entry; an override left with no fields is removed. */
function patchOverride(
  overrides: NavOverrides,
  key: string,
  patch: Partial<NavOverride>
): NavOverrides {
  const next = { ...overrides };
  const entry: NavOverride = { ...next[key] };
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined || value === '') delete entry[field as keyof NavOverride];
    else Object.assign(entry, { [field]: value });
  }
  if (Object.keys(entry).length === 0) delete next[key];
  else next[key] = entry;
  return next;
}

/**
 * Store `keys` as the display order of one menu — unless that is already the
 * order the modules themselves ask for, in which case the explicit `order`
 * fields are dropped instead. Dragging an entry back where it started leaves
 * no trace, which is what makes «Відновити типове» honest.
 */
function withOrder(
  overrides: NavOverrides,
  keys: readonly string[],
  defaultKeys: readonly string[]
): NavOverrides {
  const natural = keys.length === defaultKeys.length && keys.every((k, i) => k === defaultKeys[i]);
  let next = overrides;
  keys.forEach((key, i) => {
    next = patchOverride(next, key, { order: natural ? undefined : i * 10 });
  });
  return next;
}

/** «лише власник», «лише десктоп-каса»… — where an entry actually shows up. */
function scopeHints(entry: NavCatalogEntry, location: NavLocation): string[] {
  const hints: string[] = [];
  // The whole `/admin` area is behind the owner guard, so saying it again there
  // would be noise; in the till rail it is real information.
  if (entry.scope.ownerOnly && location === 'cashier-primary') hints.push('лише власник');
  if (entry.scope.shellOnly === 'cashier') hints.push('лише десктоп-каса');
  if (entry.scope.shellOnly === 'web') hints.push('лише у браузері');
  if (entry.scope.shellOnly === 'tablet') hints.push('лише планшет');
  if (entry.scope.variantOnly === 'rail') hints.push('лише бічна панель');
  if (entry.scope.variantOnly === 'bottom') hints.push('лише нижня панель');
  return hints;
}

export function AppearancePage() {
  const enabled = useEnabledModules();
  const [location, setLocation] = useState<NavLocation>('cashier-primary');
  const [draft, setDraft] = useState<NavOverrides>({});
  const [saved, setSaved] = useState<NavOverrides>({});
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);

  useEffect(() => {
    void api.getStore().then((store) => {
      const overrides = store.nav_overrides ?? {};
      setDraft(overrides);
      setSaved(overrides);
      setLoaded(true);
    });
  }, []);

  // Sorted by the draft, so the list, the preview and the till always agree.
  const entries = useMemo(
    () => collectNavEntries(allModules(), enabled, location, draft),
    [enabled, location, draft]
  );
  const defaultKeys = useMemo(
    () =>
      [...entries]
        .sort((a, b) => a.item.order - b.item.order)
        .map((e) => e.key),
    [entries]
  );

  const dirty = !sameOverrides(draft, saved);
  const customisedHere = entries.some((e) => draft[e.key]);

  function move(from: number, to: number) {
    if (to < 0 || to >= entries.length || from === to) return;
    const keys = entries.map((e) => e.key);
    const [moved] = keys.splice(from, 1);
    keys.splice(to, 0, moved);
    setDraft((prev) => withOrder(prev, keys, defaultKeys));
  }

  function resetEntry(key: string) {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** Reset the menu currently on screen; the other one keeps its own settings. */
  function resetLocation() {
    setDraft((prev) => {
      const next = { ...prev };
      for (const entry of entries) delete next[entry.key];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const store = await api.updateStore({ nav_overrides: draft });
      // The server sanitises: an entry it rejected is simply absent from the
      // answer, so adopt what came back rather than what we sent.
      const stored = store.nav_overrides ?? {};
      setDraft(stored);
      setSaved(stored);
      // Refresh this tab's session so the sidebar changes under the cursor.
      void useAuthStore.getState().bootstrap();
      setMessage('Збережено');
    } catch {
      setMessage('Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  const active = LOCATIONS.find((l) => l.id === location);

  return (
    <div className="space-y-6 animate-fade-up text-sq-text">
      <PageHeader
        glyph={Sparkles}
        title="Вигляд меню"
        subtitle="Назва, порядок та іконка пунктів меню — окремо для каси та для адмінки. Які модулі взагалі є в магазині, вмикають на сторінці «Налаштування»; тут лише вигляд, тому жоден пункт не можна втратити."
      />

      <div className="space-y-2.5">
        {/* Tabs rather than `Segmented`: the two menus are two views of one
            editor, and the tab roles are what the tests and screen readers use. */}
        <div
          role="tablist"
          aria-label="Яке меню налаштовуємо"
          className="inline-flex gap-1 p-[3px] rounded-xl bg-sq-empty"
        >
          {LOCATIONS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={location === l.id}
              onClick={() => setLocation(l.id)}
              className={`min-h-[34px] px-3.5 rounded-[9px] text-[15px] transition-colors ${
                location === l.id
                  ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                  : 'font-medium text-sq-secondary hover:text-sq-text'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="text-[15px] text-sq-secondary">{active?.hint}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] items-start">
        <section>
          <SectionHead
            title="Пункти меню"
            action={
              <button
                type="button"
                onClick={resetLocation}
                disabled={!customisedHere}
                className="inline-flex items-center gap-1.5 min-h-8 disabled:text-sq-muted disabled:opacity-60"
              >
                <RotateCcw size={16} />
                Відновити типове
              </button>
            }
          />

          {!loaded && <p className="py-4 text-[15px] text-sq-secondary">Завантаження…</p>}

          {loaded && entries.length === 0 && (
            <p className="py-4 text-[15px] text-sq-secondary">
              У цьому меню немає пунктів — увімкніть модулі на сторінці «Налаштування».
            </p>
          )}

          <ul>
            {entries.map((entry, index) => (
              <NavEntryRow
                key={entry.key}
                entry={entry}
                index={index}
                total={entries.length}
                location={location}
                override={draft[entry.key]}
                dragging={dragKey === entry.key}
                onDragStart={() => setDragKey(entry.key)}
                onDragEnd={() => setDragKey(null)}
                onDragOverRow={() => {
                  if (!dragKey || dragKey === entry.key) return;
                  const from = entries.findIndex((e) => e.key === dragKey);
                  if (from >= 0) move(from, index);
                }}
                onMove={(delta) => move(index, index + delta)}
                onLabel={(label) =>
                  setDraft((prev) => patchOverride(prev, entry.key, { label }))
                }
                onIcon={(icon) => setDraft((prev) => patchOverride(prev, entry.key, { icon }))}
                onReset={() => resetEntry(entry.key)}
              />
            ))}
          </ul>
        </section>

        <NavPreview location={location} entries={entries} overrides={draft} />
      </div>

      <div className="flex flex-wrap items-center gap-3 sticky bottom-0 py-3 bg-sq-surface shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]"
        >
          {saving ? 'Збереження…' : 'Зберегти'}
        </button>
        {dirty && (
          <button type="button" onClick={() => setDraft(saved)} className="sq-btn-quiet">
            Скасувати зміни
          </button>
        )}
        {message && (
          <p
            className={`text-[15px] font-medium ${
              message === 'Збережено' ? 'text-sq-success-ink' : 'text-red-600'
            }`}
          >
            {message}
          </p>
        )}
        {dirty && !message && (
          <p className="text-[15px] text-sq-secondary">
            Каси підхоплять зміни після наступного входу.
          </p>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  entry: NavCatalogEntry;
  index: number;
  total: number;
  location: NavLocation;
  override: NavOverride | undefined;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverRow: () => void;
  onMove: (delta: number) => void;
  onLabel: (label: string) => void;
  onIcon: (icon: string | undefined) => void;
  onReset: () => void;
}

function NavEntryRow({
  entry,
  index,
  total,
  location,
  override,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onMove,
  onLabel,
  onIcon,
  onReset,
}: RowProps) {
  const hints = scopeHints(entry, location);
  const showIcon = true;
  const effectiveIcon = override?.icon ?? (location === 'admin-sidebar' ? adminIconOf(entry.item) : entry.item.icon);

  return (
    <li
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverRow();
      }}
      className={`sq-row flex items-center gap-3 py-2.5 ${dragging ? 'opacity-50' : ''}`}
    >
      {/* Only the handle is the drag source: a draggable row would fight text
          selection inside the name field, and the arrows below are the path for
          anyone not using a mouse anyway. */}
      <span
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title="Перетягніть, щоб змінити порядок"
        className="shrink-0 -ml-1 p-1 text-sq-muted cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={16} aria-hidden />
      </span>

      {showIcon && (
        <IconPicker
          value={effectiveIcon}
          label={override?.label ?? entry.item.label}
          onChange={onIcon}
        />
      )}

      <div className="min-w-0 flex-1">
        <input
          aria-label={`Назва пункту «${entry.item.label}»`}
          value={override?.label ?? ''}
          placeholder={entry.item.label}
          maxLength={NAV_LABEL_MAX}
          onChange={(e) => onLabel(e.target.value)}
          className="sq-input"
        />
        <p className="mt-1 text-[13px] text-sq-muted truncate">
          {entry.moduleTitle} · {entry.item.to}
          {hints.length > 0 && ` · ${hints.join(', ')}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="Вище"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowUp size={20} />
        </button>
        <button
          type="button"
          aria-label="Нижче"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowDown size={20} />
        </button>
        <button
          type="button"
          aria-label={`Відновити типовий вигляд пункту «${entry.item.label}»`}
          title="Відновити типове"
          disabled={!override}
          onClick={onReset}
          className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <RotateCcw size={20} />
        </button>
      </div>
    </li>
  );
}

const ICON_NAMES = Object.keys(NAV_ICONS).sort();

/**
 * The icon the host can actually draw — the hand-picked `NAV_ICONS` allowlist,
 * not every icon there is. Picking from what the app ships is the point: a name it
 * does not have would silently fall back to a placeholder glyph on the till.
 */
function IconPicker({
  value,
  label,
  onChange,
}: {
  /** Whatever the entry currently shows — a name, or a component an in-tree manifest passed directly. */
  value: NavItem['icon'];
  label: string;
  onChange: (icon: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const Icon = resolveNavIcon(value);
  // Only a named icon can be marked as the current choice in the grid; a
  // component reference is drawn on the button and matches nothing there.
  const selected = typeof value === 'string' ? value : undefined;

  useEffect(() => {
    if (!open) return;
    function onDocument(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocument);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocument);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shown = query.trim()
    ? ICON_NAMES.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase()))
    : ICON_NAMES;

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Іконка пункту «${label}»`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-11 h-11 grid place-items-center rounded-sq bg-sq-empty text-sq-text hover:bg-sq-selected"
      >
        {Icon ? <Icon size={24} /> : <span className="text-[13px] text-sq-muted">—</span>}
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-72 rounded-xl bg-sq-surface p-2.5 shadow-[0_12px_32px_rgba(0,20,60,.18),0_0_2px_rgba(0,0,0,.12)]">
          <div className="flex items-center gap-2 rounded-sq bg-sq-empty px-2.5">
            <Search size={16} className="text-sq-muted" aria-hidden />
            <input
              autoFocus
              aria-label="Пошук іконки"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук"
              className="w-full min-h-9 bg-transparent text-[15px] text-sq-text outline-none"
            />
          </div>

          <div className="mt-2 grid grid-cols-6 gap-1 max-h-56 overflow-y-auto">
            {shown.map((name) => {
              const Candidate = NAV_ICONS[name as keyof typeof NAV_ICONS];
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={name}
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  className={`w-10 h-10 grid place-items-center rounded-sq hover:bg-sq-empty ${
                    selected === name ? 'bg-sq-selected ring-2 ring-inset ring-sq-blue' : ''
                  }`}
                >
                  <Candidate size={24} />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
            className="sq-btn-quiet mt-2 w-full"
          >
            Типова іконка
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The menu as it will look, rendered from the same values the till gets. It is
 * a picture of one surface, not of every context: entries only some people see
 * are all drawn here, and the list beside it says which are which.
 */
function NavPreview({
  location,
  entries,
  overrides,
}: {
  location: NavLocation;
  entries: NavCatalogEntry[];
  overrides: NavOverrides;
}) {
  const items: NavItem[] = entries.map((e) => ({
    ...e.item,
    label: overrides[e.key]?.label ?? e.item.label,
    icon: overrides[e.key]?.icon ?? (location === 'admin-sidebar' ? adminIconOf(e.item) : e.item.icon),
  }));

  return (
    <section className="lg:sticky lg:top-8 space-y-3">
      <SectionHead title="Попередній перегляд" />

      {location === 'cashier-primary' ? (
        <div className="flex gap-3">
          <div className="w-[84px] shrink-0 rounded-card bg-sq-sidebar border border-sq-divider/70 py-2 flex flex-col items-center gap-1">
            {items.map((n, i) => {
              const Icon = resolveNavIcon(n.icon);
              return (
                <div
                  key={`${n.to}#${i}`}
                  title={n.label}
                  className={`w-[68px] min-h-[56px] py-1.5 flex flex-col items-center justify-center gap-1 rounded-xl ${
                    i === 0 ? 'bg-sq-selected' : ''
                  }`}
                >
                  {Icon && <Icon size={24} />}
                  <span className="max-w-[64px] text-center text-[10px] font-semibold leading-tight text-sq-secondary break-words">
                    {n.label}
                  </span>
                </div>
              );
            })}
          </div>

          <ul className="flex-1 min-w-0 space-y-1">
            {items.map((n, i) => {
              const Icon = resolveNavIcon(n.icon);
              return (
                <li
                  key={`${n.to}#${i}`}
                  className="flex items-center gap-2 text-[15px] text-sq-secondary truncate"
                >
                  {Icon && <Icon size={24} className="shrink-0" />}
                  <span className="truncate">{n.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-card border border-sq-divider/70 bg-sq-sidebar p-2 space-y-0.5">
          {items.map((n, i) => {
            const Icon = resolveNavIcon(n.icon);
            return (
              <div
                key={`${n.to}#${i}`}
                className={`flex items-center gap-2.5 min-h-[36px] px-2.5 rounded-lg text-sm truncate ${
                  i === 0 ? 'bg-sq-selected font-semibold' : 'font-medium'
                }`}
              >
                {Icon && <Icon size={24} className="shrink-0" />}
                <span className="truncate">{n.label}</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[13px] text-sq-muted">
        {location === 'cashier-primary'
          ? 'Ліворуч — бічна панель каси, праворуч ті самі пункти списком.'
          : 'Так пункти виглядають у лівому меню адмінки; групи вона розставляє сама.'}
      </p>
    </section>
  );
}
