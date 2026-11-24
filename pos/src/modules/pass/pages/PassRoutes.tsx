// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's routes under the `/pass/*` splat the manifest claims: one screen.

import { Route, Routes } from 'react-router-dom';
import { PassPage } from './PassPage';

export function PassRoutes(): JSX.Element {
  return (
    <Routes>
      <Route index element={<PassPage />} />
    </Routes>
  );
}
