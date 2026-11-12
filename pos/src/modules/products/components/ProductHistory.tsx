// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHead } from '@pos/platform/ui';
import { MenuChangesList } from './MenuChangesList';
import { listMenuChanges, type MenuChangesPage } from '../data/menuChangesApi';

const SHOWN = 5;

/**
 * The card's latest changes under its form (migration 101): who changed what,
 * with a link to the whole history. Reads again whenever `version` moves — the
 * page bumps it after every save. Quiet on failure: the card is the point of
 * the page, its history is not.
 */
export function ProductHistory({ productId, version }: { productId: number; version: unknown }) {
  const [page, setPage] = useState<MenuChangesPage | null>(null);

  useEffect(() => {
    let live = true;
    listMenuChanges({ entity: 'product', entityId: productId, limit: SHOWN })
      .then((next) => {
        // An older server, or anything that is not the journal's answer, shows nothing.
        if (live) setPage(next && Array.isArray(next.changes) ? next : null);
      })
      .catch(() => {
        if (live) setPage(null);
      });
    return () => {
      live = false;
    };
  }, [productId, version]);

  if (!page || page.changes.length === 0) return null;
  return (
    <section className="mt-10 max-w-3xl" data-testid="product-history">
      <SectionHead
        title="Історія змін"
        count={page.total}
        action={
          page.total > page.changes.length ? (
            <Link to={`/admin/products/history?product=${productId}`}>Уся історія</Link>
          ) : undefined
        }
      />
      <MenuChangesList rows={page.changes} showName={false} />
    </section>
  );
}
