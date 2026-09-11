// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/components/OfflinePanel.test.tsx
//
// Two things worth pinning: a store that does not sell offline sees nothing at
// all, and the three live session states never read as each other — «працюємо
// офлайн» (keep selling), «надсилаємо» (wait) and `stuck` (fetch the owner) are
// three different jobs for whoever is at the till.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OfflinePanel } from './OfflinePanel';
import type { FiscalStatus, OfflineSessionView } from '../types';

function session(over: Partial<OfflineSessionView> = {}): OfflineSessionView {
  return {
    id: 1,
    holder: 'server',
    device_id: null,
    status: 'open',
    started_at: '2026-09-11T11:02:00.000Z',
    ended_at: null,
    go_offline_sent: false,
    last_go_online_at: null,
    documents: { pending: 3, done: 0, abandoned: 0 },
    error_code: null,
    error_message: null,
    ...over,
  };
}

function status(over: Partial<FiscalStatus['offline']> = {}): FiscalStatus {
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
      ...over,
    },
  };
}

describe('OfflinePanel', () => {
  it('renders nothing for a store with offline mode off', () => {
    const { container } = render(
      <OfflinePanel status={status({ enabled: false, codes: null })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the provider cannot go offline at all', () => {
    const { container } = render(
      <OfflinePanel status={status({ capable: false, enabled: false, codes: null })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the reserve without a warning while it is healthy', () => {
    render(<OfflinePanel status={status()} />);
    expect(screen.getByText(/Запас фіскальних кодів: 180/)).toBeInTheDocument();
    expect(screen.queryByText(/майже вичерпано/i)).not.toBeInTheDocument();
  });

  it('warns once the reserve is under a quarter of the target', () => {
    render(<OfflinePanel status={status({ codes: { free: 40, leased: 0, used: 160 } })} />);
    expect(screen.getByText(/майже вичерпано/i)).toBeInTheDocument();
  });

  it('tells the cashier to keep selling while a session is open', () => {
    render(<OfflinePanel status={status({ session: session() })} />);
    expect(screen.getByText(/Працюємо офлайн з/)).toBeInTheDocument();
    expect(screen.getByText(/Чеків у сесії: 3/)).toBeInTheDocument();
  });

  it('shows replay progress out of the whole session, not just what is left', () => {
    render(
      <OfflinePanel
        status={status({
          session: session({
            status: 'replaying',
            go_offline_sent: true,
            documents: { pending: 2, done: 7, abandoned: 0 },
          }),
        })}
      />
    );
    expect(screen.getByText(/Надсилаємо чеки в ДПС/)).toBeInTheDocument();
    expect(screen.getByText(/7 з 9/)).toBeInTheDocument();
  });

  it('sends the cashier to the owner for a stuck session', () => {
    // `stuck` is the one state nothing automatic will clear: the replay stopped
    // rather than guess, and a human has to settle it with the provider.
    render(
      <OfflinePanel
        status={status({
          session: session({
            status: 'stuck',
            error_code: 'register_taken',
            error_message: 'Касу примусово передано іншому пристрою',
            documents: { pending: 4, done: 1, abandoned: 0 },
          }),
        })}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/не надіслані в ДПС/);
    expect(screen.getByText(/Касу примусово передано/)).toBeInTheDocument();
    expect(screen.getByText(/Чеків у сесії: 5/)).toBeInTheDocument();
  });
});
