// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/components/HolderPanel.test.tsx
//
// The invariant this file exists for: the web shell never gets a button here.
// It sends no `X-POS-Device-ID`, so every register call answers it 400
// `device_id_required` — a button that always fails is worse than no button,
// because a cashier will keep pressing it while a customer waits.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import { useOfflineStatus } from '../../../offline';
import type { FiscalStatus, HolderStatusBlock } from '../types';

const claimRegister = vi.fn();
const releaseRegister = vi.fn();
const requestHandover = vi.fn();
const confirmHandover = vi.fn();

vi.mock('../data/fiscalApi', () => ({
  claimRegister: () => claimRegister(),
  releaseRegister: () => releaseRegister(),
  requestHandover: () => requestHandover(),
  confirmHandover: (n: number) => confirmHandover(n),
}));

const { HolderPanel } = await import('./HolderPanel');

function holder(over: Partial<HolderStatusBlock> = {}): HolderStatusBlock {
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

function status(over: Partial<FiscalStatus> = {}): FiscalStatus {
  return {
    enabled: true,
    provider: 'checkbox',
    configured: true,
    auto_open_shift: true,
    shift: null,
    error: null,
    holder: null,
    offline: {
      capable: true,
      enabled: true,
      codes_target: 200,
      codes: { free: 180, leased: 0, used: 20 },
      session: null,
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useOfflineStatus.setState({ pending: 0 });
});

describe('HolderPanel', () => {
  it('renders nothing while offline mode is off', () => {
    // Without offline mode the lock is never enforced: several online tills on
    // one register are fine, so there is nothing to report.
    const { container } = renderWithProviders(
      <HolderPanel
        status={status({
          offline: {
            capable: true,
            enabled: false,
            codes_target: 200,
            codes: null,
            session: null,
          },
        })}
        onChanged={() => {}}
      />,
      { shell: 'cashier' }
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lets the cashier take a free register', async () => {
    claimRegister.mockResolvedValue({ holder: holder({ is_me: true }) });
    const onChanged = vi.fn();
    renderWithProviders(<HolderPanel status={status()} onChanged={onChanged} />, {
      shell: 'cashier',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Зайняти касу' }));
    await waitFor(() => expect(claimRegister).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
  });

  it('gives the web shell the same facts and no buttons', () => {
    renderWithProviders(
      <HolderPanel status={status({ holder: holder() })} onChanged={() => {}} />,
      { shell: 'web' }
    );

    expect(screen.getByText(/Каса 1/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names an unnamed device by a short id rather than nothing', () => {
    renderWithProviders(
      <HolderPanel status={status({ holder: holder({ name: null }) })} onChanged={() => {}} />,
      { shell: 'web' }
    );
    expect(screen.getByText(/abcdef12/)).toBeInTheDocument();
  });

  it('points at the owner when the holder went quiet', () => {
    renderWithProviders(
      <HolderPanel status={status({ holder: holder({ stale: true }) })} onChanged={() => {}} />,
      { shell: 'cashier' }
    );
    expect(screen.getByText(/забрати касу примусово/i)).toBeInTheDocument();
  });

  it('asks the other till for a handover and says what happens next', async () => {
    requestHandover.mockResolvedValue({ status: 'requested', holder: holder() });
    renderWithProviders(
      <HolderPanel status={status({ holder: holder() })} onChanged={() => {}} />,
      { shell: 'cashier' }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Запросити передачу' }));
    expect(await screen.findByText(/Підтвердіть його на іншій касі/)).toBeInTheDocument();
  });

  it('reports a register that turned out to be free instead of a pending request', async () => {
    // `handover/request` answers 200 `claimed` when nobody held it — telling the
    // cashier to wait for a confirmation that will never come would strand them.
    requestHandover.mockResolvedValue({ status: 'claimed', holder: holder({ is_me: true }) });
    renderWithProviders(
      <HolderPanel status={status({ holder: holder() })} onChanged={() => {}} />,
      { shell: 'cashier' }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Запросити передачу' }));
    expect(await screen.findByText(/вона була вільна/)).toBeInTheDocument();
  });

  it('sends its own outbox count when the holder confirms', async () => {
    useOfflineStatus.setState({ pending: 2 });
    confirmHandover.mockResolvedValue({ holder: holder() });
    renderWithProviders(
      <HolderPanel
        status={status({
          holder: holder({
            is_me: true,
            handover_request: {
              device_id: 'ff00ff0011223344',
              name: 'Каса 2',
              requested_at: '2026-09-11T09:41:00.000Z',
            },
          }),
        })}
        onChanged={() => {}}
      />,
      { shell: 'cashier' }
    );

    expect(screen.getByText(/«Каса 2»/)).toBeInTheDocument();
    expect(screen.getByText(/що очікують: 2/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Передати касу' }));
    await waitFor(() => expect(confirmHandover).toHaveBeenCalledWith(2));
  });

  it('shows the backend reason when a handover is refused', async () => {
    confirmHandover.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'handover_blocked',
          message: 'Спершу синхронізуйте чеки, що очікують відправки',
          support_code: 'FS-HANDOVER-BLOCKED',
        },
      },
    });
    const onChanged = vi.fn();
    renderWithProviders(
      <HolderPanel
        status={status({
          holder: holder({
            is_me: true,
            handover_request: {
              device_id: 'ff00ff0011223344',
              name: 'Каса 2',
              requested_at: '2026-09-11T09:41:00.000Z',
            },
          }),
        })}
        onChanged={onChanged}
      />,
      { shell: 'cashier' }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Передати касу' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/синхронізуйте чеки/);
    // A refusal is a state change too — the rejection carries the current
    // holder, so the screen re-reads it rather than keeping a stale one.
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('lets the holder release the register', async () => {
    releaseRegister.mockResolvedValue({ holder: null });
    renderWithProviders(
      <HolderPanel status={status({ holder: holder({ is_me: true }) })} onChanged={() => {}} />,
      { shell: 'cashier' }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Звільнити касу' }));
    await waitFor(() => expect(releaseRegister).toHaveBeenCalled());
  });
});
