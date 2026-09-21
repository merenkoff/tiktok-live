// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's routes under the `/tables/*` splat the manifest claims.
// К4e ships the map; the bill screen (`/tables/:billId`) is К4f and lands
// here as a second `<Route>`.

import { Route, Routes } from 'react-router-dom';
import { HallMapPage } from './HallMapPage';

export function TablesRoutes(): JSX.Element {
  return (
    <Routes>
      <Route index element={<HallMapPage />} />
    </Routes>
  );
}
