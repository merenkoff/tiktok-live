// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Route, Routes } from 'react-router-dom';
import { StocktakePage } from './StocktakePage';
import { CountSheetPage } from './CountSheetPage';

/** Mounted at `/stocktake/*`: the sheet list, and one sheet by id. */
export function StocktakeRoutes() {
  return (
    <Routes>
      <Route index element={<StocktakePage />} />
      <Route path=":id" element={<CountSheetPage />} />
    </Routes>
  );
}
