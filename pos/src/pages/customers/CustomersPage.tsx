// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { cashierApi } from '../../offline/cashierApi';
import type { CustomerChild, PosCustomer } from '../../types';
import { useDragScroll } from '../../hooks/useDragScroll';

const fieldClass =
  'rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sm text-sq-text w-full';

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

  const body = (
    <div
      ref={bodyRef}
      className={cashierShell ? 'flex-1 overflow-auto p-4 max-w-3xl mx-auto w-full select-none' : 'space-y-4'}
    >
      {cashierShell && (
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-sq-text">Клієнти</h1>
          <Link to="/register" className="text-sm font-semibold text-sq-blue">
            ← Каса
          </Link>
        </div>
      )}

      {!cashierShell && <p className="sq-section-label">Клієнти</p>}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          className={`${fieldClass} max-w-xs`}
          placeholder="Пошук імені / телефону"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void reload(q).catch(() => setError('Помилка пошуку'));
          }}
        />
        <button
          type="button"
          className="sq-btn-primary px-3 py-2 text-sm"
          onClick={() => void reload(q).catch(() => setError('Помилка пошуку'))}
        >
          Шукати
        </button>
        <button
          type="button"
          className="rounded-sq border border-sq-divider px-3 py-2 text-sm font-medium bg-white"
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
        >
          + Новий клієнт
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-3">
          <CustomerForm
            initial={editing}
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

      <ul className="divide-y divide-sq-divider border border-sq-divider rounded-sq bg-white">
        {list.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-sq-bg"
              onClick={() => {
                setEditing(c);
                setCreating(false);
              }}
            >
              <p className="font-medium text-sq-text">{c.name}</p>
              <p className="text-sm text-sq-secondary">{c.phone}</p>
              {c.children_birthdays?.length > 0 && (
                <p className="text-xs text-sq-muted mt-0.5">
                  Діти: {c.children_birthdays.map((ch) => ch.name).join(', ')}
                </p>
              )}
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-sq-muted">Немає клієнтів</li>
        )}
      </ul>
    </div>
  );

  return body;
}

function CustomerForm({
  initial,
  onCancel,
  onSaved,
  onError,
  allowDelete,
}: {
  initial: PosCustomer | null;
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

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="border border-sq-divider rounded-sq p-4 space-y-3 bg-white shadow-sm"
    >
      <p className="text-sm font-semibold">{initial ? 'Редагування' : 'Новий клієнт'}</p>
      <input
        className={fieldClass}
        placeholder="Ім’я *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className={fieldClass}
        placeholder="Телефон *"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
      />
      <input
        className={fieldClass}
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-sq-secondary">Діти (макс. 5)</p>
          <button
            type="button"
            disabled={children.length >= 5}
            className="text-sm text-sq-blue font-medium disabled:opacity-40"
            onClick={() => setChildren([...children, emptyChild()])}
          >
            + Дитина
          </button>
        </div>
        {children.map((ch, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              className={fieldClass}
              placeholder="Ім’я"
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
              value={ch.birthday}
              onChange={(e) => {
                const next = [...children];
                next[idx] = { ...ch, birthday: e.target.value };
                setChildren(next);
              }}
            />
            <button
              type="button"
              className="text-sm text-red-600 px-2"
              onClick={() => setChildren(children.filter((_, i) => i !== idx))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="sq-btn-primary px-4 py-2.5 text-sm">
          {saving ? '…' : 'Зберегти'}
        </button>
        <button type="button" className="px-4 py-2.5 text-sm text-sq-secondary" onClick={onCancel}>
          Скасувати
        </button>
        {allowDelete && (
          <button type="button" className="ml-auto px-4 py-2.5 text-sm text-red-600" onClick={() => void remove()}>
            Видалити
          </button>
        )}
      </div>
    </form>
  );
}
