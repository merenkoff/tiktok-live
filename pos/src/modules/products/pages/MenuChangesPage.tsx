// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, PageHeader } from '@pos/platform/ui';
import { MenuChangesList } from '../components/MenuChangesList';
import { listMenuChanges, type MenuChangeRow } from '../data/menuChangesApi';
import { requestErrorMessage } from '../lib/saveErrors';

const PAGE = 50;

/**
 * «Історія змін меню» (migration 101, TechDocs/POS_MENU_CHANGES.md): who
 * changed which card, price, tag or modifier group, and when — newest first,
 * the whole store or one card (`?product=<id>`). The owner's only: the rows
 * carry purchase prices and every staff member's name.
 */
export function MenuChangesPage() {
  const [params] = useSearchParams();
  const productId = /^\d+$/.test(params.get('product') ?? '') ? Number(params.get('product')) : undefined;
  const [rows, setRows] = useState<MenuChangeRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      setError(null);
      try {
        const page = await listMenuChanges({
          ...(productId != null ? { entity: 'product' as const, entityId: productId } : {}),
          limit: PAGE,
          offset,
        });
        setTotal(page.total);
        setRows((prev) => (offset === 0 ? page.changes : [...(prev ?? []), ...page.changes]));
      } catch (err) {
        setError(requestErrorMessage(err, 'Не вдалося завантажити історію змін'));
      } finally {
        setLoading(false);
      }
    },
    [productId]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const name = productId != null ? rows?.[0]?.entity_name : undefined;

  return (
    <div className="animate-fade-up text-sq-text max-w-4xl">
      <PageHeader
        glyph={ClipboardList}
        title={name ? `Історія змін: ${name}` : 'Історія змін меню'}
        back={
          productId != null
            ? { to: `/admin/products/${productId}`, label: 'Товар' }
            : { to: '/admin/products', label: 'Товари' }
        }
        subtitle="Хто і коли змінив товар, ціну, мітки чи модифікатори: власник, маркетолог чи продавець. Залишки й стоп-лист сюди не пишуться — це не зміни меню."
      />

      {error && (
        <div className="mb-5 rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      )}

      {rows && rows.length === 0 && !error && (
        <p className="py-6 text-[15px] text-sq-muted">
          Ще немає записів. Історія ведеться з дня, коли цю функцію ввімкнули: кожна наступна зміна меню з'явиться тут.
        </p>
      )}

      {rows && rows.length > 0 && <MenuChangesList rows={rows} showName={productId == null} />}

      {rows && rows.length < total && (
        <button
          type="button"
          className="sq-btn-quiet mt-4"
          disabled={loading}
          onClick={() => void load(rows.length)}
        >
          Показати ще
        </button>
      )}
    </div>
  );
}
