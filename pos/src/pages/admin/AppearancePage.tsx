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
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, Search } from 'lucide-react';
import { api, useAuthStore, useEnabledModules, resolveNavIcon, NAV_ICONS } from '@pos/platform';
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
    hint: 'Ліве меню адмінки. Воно текстове — іконок не показує.',
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
      <div>
        <h2 className="text-2xl font-semibold">Вигляд меню</h2>
        <p className="text-sq-secondary mt-1 text-sm max-w-2xl">
          Назва, порядок та іконка пунктів меню — окремо для каси та для адмінки. Які модулі
          взагалі є в магазині, вмикають на сторінці «Налаштування»; тут лише вигляд, тому
          жоден пункт не можна втратити.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Яке меню налаштовуємо"
        className="inline-flex rounded-sq border border-sq-divider bg-sq-empty p-1"
      >
        {LOCATIONS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={location === l.id}
            onClick={() => setLocation(l.id)}
            className={`px-4 py-1.5 text-sm font-medium rounded-[4px] transition-colors ${
              location === l.id
                ? 'bg-sq-surface text-sq-text shadow-sm'
                : 'text-sq-secondary hover:text-sq-text'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="text-sq-secondary text-sm -mt-3">{active?.hint}</p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] items-start">
        <div className="bg-sq-surface border border-sq-divider rounded-sq shadow-sm">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-sq-divider">
            <p className="sq-section-label">Пункти меню</p>
            <button
              type="button"
              onClick={resetLocation}
              disabled={!customisedHere}
              className="inline-flex items-center gap-1.5 rounded-sq border border-sq-divider px-2.5 py-1 text-xs text-sq-secondary hover:bg-sq-empty disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <RotateCcw size={13} strokeWidth={1.75} />
              Відновити типове
            </button>
          </div>

          {!loaded && <p className="px-5 py-6 text-sm text-sq-secondary">Завантаження…</p>}

          {loaded && entries.length === 0 && (
            <p className="px-5 py-6 text-sm text-sq-secondary">
              У цьому меню немає пунктів — увімкніть модулі на сторінці «Налаштування».
            </p>
          )}

          <ul className="divide-y divide-sq-divider">
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
        </div>

        <NavPreview location={location} entries={entries} overrides={draft} />
      </div>

      <div className="flex items-center gap-3 sticky bottom-0 bg-[#F5F5F5] py-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="sq-btn-primary px-4 py-2.5"
        >
          {saving ? 'Збереження…' : 'Зберегти'}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => setDraft(saved)}
            className="rounded-sq border border-sq-divider bg-sq-surface px-4 py-2.5 text-sm"
          >
            Скасувати зміни
          </button>
        )}
        {message && <p className="text-sm text-sq-blue font-medium">{message}</p>}
        {dirty && !message && (
          <p className="text-sm text-sq-secondary">
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
  const showIcon = location === 'cashier-primary';
  const effectiveIcon = override?.icon ?? entry.item.icon;

  return (
    <li
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverRow();
      }}
      className={`flex items-center gap-3 px-5 py-3 ${dragging ? 'opacity-50' : ''}`}
    >
      {/* Only the handle is the drag source: a draggable row would fight text
          selection inside the name field, and the arrows below are the path for
          anyone not using a mouse anyway. */}
      <span
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title="Перетягніть, щоб змінити порядок"
        className="shrink-0 text-sq-muted cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={16} strokeWidth={1.75} aria-hidden />
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
          className="w-full rounded-sq border border-sq-divider bg-sq-bg px-2.5 py-1.5 text-sm text-sq-text"
        />
        <p className="mt-1 text-xs text-sq-muted truncate">
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
          className="w-8 h-8 grid place-items-center rounded-sq text-sq-secondary hover:bg-sq-empty disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowUp size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Нижче"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          className="w-8 h-8 grid place-items-center rounded-sq text-sq-secondary hover:bg-sq-empty disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowDown size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={`Відновити типовий вигляд пункту «${entry.item.label}»`}
          title="Відновити типове"
          disabled={!override}
          onClick={onReset}
          className="w-8 h-8 grid place-items-center rounded-sq text-sq-secondary hover:bg-sq-empty disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <RotateCcw size={15} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}

const ICON_NAMES = Object.keys(NAV_ICONS).sort();

/**
 * The icon the host can actually draw — the hand-picked `NAV_ICONS` allowlist,
 * not all of lucide. Picking from what the app ships is the point: a name it
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
        className="w-9 h-9 grid place-items-center rounded-sq border border-sq-divider bg-sq-bg text-sq-text hover:bg-sq-empty"
      >
        {Icon ? <Icon size={18} strokeWidth={1.75} /> : <span className="text-xs text-sq-muted">—</span>}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 rounded-sq border border-sq-divider bg-sq-surface p-2 shadow-lg">
          <div className="flex items-center gap-1.5 rounded-sq border border-sq-divider bg-sq-bg px-2">
            <Search size={13} strokeWidth={1.75} className="text-sq-muted" aria-hidden />
            <input
              autoFocus
              aria-label="Пошук іконки"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук"
              className="w-full bg-transparent py-1.5 text-xs text-sq-text outline-none"
            />
          </div>

          <div className="mt-2 grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
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
                  className={`w-9 h-9 grid place-items-center rounded-sq hover:bg-sq-empty ${
                    selected === name ? 'bg-sq-empty ring-1 ring-sq-blue' : ''
                  }`}
                >
                  <Candidate size={17} strokeWidth={1.75} />
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
            className="mt-2 w-full rounded-sq border border-sq-divider px-2 py-1.5 text-xs text-sq-secondary hover:bg-sq-empty"
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
    icon: overrides[e.key]?.icon ?? e.item.icon,
  }));

  return (
    <div className="lg:sticky lg:top-8 space-y-2">
      <p className="sq-section-label">Попередній перегляд</p>

      {location === 'cashier-primary' ? (
        <div className="flex gap-3">
          <div className="w-14 shrink-0 rounded-sq bg-[#1A1A1A] py-3 flex flex-col items-center gap-1">
            {items.map((n, i) => {
              const Icon = resolveNavIcon(n.icon);
              return (
                <div
                  key={`${n.to}#${i}`}
                  title={n.label}
                  className={`w-12 h-12 grid place-items-center rounded-sq ${
                    i === 0 ? 'bg-white/15 text-white' : 'text-white/70'
                  }`}
                >
                  {Icon && <Icon size={22} strokeWidth={1.75} />}
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
                  className="flex items-center gap-2 text-sm text-sq-secondary truncate"
                >
                  {Icon && <Icon size={15} strokeWidth={1.75} className="shrink-0" />}
                  <span className="truncate">{n.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-sq border border-sq-divider bg-[#F0F0F0] p-2 space-y-0.5">
          {items.map((n, i) => (
            <div
              key={`${n.to}#${i}`}
              className={`px-3 py-2 rounded-[4px] text-sm font-medium truncate ${
                i === 0 ? 'sq-nav-active' : 'sq-nav-idle'
              }`}
            >
              {n.label}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-sq-muted">
        {location === 'cashier-primary'
          ? 'Ліворуч — бічна панель каси, праворуч ті самі пункти з підписами.'
          : 'Підписи без іконок — так це меню й виглядає.'}
      </p>
    </div>
  );
}
