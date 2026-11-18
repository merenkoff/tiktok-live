// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useAuthStore, useEnabledModules, usePosShell } from '@pos/platform';
import { allModules } from '../modules/registry';
import { selectNavItems } from '../modules/selectNav';
import { useNavOverrides } from '../modules/useNavOverrides';
import type { NavCtx } from '../modules/types';
import { Search } from '../platform/glyphs';
import { freshCatalogue, keepCatalogue, searchSidebar, type SearchHit } from '../lib/sidebarSearch';
import type { Product } from '../types';

/**
 * The search at the top of the owner's sidebar (Ctrl/⌘+K).
 *
 * The sidebar could only take the owner to a SECTION; the thing they came
 * for — one dish, its recipe, one ingredient — was then a second search on
 * that page. Here the name is typed once: the hit opens the card, and a dish
 * with a recipe opens straight on its tech card. Sections are found by their
 * menu label too. The catalogue is read on the first focus and kept a minute;
 * a failed read leaves the sections searchable and says nothing.
 */
export function SidebarSearch() {
  const navigate = useNavigate();
  const shell = usePosShell();
  const role = useAuthStore((s) => s.role());
  const enabled = useEnabledModules();
  const overrides = useNavOverrides();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [products, setProducts] = useState<Product[]>(() => freshCatalogue()?.products ?? []);

  const pages = useMemo(() => {
    const ctx: NavCtx = { shell, role };
    return selectNavItems(allModules(), enabled, ctx, 'admin-sidebar', overrides).map((n) => ({ label: n.label, to: n.to }));
  }, [shell, role, enabled, overrides]);
  const hasProducts = pages.some((p) => p.to === '/admin/products');
  const hasRecipes = pages.some((p) => p.to === '/admin/tech-cards');

  // The marketer's «Товари» is the menu (МР5): the search offers the dishes,
  // not the ingredients and preps the kitchen keeps beside them.
  const searched = useMemo(
    () => (role === 'marketer' ? products.filter((p) => p.sellable !== false) : products),
    [products, role]
  );
  const hits = useMemo(
    () => searchSidebar(query, pages, searched, { recipes: hasRecipes }),
    [query, pages, searched, hasRecipes]
  );

  function load() {
    if (!hasProducts || freshCatalogue()?.fresh) return;
    void api
      .getProducts()
      .then((list) => {
        keepCatalogue(list);
        setProducts(list);
      })
      .catch(() => undefined);
  }

  // Ctrl/⌘+K from anywhere in the cabinet.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function go(to: string) {
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
    navigate(to);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(hits.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit: SearchHit | undefined = hits[cursor];
      if (hit) go(hit.to);
    } else if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="hidden md:block relative px-2 pb-1" data-testid="sidebar-search">
      <Search size={16} className="absolute left-[18px] top-[11px] text-sq-muted pointer-events-none" />
      <input
        ref={inputRef}
        className="w-full min-h-[38px] rounded-lg bg-sq-selected/60 pl-8 pr-2.5 text-[15px] text-sq-text placeholder:text-sq-muted outline-none focus:bg-sq-surface focus:ring-2 focus:ring-sq-blue"
        placeholder="Пошук · Ctrl K"
        aria-label="Пошук у кабінеті"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        value={query}
        onFocus={() => {
          setOpen(true);
          load();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && query.trim() !== '' && (
        <ul
          role="listbox"
          className="absolute left-2 top-full mt-1 z-30 w-[22rem] max-w-[80vw] rounded-xl bg-white shadow-[0_12px_32px_rgba(0,20,60,.2)] ring-1 ring-sq-divider p-1.5"
        >
          {hits.map((hit, index) => (
            <li key={hit.key} className="flex items-stretch gap-1">
              <button
                type="button"
                role="option"
                aria-selected={index === cursor}
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(hit.to)}
                data-testid={`sidebar-hit-${hit.key}`}
                className={`min-w-0 flex-1 min-h-10 px-2.5 rounded-lg flex items-center justify-between gap-3 text-left text-[15px] ${
                  index === cursor ? 'bg-sq-blue/[0.08]' : 'hover:bg-sq-sidebar'
                }`}
              >
                <span className="min-w-0 truncate text-sq-text">{hit.title}</span>
                {hit.hint && <span className="shrink-0 text-[13px] text-sq-muted">{hit.hint}</span>}
              </button>
              {hit.recipeTo && (
                <button
                  type="button"
                  onClick={() => go(hit.recipeTo!)}
                  data-testid={`sidebar-recipe-${hit.key}`}
                  className="shrink-0 min-h-10 px-2.5 rounded-lg text-[14px] font-semibold text-sq-blue hover:bg-sq-sidebar"
                >
                  Рецепт
                </button>
              )}
            </li>
          ))}
          {hits.length === 0 && <li className="px-2.5 py-2.5 text-[15px] text-sq-muted">Нічого не знайдено</li>}
        </ul>
      )}
    </div>
  );
}
