// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `/admin/fiscal` — credentials, "Перевірити з'єднання", the attention list.
// The behaviour worth pinning: a 409 from a missing adapter (the state every
// store is in until phase 2b ships one) must render as a readable card, not
// crash the page — this is what makes shipping this bundle safe right now.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type {
  AttentionDoc,
  FiscalProbe,
  FiscalStatus,
  HolderStatusBlock,
  OfflineSessionView,
} from '../../fiscal-core/types';
import type { FiscalSettingsView } from '../../../types';

const getFiscalSettingsView = vi.fn<[], Promise<FiscalSettingsView>>();
const saveFiscalSecrets = vi.fn<[Record<string, string | null>], Promise<FiscalSettingsView>>();
const testFiscalConnection = vi.fn<[], Promise<FiscalProbe>>();
const listFiscalAttention =
  vi.fn<[], Promise<{ documents: AttentionDoc[]; sessions?: OfflineSessionView[] }>>();
const getFiscalStatus = vi.fn<[], Promise<FiscalStatus>>();
const forceHandover = vi.fn();

vi.mock('../../fiscal-core/data/fiscalApi', () => ({
  getFiscalSettingsView: () => getFiscalSettingsView(),
  saveFiscalSecrets: (v: Record<string, string | null>) => saveFiscalSecrets(v),
  testFiscalConnection: () => testFiscalConnection(),
  listFiscalAttention: () => listFiscalAttention(),
  // Reached through `useFiscalStatus` and the register card.
  getFiscalStatus: () => getFiscalStatus(),
  forceHandover: () => forceHandover(),
}));

const { CheckboxAdminPage } = await import('./CheckboxAdminPage');

function settingsView(over: Partial<FiscalSettingsView> = {}): FiscalSettingsView {
  return {
    enabled: false,
    provider: 'checkbox',
    config: {},
    secrets_set: [],
    default_tax_code: null,
    auto_open_shift: true,
    fail_mode: 'block',
    receipt_source: 'local',
    receipt_width: 32,
    offline_mode: false,
    offline_codes_target: 200,
    offline_capable: false,
    requisites: null,
    requisites_fetched_at: null,
    updated_at: null,
    secrets_key_configured: true,
    adapter_available: false,
    ...over,
  };
}

function fiscalStatus(over: Partial<FiscalStatus> = {}): FiscalStatus {
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

function offlineOn(holder: HolderStatusBlock | null): FiscalStatus {
  return fiscalStatus({
    holder,
    offline: {
      capable: true,
      enabled: true,
      codes_target: 200,
      codes: { free: 180, leased: 0, used: 20 },
      session: null,
    },
  });
}

function heldBy(over: Partial<HolderStatusBlock> = {}): HolderStatusBlock {
  return {
    device_id: 'abcdef1234567890',
    name: 'Каса 1',
    since: '2026-09-11T09:12:00.000Z',
    last_seen_at: '2026-09-11T09:40:00.000Z',
    stale: false,
    is_me: false,
    handover_request: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listFiscalAttention.mockResolvedValue({ documents: [], sessions: [] });
  getFiscalStatus.mockResolvedValue(fiscalStatus());
});

describe('CheckboxAdminPage', () => {
  it('renders the credentials form once settings load', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    renderWithProviders(<CheckboxAdminPage />);
    expect(await screen.findByText('Ліцензійний ключ')).toBeInTheDocument();
    expect(screen.getByText('PIN-код касира')).toBeInTheDocument();
  });

  it('saves only the field the cashier actually typed into', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    saveFiscalSecrets.mockResolvedValue(settingsView({ secrets_set: ['licenceKey'] }));
    renderWithProviders(<CheckboxAdminPage />);

    const field = await screen.findByPlaceholderText('Кабінет Checkbox → Каси → обраний реєстратор');
    await userEvent.type(field, 'LIC-123');
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти дані доступу' }));

    await waitFor(() =>
      expect(saveFiscalSecrets).toHaveBeenCalledWith({ licenceKey: 'LIC-123' })
    );
  });

  it("renders a readable error, not a crash, when the provider has no adapter yet", async () => {
    // The state every store is in until phase 2b — this is the exact 409 the
    // backend answers, and it is what makes shipping this bundle safe now.
    getFiscalSettingsView.mockResolvedValue(settingsView());
    testFiscalConnection.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'not_configured',
          message: 'ПРРО не налаштовано',
          support_code: 'FS-NOT-CONFIGURED',
        },
      },
    });
    renderWithProviders(<CheckboxAdminPage />);

    await userEvent.click(await screen.findByRole('button', { name: "Перевірити з'єднання" }));

    expect(await screen.findByText('ПРРО не налаштовано')).toBeInTheDocument();
    expect(screen.getByText('FS-NOT-CONFIGURED')).toBeInTheDocument();
  });

  it('shows a successful probe result', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    testFiscalConnection.mockResolvedValue({
      ok: true,
      cashierName: 'Оля',
      cashRegister: 'REG-1',
      shiftOpen: false,
      message: null,
    });
    renderWithProviders(<CheckboxAdminPage />);

    await userEvent.click(await screen.findByRole('button', { name: "Перевірити з'єднання" }));

    expect(await screen.findByText("З'єднання успішне")).toBeInTheDocument();
    expect(screen.getByText('Касир: Оля')).toBeInTheDocument();
  });

  it('lists documents the retry cron gave up on', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    listFiscalAttention.mockResolvedValue({
      documents: [
        {
          id: 1,
          doc_type: 'sale',
          sale_id: 10,
          refund_id: null,
          receipt_number: 'R-00042',
          total_cents: 10000,
          error_code: 'rejected',
          error_message: 'ПРРО відхилило чек',
          attempts: 8,
          created_at: '2026-09-09T10:00:00.000Z',
        },
      ],
    });
    renderWithProviders(<CheckboxAdminPage />);

    expect(await screen.findByText('R-00042')).toBeInTheDocument();
    expect(screen.getByText('ПРРО відхилило чек')).toBeInTheDocument();
  });

  it('puts a parked offline session above the rejected documents', async () => {
    // A stuck session is the bigger hole: its receipts may never have been sent
    // at all, and nothing automatic will send them now.
    getFiscalSettingsView.mockResolvedValue(settingsView());
    listFiscalAttention.mockResolvedValue({
      documents: [],
      sessions: [
        {
          id: 12,
          holder: 'server',
          device_id: null,
          status: 'stuck',
          started_at: '2026-09-11T11:02:00.000Z',
          ended_at: null,
          go_offline_sent: true,
          last_go_online_at: null,
          documents: { pending: 4, done: 1, abandoned: 0 },
          error_code: 'rejected',
          error_message: 'ПРРО відхилило офлайн-чек',
        },
      ],
    });
    renderWithProviders(<CheckboxAdminPage />);

    expect(await screen.findByText(/Офлайн-сесія #12 зупинена/)).toBeInTheDocument();
    expect(screen.getByText(/ПРРО відхилило офлайн-чек/)).toBeInTheDocument();
    expect(screen.getByText(/не надіслано: 4/)).toBeInTheDocument();
  });

  it('does not mention the register lock while offline mode is off', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    renderWithProviders(<CheckboxAdminPage />);

    await screen.findByText('Ліцензійний ключ');
    expect(screen.queryByText('Каса ПРРО')).not.toBeInTheDocument();
  });

  it('withholds the force button until a till has actually asked for the register', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    getFiscalStatus.mockResolvedValue(offlineOn(heldBy()));
    renderWithProviders(<CheckboxAdminPage />);

    expect(await screen.findByText(/Зайнята: «Каса 1»/)).toBeInTheDocument();
    // With no pending request the backend has no target and would answer 400
    // `no_target`, so the owner is told what to do instead.
    expect(screen.queryByRole('button', { name: 'Забрати касу примусово' })).not.toBeInTheDocument();
    expect(screen.getByText(/надішліть запит із тієї каси/i)).toBeInTheDocument();
  });

  it('reports what forcing the handover actually cost', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    getFiscalStatus.mockResolvedValue(
      offlineOn(
        heldBy({
          stale: true,
          handover_request: {
            device_id: 'ff00ff0011223344',
            name: 'Каса 2',
            requested_at: '2026-09-11T09:41:00.000Z',
          },
        })
      )
    );
    forceHandover.mockResolvedValue({
      status: 'ok',
      holder: heldBy({ device_id: 'ff00ff0011223344', name: 'Каса 2' }),
      stuck_sessions: 1,
      burned_codes: 12,
    });
    renderWithProviders(<CheckboxAdminPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Забрати касу примусово' }));

    expect(await screen.findByText(/Зупинено сесій: 1, згорілих кодів: 12/)).toBeInTheDocument();
  });

  it('says there is nothing to see when the attention list is empty', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    renderWithProviders(<CheckboxAdminPage />);
    expect(
      await screen.findByText('Немає документів, що потребують уваги.')
    ).toBeInTheDocument();
  });
});
