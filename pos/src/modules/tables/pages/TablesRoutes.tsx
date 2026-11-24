// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's routes under the `/tables/*` splat the manifest claims: the
// hall map, one bill (К4f), and a table nobody has ordered at yet — the same
// bill screen, opened on the table alone (§4.1).

import { Route, Routes, useParams } from 'react-router-dom';
import { BillPage } from './BillPage';
import { HallMapPage } from './HallMapPage';

/**
 * Keyed by what it shows, so going from one bill to another remounts the
 * screen: its queue and its bill belong to the table it was opened on.
 */
function BillRoute(): JSX.Element {
  const { billId } = useParams<{ billId: string }>();
  return <BillPage key={`bill-${billId}`} target={{ billId: Number(billId) }} />;
}

function TableRoute(): JSX.Element {
  const { tableId } = useParams<{ tableId: string }>();
  return <BillPage key={`table-${tableId}`} target={{ tableId: Number(tableId) }} />;
}

export function TablesRoutes(): JSX.Element {
  return (
    <Routes>
      <Route index element={<HallMapPage />} />
      <Route path="table/:tableId" element={<TableRoute />} />
      <Route path=":billId" element={<BillRoute />} />
    </Routes>
  );
}
