// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The kitchen's strip «Запити з точок» (РК3). It hangs over EVERY till screen
// of a store with this module (`till.Banner`), so the two things that matter
// most are what it does NOT do: poll a store that is no kitchen, and take any
// height while nothing waits.

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestsStrip } from './RequestsStrip';
import { NOT_KITCHEN_RECHECK_MS, REMOTE_POLL_MS, useRemoteRequests } from './useRemoteRequests';
import type { RemoteRequest } from './remoteApi';

function request(over: Partial<RemoteRequest> = {}): RemoteRequest {
  return {
    id: 7,
    status: 'requested',
    revision: 1,
    cafe_name: 'Pulcinella Park',
    guest_label: null,
    note: null,
    prep_minutes: 18,
    load_minutes: 0,
    transit_minutes: 10,
    suggested_minutes: 30,
    answer_deadline_at: new Date(Date.now() + 60_000).toISOString(),
    requested_at: new Date().toISOString(),
    items: [{ id: 1, product_name: 'Маргарита', variant_label: '30 см', quantity: 2, note: '' }],
    ...over,
  };
}

function fakeApi(kitchen: boolean, orders: RemoteRequest[] = []) {
  return {
    isKitchen: vi.fn(async () => kitchen),
    listKitchenSide: vi.fn(async () => ({ orders, now: new Date().toISOString() })),
    answerWithTime: vi.fn(async () => ({})),
    decline: vi.fn(async () => ({})),
    declineDishes: vi.fn(async () => ({})),
  };
}

/** The strip with a fake API; the hook is the real one. */
function stripWith(api: ReturnType<typeof fakeApi>) {
  const useFakeApi = (onNew?: () => void) => useRemoteRequests(onNew, api as never);
  return <RequestsStrip hook={useFakeApi} />;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RequestsStrip', () => {
  it('in a store that is no kitchen, asks once whether it is one and never polls the requests', async () => {
    const api = fakeApi(false, [request()]);
    const { container } = render(stripWith(api));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REMOTE_POLL_MS * 10);
    });
    expect(api.isKitchen).toHaveBeenCalledTimes(1);
    expect(api.listKitchenSide).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();

    // Asked again much later, so a link made today starts without a restart.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOT_KITCHEN_RECHECK_MS);
    });
    expect(api.isKitchen).toHaveBeenCalledTimes(2);
    expect(api.listKitchenSide).not.toHaveBeenCalled();
  });

  it('long-polls with the server’s cursor: the next read waits on the server, not on a timer', async () => {
    const api = fakeApi(true, []);
    let release: (v: { orders: RemoteRequest[]; now: string; cursor: string }) => void = () => undefined;
    api.listKitchenSide
      .mockImplementationOnce(async () => ({ orders: [], now: new Date().toISOString(), cursor: '3.10' }) as never)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve as never;
          }) as never
      )
      .mockImplementationOnce(() => new Promise(() => undefined) as never);
    render(stripWith(api));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REMOTE_POLL_MS * 3);
    });
    // The second read went out at once with the cursor, and nothing else since: it is held.
    expect(api.listKitchenSide).toHaveBeenCalledTimes(2);
    expect(api.listKitchenSide).toHaveBeenLastCalledWith('3.10');

    // A cafe asks: the held read answers and the strip shows it, then waits again.
    await act(async () => {
      release({ orders: [request()], now: new Date().toISOString(), cursor: '4.11' });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByTestId('remote-requests')).toHaveTextContent('Pulcinella Park');
    expect(api.listKitchenSide).toHaveBeenLastCalledWith('4.11');
  });

  it('in a kitchen with nothing waiting, polls and draws nothing', async () => {
    const api = fakeApi(true, []);
    const { container } = render(stripWith(api));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REMOTE_POLL_MS + 10);
    });
    expect(api.listKitchenSide).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a cafe’s request and answers it with the suggested time in one tap', async () => {
    const api = fakeApi(true, [request()]);
    render(stripWith(api));
    expect(await screen.findByTestId('remote-request-7')).toBeInTheDocument();
    expect(screen.getByText('Pulcinella Park')).toBeInTheDocument();
    expect(screen.getByTestId('remote-prep')).toHaveTextContent('20 хв');

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByTestId('remote-answer-7'));
    expect(api.answerWithTime).toHaveBeenCalledWith(expect.objectContaining({ id: 7, revision: 1 }), 20);
  });

  it('a chip picks the cooking time in one tap', async () => {
    const api = fakeApi(true, [request()]);
    render(stripWith(api));
    await screen.findByTestId('remote-request-7');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const chips = screen.getByRole('group', { name: 'Час приготування' });
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['15', '20', '25', '30', '40', '50']);
    await user.click(within(chips).getByRole('button', { name: '40' }));
    expect(screen.getByTestId('remote-prep')).toHaveTextContent('40 хв');
    await user.click(screen.getByTestId('remote-answer-7'));
    expect(api.answerWithTime).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 40);
  });

  it('marks a dish «Немає» and tells the cafe which, instead of a time', async () => {
    const api = fakeApi(true, [
      request({
        items: [
          { id: 1, product_name: 'Маргарита', variant_label: '', quantity: 1, note: '' },
          { id: 2, product_name: 'Карбонара', variant_label: '', quantity: 1, note: '' },
        ],
      }),
    ]);
    render(stripWith(api));
    await screen.findByTestId('remote-request-7');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'Немає: Карбонара' }));
    expect(screen.queryByTestId('remote-answer-7')).toBeNull();
    await user.click(screen.getByTestId('remote-missing-7'));
    expect(api.declineDishes).toHaveBeenCalledWith(expect.objectContaining({ id: 7, revision: 1 }), [2]);
  });

  it('shows a time the server confirmed by itself as a grey card, silently, and lets the cook change it', async () => {
    const onNew = vi.fn();
    const auto = request({
      status: 'quoted',
      quote_source: 'auto',
      quoted_minutes: 30,
      quote_expires_at: new Date(Date.now() + 120_000).toISOString(),
    });
    const api = fakeApi(true, [auto]);
    const useFakeApi = () => useRemoteRequests(onNew, api as never);
    render(<RequestsStrip hook={useFakeApi} />);
    const card = await screen.findByTestId('remote-auto-7');
    expect(card).toHaveTextContent('Автопідтверджено 30 хв');
    expect(screen.queryByText(/Запити з точок/)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REMOTE_POLL_MS + 10);
    });
    expect(onNew).not.toHaveBeenCalled();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(within(card).getByRole('button', { name: 'Змінити час' }));
    await user.click(within(card).getByRole('button', { name: '30' }));
    await user.click(screen.getByTestId('remote-requote-7'));
    expect(api.answerWithTime).toHaveBeenCalledWith(expect.objectContaining({ id: 7, revision: 1 }), 30);
  });

  it('drops a grey card once the guest’s time to agree ran out', async () => {
    const api = fakeApi(true, [
      request({ status: 'quoted', quote_source: 'auto', quote_expires_at: new Date(Date.now() - 1000).toISOString() }),
      request({ id: 8, status: 'quoted', quote_source: 'kitchen', quote_expires_at: new Date(Date.now() + 60_000).toISOString() }),
    ]);
    const { container } = render(stripWith(api));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.listKitchenSide).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('drops a read that started before an answer, so the answered request does not come back', async () => {
    const api = fakeApi(true, [request()]);
    render(stripWith(api));
    await screen.findByTestId('remote-request-7');
    let releaseStale: (v: { orders: RemoteRequest[]; now: string }) => void = () => undefined;
    api.listKitchenSide.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseStale = resolve;
      })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REMOTE_POLL_MS);
    });
    api.listKitchenSide.mockResolvedValue({ orders: [], now: new Date().toISOString() });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByTestId('remote-answer-7'));
    expect(screen.queryByTestId('remote-request-7')).toBeNull();

    await act(async () => {
      releaseStale({ orders: [request()], now: new Date().toISOString() });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByTestId('remote-request-7')).toBeNull();
  });

  it('keeps the screen as it was when a read fails', async () => {
    const api = fakeApi(true, [request()]);
    render(stripWith(api));
    expect(await screen.findByTestId('remote-request-7')).toBeInTheDocument();
    api.listKitchenSide.mockRejectedValue(new Error('network'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REMOTE_POLL_MS + 10);
    });
    expect(screen.getByTestId('remote-request-7')).toBeInTheDocument();
  });
});
