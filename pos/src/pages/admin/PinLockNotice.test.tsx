// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/PinLockNotice.test.tsx
//
// The owner learns on «Співробітники» that wrong PINs closed PIN login, and
// reopens it in one tap. Nothing shows while it is open or the backend is old.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';

type Status = { misses: number; locked_until: string | null; blocked: boolean };

const posRequest = vi.fn<[string, string, unknown?], Promise<Status>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: { posRequest: (m: string, p: string, b?: unknown) => posRequest(m, p, b) },
  };
});

const { PinLockNotice } = await import('./PinLockNotice');

const OPEN: Status = { misses: 0, locked_until: null, blocked: false };
const BLOCKED: Status = { misses: 10, locked_until: '2026-10-30T17:42:00.000Z', blocked: true };

beforeEach(() => posRequest.mockReset());

describe('PinLockNotice', () => {
  it('says nothing while PIN login is open, and nothing to an older backend', async () => {
    posRequest.mockResolvedValueOnce({ misses: 3, locked_until: null, blocked: false });
    const open = renderWithProviders(<PinLockNotice />);
    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('get', '/staff/pin-lock', undefined));
    expect(open.container).toBeEmptyDOMElement();
    open.unmount();

    posRequest.mockRejectedValueOnce({ response: { status: 404 } });
    const older = renderWithProviders(<PinLockNotice />);
    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(2));
    expect(older.container).toBeEmptyDOMElement();
  });

  it('shows a block with its time, and unblocks in one tap', async () => {
    posRequest.mockResolvedValueOnce(BLOCKED).mockResolvedValueOnce(OPEN);
    renderWithProviders(<PinLockNotice />);

    expect(await screen.findByText(/^Вхід за PIN заблоковано до \d\d:\d\d$/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('неправильний PIN 10 разів поспіль');

    await userEvent.click(screen.getByRole('button', { name: 'Розблокувати' }));

    expect(posRequest).toHaveBeenLastCalledWith('post', '/staff/pin-lock/reset', undefined);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('calls a wait «закрито», not «заблоковано», and reads again when the page changes a PIN', async () => {
    posRequest.mockResolvedValue({ misses: 6, locked_until: '2026-10-30T17:05:00.000Z', blocked: false });
    const view = renderWithProviders(<PinLockNotice version={0} />);
    expect(await screen.findByText(/^Вхід за PIN закрито до/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('десята закриє вхід на годину');

    posRequest.mockResolvedValue(OPEN);
    view.rerender(<PinLockNotice version={1} />);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(posRequest).toHaveBeenCalledTimes(2);
  });
});
