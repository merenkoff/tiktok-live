// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The tag panel of the product list: the filter rows, the tag tree with each
// tag's own settings under it when it is the one selected, and the «add a
// subgroup» form. Moved out of `ProductsPage.tsx` unchanged (C1e, PR3).

import { FormEvent, type ReactNode, useState } from 'react';
import type { PosTag, TagColorKey, TagStation } from '@pos/platform';
import { Plus } from '@pos/platform/ui';
import { TagColorSwatches } from './TagColorSwatches';
import { TagDot } from './TagDot';
import { checkboxClass, panelFieldClass } from './formStyles';

export const MAX_TAG_DEPTH = 3;

/** One row of the tag panel that is not a tag: «Усі товари», «З приходу». */
export function FilterRow({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 min-h-[38px] px-2.5 rounded-lg text-left text-[15px] text-sq-text transition-colors ${
        active ? 'bg-sq-selected font-semibold' : 'font-medium hover:bg-sq-selected/50'
      }`}
    >
      <span className="w-5 h-5 grid place-items-center shrink-0">{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {count ? <span className="text-[13px] font-normal text-sq-muted tabular-nums">{count}</span> : null}
    </button>
  );
}

interface TagTreeCallbacks {
  onFilter: (id: number) => void;
  onColor: (tag: PosTag, color: TagColorKey) => void;
  onCatalogBar: (tag: PosTag, value: boolean) => void;
  onStation: (tag: PosTag, station: TagStation | null) => void;
  /** Show the «Станція» control — a café, where the kitchen ticket routes by it. */
  showStation: boolean;
  onCreateChild: (parentId: number, name: string) => Promise<void>;
}

export function TagTreeNode({
  tag,
  depth,
  filterTag,
  savingTagId,
  onFilter,
  onColor,
  onCatalogBar,
  onStation,
  showStation,
  onCreateChild,
}: TagTreeCallbacks & {
  tag: PosTag;
  depth: number;
  filterTag: number | 'all' | 'needs_review';
  savingTagId: number | null;
}) {
  const [adding, setAdding] = useState(false);
  const [childName, setChildName] = useState('');
  const children = tag.children ?? [];

  async function submitChild(e: FormEvent) {
    e.preventDefault();
    const name = childName.trim();
    if (!name) return;
    await onCreateChild(tag.id, name);
    setChildName('');
    setAdding(false);
  }

  return (
    <div className="space-y-0.5">
      <TagAdminRow
        tag={tag}
        nested={depth > 1}
        active={filterTag === tag.id}
        saving={savingTagId === tag.id}
        canAddChild={depth < MAX_TAG_DEPTH}
        onFilter={() => onFilter(tag.id)}
        onColor={(color) => onColor(tag, color)}
        onCatalogBar={(value) => onCatalogBar(tag, value)}
        onStation={showStation ? (station) => onStation(tag, station) : undefined}
        onAddChild={() => setAdding((v) => !v)}
      />
      {(adding || children.length > 0) && (
        <div className="pl-4 space-y-0.5">
          {children.map((child) => (
            <TagTreeNode
              key={child.id}
              tag={child}
              depth={depth + 1}
              filterTag={filterTag}
              savingTagId={savingTagId}
              onFilter={onFilter}
              onColor={onColor}
              onCatalogBar={onCatalogBar}
              onStation={onStation}
              showStation={showStation}
              onCreateChild={onCreateChild}
            />
          ))}
          {adding && (
            <form onSubmit={(e) => void submitChild(e)} className="flex gap-1.5 py-1 pr-1">
              <input
                autoFocus
                className={panelFieldClass}
                placeholder={`Підгрупа в «${tag.name}»`}
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                required
              />
              <button type="submit" className="pos-btn-primary min-h-11 px-3.5 rounded-sq text-[15px] shrink-0">
                OK
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function TagAdminRow({
  tag,
  nested,
  active,
  saving,
  canAddChild,
  onFilter,
  onColor,
  onCatalogBar,
  onStation,
  onAddChild,
}: {
  tag: PosTag;
  nested?: boolean;
  active: boolean;
  saving: boolean;
  canAddChild: boolean;
  onFilter: () => void;
  onColor: (color: TagColorKey) => void;
  onCatalogBar: (value: boolean) => void;
  /** Present only where a station means something (a café). */
  onStation?: (station: TagStation | null) => void;
  onAddChild: () => void;
}) {
  return (
    <div className={saving ? 'opacity-60' : ''}>
      <div
        className={`flex items-center rounded-lg transition-colors ${
          active ? 'bg-sq-selected' : 'hover:bg-sq-selected/50'
        }`}
      >
        <button
          type="button"
          onClick={onFilter}
          className={`flex-1 min-w-0 flex items-center gap-2.5 min-h-[38px] pl-2.5 pr-1 text-left text-[15px] ${
            active ? 'font-semibold' : 'font-medium'
          } ${nested && !active ? 'text-sq-secondary' : 'text-sq-text'}`}
        >
          <span className="w-5 h-5 grid place-items-center shrink-0">
            <TagDot color={tag.color} size="md" />
          </span>
          <span className="truncate">{tag.name}</span>
          {tag.show_in_catalog_bar && (
            <span className="text-xs font-normal text-sq-muted shrink-0">рядок</span>
          )}
        </button>
        {canAddChild && (
          <button
            type="button"
            onClick={onAddChild}
            title="Додати підгрупу"
            aria-label="Додати підгрупу"
            className="shrink-0 w-8 h-8 mr-1 grid place-items-center rounded-md text-sq-muted hover:text-sq-blue hover:bg-sq-surface/70"
          >
            <Plus size={16} />
          </button>
        )}
      </div>
      {active && (
        <div className="pl-[42px] pr-2 pt-2 pb-3 space-y-2.5">
          <TagColorSwatches
            value={tag.color}
            onChange={onColor}
            size="sm"
          />
          <label className="flex items-center gap-2 text-[13px] text-sq-secondary cursor-pointer">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={tag.show_in_catalog_bar}
              disabled={saving}
              onChange={(e) => onCatalogBar(e.target.checked)}
            />
            У рядку категорій
          </label>
          {onStation && (
            <div
              className="flex flex-wrap items-center gap-2 text-[13px] text-sq-secondary"
              data-testid={`tag-station-${tag.id}`}
            >
              <span>Станція:</span>
              <div className="inline-flex gap-0.5 p-[2px] rounded-lg bg-sq-empty">
                {STATION_CHOICES.map(([value, label]) => {
                  const current = tag.station ?? null;
                  const on = current === value;
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={saving}
                      aria-pressed={on}
                      onClick={() => {
                        if (!on) onStation(value);
                      }}
                      className={`h-7 px-2.5 rounded-md text-[13px] transition-colors ${
                        on
                          ? 'bg-sq-surface shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                          : 'font-medium text-sq-secondary hover:text-sq-text'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** «—» clears the station; the ticket then goes to the kitchen by default. */
const STATION_CHOICES: ReadonlyArray<[TagStation | null, string]> = [
  [null, '—'],
  ['kitchen', 'Кухня'],
  ['bar', 'Бар'],
];
