// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useState } from 'react';
import { Check, Plus, Search, X } from '../../platform/glyphs';
import { cashierApi } from '@pos/platform';
import type { PosCustomer } from '../../types';
import { useDragScroll } from '../../hooks/useDragScroll';

interface Props {
  onClose: () => void;
  onSelect: (customer: PosCustomer | null) => void;
  currentId?: number | null;
}

export function CustomerPicker({ onClose, onSelect, currentId }: Props) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<PosCustomer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const listRef = useDragScroll<HTMLUListElement>();

  async function search(term = q) {
    setList(await cashierApi.listCustomers(term || undefined));
  }

  useEffect(() => {
    void search().catch(() => setError('Не вдалося завантажити'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only; `search` reads live state via its default arg
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const c = await cashierApi.createCustomer({ name, phone });
      onSelect(c);
      onClose();
    } catch {
      setError('Не вдалося створити');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-[rgba(28,32,38,.32)]" aria-label="Закрити" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Клієнт чека"
        className="relative w-full max-w-md max-h-[85dvh] bg-white rounded-t-card sm:rounded-card flex flex-col overflow-hidden shadow-[0_24px_60px_rgba(0,20,60,.28)] animate-fade-up"
      >
        <div aria-hidden className="sm:hidden w-10 h-[5px] rounded-full bg-sq-divider self-center mt-2 shrink-0" />
        <div className="pl-5 pr-3 pt-3 sm:pt-4 pb-2 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[19px] font-bold text-sq-heading">Клієнт чека</p>
          <button
            type="button"
            className="w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0"
            aria-label="Закрити"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pb-3 space-y-1 shrink-0 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]">
          <div className="relative">
            <Search
              size={20}
              aria-hidden
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
            />
            <input
              className="pos-field !pl-11"
              placeholder="Пошук…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void search(q);
              }}
            />
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="min-h-10 text-[15px] font-semibold text-sq-blue"
              onClick={() => void search(q)}
            >
              Шукати
            </button>
            <button
              type="button"
              className="min-h-10 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue"
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? (
                'Сховати форму'
              ) : (
                <>
                  <Plus size={20} />
                  Новий
                </>
              )}
            </button>
            <button
              type="button"
              className="ml-auto min-h-10 text-[15px] font-medium text-sq-secondary"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
            >
              Без клієнта
            </button>
          </div>
        </div>

        {error && <p className="px-5 pt-2 text-sm text-red-600">{error}</p>}

        {showCreate && (
          <form
            onSubmit={(e) => void create(e)}
            className="px-5 py-3 space-y-2 shrink-0 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]"
          >
            <input
              className="pos-field"
              placeholder="Ім’я *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="pos-field tabular-nums"
              placeholder="Телефон *"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <button type="submit" className="pos-btn-primary w-full min-h-12 rounded-xl text-base">
              Створити і вибрати
            </button>
          </form>
        )}

        <ul ref={listRef} className="flex-1 overflow-auto select-none px-2 py-1.5">
          {list.map((c) => {
            const current = currentId === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`w-full text-left min-h-[60px] rounded-[14px] px-3.5 py-2.5 flex items-center gap-3 outline-none hover:bg-sq-sidebar focus-visible:bg-sq-sidebar active:bg-sq-selected ${
                    current ? 'bg-sq-sidebar' : ''
                  }`}
                  onClick={() => {
                    onSelect(c);
                    onClose();
                  }}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-medium text-sq-text truncate">{c.name}</span>
                    <span className="block text-sm text-sq-muted tabular-nums truncate">{c.phone}</span>
                  </span>
                  {current && <Check size={20} aria-hidden className="text-sq-blue shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
