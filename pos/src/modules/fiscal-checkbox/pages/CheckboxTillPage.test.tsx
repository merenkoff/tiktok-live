// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `/fiscal` — the till's shift screen. `GET /fiscal/status` never throws (an
// unreachable provider is a state, not a failed request), so the case worth
// pinning is that the "not configured" state renders plainly rather than
// being force-fit through the error-card path.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { FiscalStatus, ShiftCloseResponse, ShiftOpenResponse } from '../../fiscal-core/types';

const getFiscalStatus = vi.fn<[], Promise<FiscalStatus>>();
const openFiscalShift = vi.fn<[], Promise<ShiftOpenResponse>>();
const closeFiscalShift = vi.fn<[], Promise<ShiftCloseResponse>>();
const fiscalXReport = vi.fn();
const fiscalServiceReceipt = vi.fn();
const claimRegister = vi.fn();

vi.mock('../../fiscal-core/data/fiscalApi', () => ({
  getFiscalStatus: () => getFiscalStatus(),
  openFiscalShift: () => openFiscalShift(),
  closeFiscalShift: () => closeFiscalShift(),
  fiscalXReport: () => fiscalXReport(),
  fiscalServiceReceipt: (cents: number) => fiscalServiceReceipt(cents),
  // `HolderPanel` reaches for these through the same module.
  claimRegister: () => claimRegister(),
  releaseRegister: vi.fn(),
  requestHandover: vi.fn(),
  confirmHandover: vi.fn(),
}));

const { CheckboxTillPage } = await import('./CheckboxTillPage');

function status(over: Partial<FiscalStatus> = {}): FiscalStatus {
  return {
    enabled: true,
    provider: 'checkbox',
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

describe('CheckboxTillPage', () => {
  it('offers to open a closed shift', async () => {
    getFiscalStatus.mockResolvedValue(status());
    renderWithProviders(<CheckboxTillPage />);
    expect(await screen.findByText('Закрита')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Відкрити зміну' })).toBeInTheDocument();
  });

  it('shows shift controls and reloads status after opening', async () => {
    getFiscalStatus.mockResolvedValueOnce(status()).mockResolvedValueOnce(
      status({
        shift: {
          status: 'open',
          provider_shift_id: 's1',
          opened_at: '2026-09-09T09:00:00.000Z',
          auto_close_due_at: null,
        },
      })
    );
    openFiscalShift.mockResolvedValue({
      shift: { providerShiftId: 's1', status: 'open', openedAt: null, autoCloseAt: null },
    });
    renderWithProviders(<CheckboxTillPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Відкрити зміну' }));
    await waitFor(() => expect(getFiscalStatus).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Відкрита')).toBeInTheDocument();
  });

  it('offers X-report and close once the shift is open, and shows the cash form', async () => {
    getFiscalStatus.mockResolvedValue(
      status({
        shift: { status: 'open', provider_shift_id: 's1', opened_at: null, auto_close_due_at: null },
      })
    );
    renderWithProviders(<CheckboxTillPage />);

    expect(await screen.findByRole('button', { name: 'X-звіт' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрити зміну' })).toBeInTheDocument();
    expect(screen.getByText('Внесення / видача готівки')).toBeInTheDocument();
  });

  it('renders the Z-report after closing', async () => {
    getFiscalStatus.mockResolvedValue(
      status({
        shift: { status: 'open', provider_shift_id: 's1', opened_at: null, auto_close_due_at: null },
      })
    );
    closeFiscalShift.mockResolvedValue({
      shift: {
        providerShiftId: 's1',
        status: 'closed',
        openedAt: null,
        autoCloseAt: null,
        closedAt: null,
        zReport: {},
        zReportText: 'Z-REPORT TEXT',
      },
      z_report: {},
      z_report_text: 'Z-REPORT TEXT',
    });
    renderWithProviders(<CheckboxTillPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Закрити зміну' }));
    expect(await screen.findByText('Z-REPORT TEXT')).toBeInTheDocument();
  });

  it('renders the not-configured state plainly, without pretending it is a request failure', async () => {
    getFiscalStatus.mockResolvedValue(
      status({ configured: false, error: { code: 'not_configured', message: 'Дані доступу не збережено' } })
    );
    renderWithProviders(<CheckboxTillPage />);
    expect(await screen.findByText('ПРРО не налаштовано')).toBeInTheDocument();
    expect(screen.getByText('Дані доступу не збережено')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Відкрити зміну' })).not.toBeInTheDocument();
  });

  it('adds the offline reserve and the register holder once the store sells offline', async () => {
    // Both panels are silent for a store without offline mode — this is the
    // one case where the till screen gains anything at all.
    getFiscalStatus.mockResolvedValue(
      status({
        offline: {
          capable: true,
          enabled: true,
          codes_target: 200,
          codes: { free: 180, leased: 0, used: 20 },
          session: null,
        },
      })
    );
    renderWithProviders(<CheckboxTillPage />, { shell: 'cashier' });

    expect(await screen.findByText(/Запас фіскальних кодів: 180/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Зайняти касу' })).toBeInTheDocument();
  });

  it('keeps the till screen unchanged for a store that does not sell offline', async () => {
    getFiscalStatus.mockResolvedValue(status());
    renderWithProviders(<CheckboxTillPage />);

    await screen.findByText('Закрита');
    expect(screen.queryByText(/Запас фіскальних кодів/)).not.toBeInTheDocument();
    expect(screen.queryByText('Каса ПРРО')).not.toBeInTheDocument();
  });

  it('submits a cash-in service receipt', async () => {
    getFiscalStatus.mockResolvedValue(
      status({
        shift: { status: 'open', provider_shift_id: 's1', opened_at: null, auto_close_due_at: null },
      })
    );
    fiscalServiceReceipt.mockResolvedValue({ status: 'done' });
    renderWithProviders(<CheckboxTillPage />);

    const amountField = await screen.findByPlaceholderText('Сума, ₴');
    await userEvent.type(amountField, '500');
    await userEvent.click(screen.getByRole('button', { name: 'Провести чек' }));

    await waitFor(() => expect(fiscalServiceReceipt).toHaveBeenCalledWith(50000));
    expect(await screen.findByText('Чек проведено')).toBeInTheDocument();
  });
});
