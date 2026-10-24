// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's routes under the `/debts/*` (till) and `/admin/debts/*`
// (owner's cabinet) splats the manifest claims: the debtors, and one
// customer's statement. Links between them are relative, so each stays in the
// frame it was opened in.

import { Route, Routes } from 'react-router-dom';
import type { DebtsFrame } from '../components/Frame';
import { DebtorsPage } from './DebtorsPage';
import { StatementPage } from './StatementPage';

export function DebtsRoutes({ frame = 'till' }: { frame?: DebtsFrame }): JSX.Element {
  return (
    <Routes>
      <Route index element={<DebtorsPage frame={frame} />} />
      <Route path=":customerId" element={<StatementPage frame={frame} />} />
    </Routes>
  );
}
