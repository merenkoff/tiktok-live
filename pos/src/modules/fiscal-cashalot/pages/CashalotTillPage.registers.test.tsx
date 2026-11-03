// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `/fiscal` in a store with two registers (track ДК): one block per register,
// each driving its own shift.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { FiscalStatus } from '../../fiscal-core/types';

const getFiscalStatus = vi.fn<[number?], Promise<FiscalStatus>>();
const openFiscalShift = vi.fn<[number?], Promise<unknown>>();

vi.mock('../../fiscal-core/data/fiscalApi', () => ({
  getFiscalStatus: (n?: number) => getFiscalStatus(n),
  openFiscalShift: (n?: number) => openFiscalShift(n),
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
    auto_open_shift: false,
    shift: { status: 'closed', provider_shift_id: null, opened_at: null, auto_close_due_at: null },
    error: null,
    holder: null,
    offline: { capable: false, enabled: false, codes_target: 200, codes: null, session: null },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  openFiscalShift.mockResolvedValue({});
});

describe('CashalotTillPage — two registers', () => {
  it('draws a block per register, and opens register 2’s shift through register 2', async () => {
    getFiscalStatus.mockResolvedValue(
      status({
        shift: { status: 'open', provider_shift_id: '1', opened_at: null, auto_close_due_at: null },
        registers: [status({ register_no: 2, label: 'Бар', testing: true })],
      })
    );
    renderWithProviders(<CashalotTillPage />);

    expect(await screen.findByText('Зміни ПРРО')).toBeInTheDocument();
    const one = screen.getByTestId('fiscal-register-1');
    const two = screen.getByTestId('fiscal-register-2');
    expect(one).toHaveTextContent('Каса 1');
    expect(two).toHaveTextContent('Каса 2 · Бар');
    expect(two).toHaveTextContent('Тестова зміна');
    expect(within(one).queryByText(/Тестова зміна/)).not.toBeInTheDocument();

    await userEvent.setup().click(within(two).getByRole('button', { name: /Відкрити зміну/ }));
    expect(openFiscalShift).toHaveBeenCalledWith(2);
  });

  it('stays as it was with one register', async () => {
    getFiscalStatus.mockResolvedValue(status());
    renderWithProviders(<CashalotTillPage />);
    expect(await screen.findByText('Зміна ПРРО')).toBeInTheDocument();
    expect(screen.getByTestId('fiscal-register-1')).not.toHaveTextContent('Каса 1');
    expect(screen.queryByTestId('fiscal-register-2')).not.toBeInTheDocument();
  });
});
