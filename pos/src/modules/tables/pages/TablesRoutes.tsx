// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's routes under the `/tables/*` splat the manifest claims: the
// hall map, and one bill (К4f).

import { Route, Routes } from 'react-router-dom';
import { BillPage } from './BillPage';
import { HallMapPage } from './HallMapPage';

export function TablesRoutes(): JSX.Element {
  return (
    <Routes>
      <Route index element={<HallMapPage />} />
      <Route path=":billId" element={<BillPage />} />
    </Routes>
  );
}
