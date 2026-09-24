// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, cashierApi } from '@pos/platform';
import type { CustomerChild, PosCustomer } from '../../types';
import { useDragScroll } from '../../hooks/useDragScroll';
import { PageHeader } from '../../components/ui/Page';
import { ArrowLeft, Plus, Search, Users, X } from '../../platform/glyphs';

// One page, two shells: the till's `pos-field` is touch-sized (48 px), the
// owner's `sq-input` the compact admin well (44 px).
function fieldClassFor(cashierShell?: boolean): string {
  return cashierShell ? 'pos-field' : 'sq-input';
}

function emptyChild(): CustomerChild {
  return { name: '', birthday: '' };
}

interface Props {
  cashierShell?: boolean;
}

export function CustomersPage({ cashierShell }: Props) {
  const [list, setList] = useState<PosCustomer[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PosCustomer | null>(null);
  const [creating, setCreating] = useState(false);
  const bodyRef = useDragScroll<HTMLDivElement>();

  async function reload(search = q) {
    setList(await cashierApi.listCustomers(search || undefined));
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only; `reload` reads live state via its default arg
  }, []);

  const fieldClass = fieldClassFor(cashierShell);
  const runSearch = () => void reload(q).catch(() => setError('Помилка пошуку'));

  const newButton = (
    <button
      type="button"
      className={`sq-btn-quiet ${cashierShell ? '!min-h-12' : ''}`}
      onClick={() => {
        setCreating(true);
        setEditing(null);
      }}
    >
      <Plus size={20} />
      Новий клієнт
    </button>
  );

  const body = (
    <div
      ref={bodyRef}
      className={
        cashierShell
          ? 'flex-1 overflow-auto select-none'
          : 'animate-fade-up text-sq-text max-w-4xl'
      }
    >
      <div className={cashierShell ? 'max-w-3xl mx-auto w-full px-4 md:px-7 pb-6' : ''}>
        {cashierShell ? (
          <header className="flex flex-wrap items-center gap-3 py-4 md:min-h-[72px]">
            <Users size={24} className="shrink-0" />
            <h1 className="text-2xl font-bold text-sq-heading">Клієнти</h1>
            <div className="ml-auto flex items-center gap-3">
              {newButton}
              <Link
                to="/register"
                className="min-h-12 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue"
              >
                <ArrowLeft size={20} aria-hidden />
                Каса
              </Link>
            </div>
          </header>
        ) : (
          <PageHeader glyph={Users} title="Клієнти" actions={newButton} />
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-2 items-center mb-4">
          <div className="relative flex-1 min-w-[14rem] max-w-md">
            <Search
              size={20}
              aria-hidden
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
            />
            <input
              className={`${fieldClass} !pl-11`}
              placeholder="Пошук імені / телефону"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch();
              }}
            />
          </div>
          <button type="button" className={`sq-btn-quiet ${cashierShell ? '!min-h-12' : ''}`} onClick={runSearch}>
            Шукати
          </button>
        </div>

        {(creating || editing) && (
          <div className="mb-5">
            <CustomerForm
              initial={editing}
              cashierShell={cashierShell}
              onCancel={() => {
                setCreating(false);
                setEditing(null);
              }}
              onSaved={async () => {
                setCreating(false);
                setEditing(null);
                await reload();
              }}
              onError={setError}
              allowDelete={!cashierShell && !!editing}
            />
          </div>
        )}

        {list.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <Users size={48} />
            <p className="text-[15px] text-sq-secondary">Немає клієнтів</p>
          </div>
        ) : (
          <ul className={cashierShell ? 'rounded-card bg-white shadow-card overflow-hidden' : ''}>
            {list.map((c) => {
              const on = editing?.id === c.id;
              return (
                <li key={c.id} className={cashierShell ? 'sq-row last:shadow-none' : 'sq-row'}>
                  <button
                    type="button"
                    aria-current={on || undefined}
                    className={`text-left py-2 flex items-center gap-3 transition-colors ${
                      cashierShell ? 'w-full min-h-[60px] px-4 md:px-5' : 'w-[calc(100%+1rem)] min-h-12 -mx-2 px-2 rounded-lg'
                    } ${on ? 'bg-sq-selected' : 'hover:bg-sq-sidebar/60'}`}
                    onClick={() => {
                      setEditing(c);
                      setCreating(false);
                    }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-base text-sq-text truncate">{c.name}</span>
                      {c.children_birthdays?.length > 0 && (
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="text-[13px] text-sq-muted mr-0.5">Діти</span>
                          {c.children_birthdays.map((ch, i) => (
                            <span
                              key={`${ch.name}-${i}`}
                              className="inline-flex items-center h-[22px] px-2 rounded-md ring-1 ring-inset ring-sq-divider text-xs font-medium text-sq-secondary"
                            >
                              {ch.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-sq-muted tabular-nums shrink-0">{c.phone}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  return body;
}

function CustomerForm({
  initial,
  cashierShell,
  onCancel,
  onSaved,
  onError,
  allowDelete,
}: {
  initial: PosCustomer | null;
  cashierShell?: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
  allowDelete?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [children, setChildren] = useState<CustomerChild[]>(
    initial?.children_birthdays?.length ? [...initial.children_birthdays] : []
  );
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError('');
    try {
      const payload = {
        name,
        phone,
        email: email || null,
        children_birthdays: children.filter((c) => c.name.trim() && c.birthday),
      };
      if (initial) await cashierApi.updateCustomer(initial.id, payload);
      else await cashierApi.createCustomer(payload);
      await onSaved();
    } catch {
      onError('Не вдалося зберегти клієнта');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial || !confirm(`Видалити «${initial.name}»?`)) return;
    try {
      await api.deleteCustomer(initial.id);
      await onSaved();
    } catch {
      onError('Не вдалося видалити (можливо є продажі)');
    }
  }

  const fieldClass = fieldClassFor(cashierShell);
  const labelClass = 'flex flex-col gap-1.5';
  const captionClass = 'text-[13px] font-semibold text-sq-secondary';

  return (
    <form onSubmit={(e) => void save(e)} className="sq-card p-5 md:p-6 space-y-4">
      <p className="text-[19px] font-bold text-sq-heading">{initial ? 'Редагування' : 'Новий клієнт'}</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className={labelClass}>
          <span className={captionClass}>Ім’я *</span>
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className={labelClass}>
          <span className={captionClass}>Телефон *</span>
          <input
            className={`${fieldClass} tabular-nums`}
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          <span className={captionClass}>Email</span>
          <input className={fieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={captionClass}>Діти (макс. 5)</p>
          <button
            type="button"
            disabled={children.length >= 5}
            className="min-h-9 inline-flex items-center gap-1 text-[15px] text-sq-blue font-semibold disabled:opacity-40"
            onClick={() => setChildren([...children, emptyChild()])}
          >
            <Plus size={20} />
            Дитина
          </button>
        </div>
        {children.map((ch, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <input
              className={fieldClass}
              placeholder="Ім’я"
              aria-label="Ім’я дитини"
              value={ch.name}
              onChange={(e) => {
                const next = [...children];
                next[idx] = { ...ch, name: e.target.value };
                setChildren(next);
              }}
            />
            <input
              className={fieldClass}
              type="date"
              aria-label="День народження"
              value={ch.birthday}
              onChange={(e) => {
                const next = [...children];
                next[idx] = { ...ch, birthday: e.target.value };
                setChildren(next);
              }}
            />
            <button
              type="button"
              className="w-11 h-11 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty hover:text-red-600"
              aria-label="Прибрати"
              onClick={() => setChildren(children.filter((_, i) => i !== idx))}
            >
              <X size={20} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className={
            cashierShell
              ? 'pos-btn-primary min-h-12 px-6 rounded-xl text-[17px]'
              : 'pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]'
          }
        >
          {saving ? '…' : 'Зберегти'}
        </button>
        <button type="button" className={`sq-btn-quiet ${cashierShell ? '!min-h-12' : ''}`} onClick={onCancel}>
          Скасувати
        </button>
        {allowDelete && (
          <button
            type="button"
            className="ml-auto min-h-11 px-3 text-[15px] font-semibold text-red-600"
            onClick={() => void remove()}
          >
            Видалити
          </button>
        )}
      </div>
    </form>
  );
}
