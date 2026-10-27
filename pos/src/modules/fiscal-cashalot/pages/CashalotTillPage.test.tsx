// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { FiscalStatus } from '../../fiscal-core/types';

const getFiscalStatus = vi.fn<[], Promise<FiscalStatus>>();

vi.mock('../../fiscal-core/data/fiscalApi', () => ({
  getFiscalStatus: () => getFiscalStatus(),
  openFiscalShift: vi.fn(),
  closeFiscalShift: vi.fn(),
  fiscalXReport: vi.fn(),
  fiscalServiceReceipt: vi.fn(),
}));

const { CashalotTillPage } = await import('./CashalotTillPage');

function status(over: Partial<FiscalStatus> = {}): FiscalStatus {
  return {
    enabled: true,
    provider: 'cashalot',
    configured: true,
    auto_open_shift: true,
    shift: null,
    error: null,
    holder: null,
    offline: { capable: false, enabled: false, codes_target: 200, codes: null, session: null },
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('CashalotTillPage', () => {
  it('shows the shift and the cash form once a shift is open', async () => {
    getFiscalStatus.mockResolvedValue(
      status({ shift: { status: 'open', provider_shift_id: '701', opened_at: null, auto_close_due_at: null } })
    );
    renderWithProviders(<CashalotTillPage />);
    expect(await screen.findByText('Зміна ПРРО')).toBeInTheDocument();
    expect(await screen.findByText('Внесення / видача готівки')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('tells the cashier when the register runs in test mode — and only then', async () => {
    getFiscalStatus.mockResolvedValue(status({ testing: true }));
    renderWithProviders(<CashalotTillPage />);
    expect(await screen.findByText(/Тестова зміна — чеки без фіскальної сили/)).toBeInTheDocument();
  });
});
