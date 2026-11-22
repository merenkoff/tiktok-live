// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Що бачить Оля на касі» — the owner closes the till's sections for one
// person (TechDocs/POS_STAFF_SECTIONS.md). Left: a tile per section of THIS
// store's till, drawn with the rail's own glyph and name, a sentence of what
// is in it and a switch. Right: the till's rail as that person will see it,
// redrawn on every tap — the owner sees the effect before saving it.
// One save, one PATCH; the server refuses a closed section's actions on the
// person's very next request.

import { useMemo, useState } from 'react';
import axios from 'axios';
import { api, resolveNavIcon, useEnabledModules } from '@pos/platform';
import { Lock } from '../../platform/glyphs';
import { Dialog } from '../../modules/products/components/Dialog';
import { allModules } from '../../modules/registry';
import { useNavOverrides } from '../../modules/useNavOverrides';
import type { NavItem } from '../../modules/types';
import type { StaffMember } from '../../types';
import { railPreview, sameSections, tillSections, toBlockedList, type TillSection } from './staffAccess';

function serverSentence(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const text = (error.response?.data as { error?: unknown } | undefined)?.error;
    if (typeof text === 'string' && text.trim() !== '') return text;
  }
  return 'Не вдалося зберегти. Перевірте звʼязок і спробуйте ще раз.';
}

/** An iOS-style switch, drawn — the tile itself is the control. */
function Switch({ on, locked }: { on: boolean; locked: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative shrink-0 w-[46px] h-[28px] rounded-full transition-colors ${
        on ? (locked ? 'bg-[#34c759]/45' : 'bg-[#34c759]') : 'bg-black/[0.12]'
      }`}
    >
      <span
        className={`absolute top-[2px] w-6 h-6 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,.2)] transition-[left] ${
          on ? 'left-[20px]' : 'left-[2px]'
        }`}
      />
    </span>
  );
}

function SectionTile({ section, open, onToggle }: { section: TillSection; open: boolean; onToggle: () => void }) {
  const Icon = resolveNavIcon(section.icon);
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-disabled={section.locked || undefined}
        aria-label={`${section.label}: ${open ? 'відкрито' : 'закрито'}`}
        onClick={section.locked ? undefined : onToggle}
        data-testid={`section-${section.moduleId}`}
        className={`w-full text-left flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
          section.locked ? 'cursor-default' : 'hover:bg-sq-sidebar'
        } ${open ? '' : 'bg-sq-empty/60'}`}
      >
        <span
          className={`w-12 h-12 shrink-0 rounded-[14px] grid place-items-center bg-white ring-1 ring-inset ring-sq-divider transition-[filter,opacity] ${
            open ? '' : 'grayscale opacity-45'
          }`}
        >
          {Icon && <Icon size={30} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`text-base font-semibold ${open ? 'text-sq-text' : 'text-sq-secondary line-through decoration-1'}`}>
              {section.label}
            </span>
            {section.locked && (
              <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md bg-sq-sidebar text-xs font-semibold text-sq-secondary">
                <Lock size={13} />
                Завжди
              </span>
            )}
            {section.hideOnly && !section.locked && (
              <span className="h-[22px] px-2 rounded-md ring-1 ring-inset ring-sq-divider text-xs font-medium text-sq-muted inline-flex items-center">
                лише ховається
              </span>
            )}
          </span>
          <span className="block text-[13px] leading-snug text-sq-secondary mt-0.5">{section.words}</span>
          {section.alsoLabels.length > 0 && (
            <span className="block text-[12px] text-sq-muted mt-0.5">Разом із: {section.alsoLabels.join(', ')}</span>
          )}
        </span>
        <Switch on={open} locked={section.locked} />
      </button>
    </li>
  );
}

/** The desktop till's rail as this person will see it — the same glyphs, names and order. */
export function RailPreview({ items, name, total }: { items: NavItem[]; name: string; total: number }) {
  return (
    <aside aria-label={`Так побачить ${name}`} data-testid="rail-preview" className="lg:w-[132px] shrink-0">
      <p className="text-xs font-semibold text-sq-muted mb-2">Так побачить {name}</p>
      <div className="rounded-[22px] bg-sq-sidebar ring-1 ring-inset ring-sq-divider p-2 flex flex-row flex-wrap lg:flex-col items-center justify-center gap-1">
        {items.map((n, i) => {
          const Icon = resolveNavIcon(n.icon);
          return (
            <div
              key={n.to}
              data-testid="rail-preview-item"
              className={`w-[68px] min-h-[62px] py-2 flex flex-col items-center justify-center gap-1 rounded-xl animate-fade-up ${
                i === 0 ? 'bg-sq-selected' : ''
              }`}
            >
              {Icon && <Icon size={24} />}
              <span
                className={`max-w-[64px] text-center text-[11px] font-semibold leading-[1.15] hyphens-auto break-words ${
                  i === 0 ? 'text-sq-text' : 'text-sq-secondary'
                }`}
              >
                {n.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-sq-muted mt-2 text-center tabular-nums">
        {items.length} з {total} пунктів
      </p>
    </aside>
  );
}

export function StaffAccessDialog({
  member,
  staff,
  onClose,
  onSaved,
}: {
  member: StaffMember;
  /** Everyone on «Співробітники» — «Як у…» copies another cashier's access. */
  staff: readonly StaffMember[];
  onClose: () => void;
  onSaved: (blocked: string[]) => void;
}) {
  const enabled = useEnabledModules();
  const overrides = useNavOverrides();
  const sections = useMemo(() => tillSections(allModules(), enabled, overrides), [enabled, overrides]);
  const [draft, setDraft] = useState<Set<string>>(() => new Set(member.blocked_sections ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = useMemo(() => railPreview(allModules(), enabled, new Set(), overrides), [enabled, overrides]);
  const preview = useMemo(() => railPreview(allModules(), enabled, draft, overrides), [enabled, draft, overrides]);
  const others = staff.filter((s) => s.id !== member.id && s.role === 'seller' && s.is_active);
  const next = toBlockedList(draft);
  const changed = !sameSections(next, member.blocked_sections);
  const closedCount = sections.filter((s) => !s.locked && draft.has(s.moduleId)).length;

  function toggle(id: string) {
    setDraft((current) => {
      const copy = new Set(current);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.posRequest('patch', `/staff/${member.id}`, { blocked_sections: next });
      onSaved(next);
    } catch (err) {
      setError(serverSentence(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      testId="staff-access"
      size="lg"
      title={`Що бачить ${member.display_name} на касі`}
      description="Вимкніть розділ — він зникне з каси цієї людини, а сервер не виконає його дій. Власник бачить усе."
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && !saving) void save();
      }}
      footer={
        <>
          {error ? (
            <p role="alert" className="mr-auto text-[14px] text-red-600">
              {error}
            </p>
          ) : (
            <p className="mr-auto text-[14px] text-sq-secondary" data-testid="staff-access-count">
              {closedCount === 0 ? 'Уся каса відкрита' : `Закрито розділів: ${closedCount}`}
            </p>
          )}
          <button type="button" onClick={onClose} className="sq-btn-quiet">
            Скасувати
          </button>
          <button
            type="submit"
            disabled={!changed || saving}
            className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px] disabled:opacity-50"
          >
            {saving ? 'Зберігаю…' : 'Зберегти'}
          </button>
        </>
      }
    >
      <div className="flex flex-col lg:flex-row gap-5 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setDraft(new Set())}
              disabled={draft.size === 0}
              className="min-h-9 px-3 rounded-full ring-1 ring-inset ring-sq-divider text-[14px] font-semibold text-sq-blue disabled:text-sq-muted"
            >
              Відкрити все
            </button>
            {others.length > 0 && (
              <select
                aria-label="Доступ як у"
                className="sq-input min-h-9 h-9 py-0 text-[14px] !w-auto max-w-[220px]"
                value=""
                onChange={(e) => {
                  const source = others.find((s) => String(s.id) === e.target.value);
                  if (source) setDraft(new Set(source.blocked_sections ?? []));
                }}
              >
                <option value="">Як у…</option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <ul className="flex flex-col gap-1">
            {sections.map((section) => (
              <SectionTile
                key={section.moduleId}
                section={section}
                open={section.locked || !draft.has(section.moduleId)}
                onToggle={() => toggle(section.moduleId)}
              />
            ))}
          </ul>
        </div>
        <RailPreview items={preview} name={member.display_name} total={full.length} />
      </div>
    </Dialog>
  );
}
