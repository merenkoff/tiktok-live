// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A guest's request as the waiter sees it: what is on it, what accepting will
// do, what cannot go in — and that the button says so instead of shrugging.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GuestOrdersPanel } from './GuestOrdersPanel';
import { REJECT_REASONS } from '../lib/guestOrders';
import type { GuestOrder } from '../lib/types';

const request = (over: Partial<GuestOrder> = {}): GuestOrder => ({
  id: 5,
  table_id: 11,
  table_name: '5',
  hall_name: 'Зала',
  created_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  expires_at: new Date(Date.now() + 27 * 60_000).toISOString(),
  has_open_bill: true,
  lines: [
    { id: 51, name: 'Борщ', caption: 'зі сметаною', quantity: 2, note: 'без цибулі', problem: null },
    { id: 52, name: 'Стейк', caption: '', quantity: 1, note: '', problem: null },
  ],
  ...over,
});

function setup(orders: GuestOrder[], over: Partial<Parameters<typeof GuestOrdersPanel>[0]> = {}) {
  const onAccept = vi.fn().mockResolvedValue({ ok: true });
  const onReject = vi.fn().mockResolvedValue(true);
  render(
    <GuestOrdersPanel orders={orders} showTable busy={false} onAccept={onAccept} onReject={onReject} {...over} />
  );
  return { onAccept, onReject };
}

describe('GuestOrdersPanel', () => {
  it('draws nothing when nobody is asking', () => {
    const { container } = render(
      <GuestOrdersPanel orders={[]} showTable busy={false} onAccept={vi.fn()} onReject={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('says whose request it is, what was asked for, and how long ago', () => {
    setup([request()]);
    const card = screen.getByTestId('guest-order-5');
    expect(card).toHaveTextContent('Стіл 5 · Зала');
    expect(card).toHaveTextContent('3 хв тому');
    expect(within(card).getByTestId('guest-line-51')).toHaveTextContent('2×');
    expect(within(card).getByTestId('guest-line-51')).toHaveTextContent('Борщ');
    expect(within(card).getByTestId('guest-line-51')).toHaveTextContent('зі сметаною');
    expect(within(card).getByTestId('guest-line-51')).toHaveTextContent('«без цибулі»');
  });

  it('names the table only where the waiter is not already at it', () => {
    setup([request()], { showTable: false });
    const card = screen.getByTestId('guest-order-5');
    expect(card).toHaveTextContent('Гість просить');
    expect(card).not.toHaveTextContent('Зала');
  });

  it('says what accepting will do to the bill before anyone taps it', () => {
    setup([request({ has_open_bill: true }), request({ id: 6, has_open_bill: false })]);
    expect(screen.getByTestId('guest-order-5')).toHaveTextContent('Додасться до рахунку столу');
    expect(screen.getByTestId('guest-order-6')).toHaveTextContent('Відкриється рахунок столу');
    expect(screen.getByTestId('guest-order-5')).toHaveTextContent('на кухню піде після вашого «Прийняти»');
  });

  it('accepts everything with a plain «Прийняти»', async () => {
    const { onAccept } = setup([request()]);
    const button = screen.getByTestId('guest-order-accept-5');
    expect(button).toHaveTextContent('Прийняти');
    await userEvent.click(button);
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), []);
  });

  it('strikes through a dish that cannot go in and accepts the rest — saying so on the button', async () => {
    const stopped = request({
      lines: [
        { id: 51, name: 'Борщ', caption: '', quantity: 1, note: '', problem: null },
        { id: 52, name: 'Стейк', caption: '', quantity: 1, note: '', problem: 'сьогодні в стоп-листі' },
      ],
    });
    const { onAccept } = setup([stopped]);
    expect(screen.getByTestId('guest-line-52')).toHaveAttribute('data-blocked', 'yes');
    expect(screen.getByTestId('guest-line-52')).toHaveTextContent('сьогодні в стоп-листі');
    expect(screen.getByTestId('guest-line-51')).toHaveAttribute('data-blocked', 'no');
    const button = screen.getByTestId('guest-order-accept-5');
    expect(button).toHaveTextContent('Прийняти без цієї');
    await userEvent.click(button);
    // The blocked line is named to the server so the whole accept does not fail on it.
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), [52]);
  });

  it('marks the line a refused accept named, so the next tap goes without it', async () => {
    const onAccept = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, refusedLineId: 52 })
      .mockResolvedValueOnce({ ok: true });
    setup([request()], { onAccept });
    await userEvent.click(screen.getByTestId('guest-order-accept-5'));
    expect(onAccept).toHaveBeenLastCalledWith(expect.objectContaining({ id: 5 }), []);

    // The server said it was the steak: it is struck through now and the
    // button changed its words.
    expect(await screen.findByTestId('guest-line-52')).toHaveAttribute('data-blocked', 'yes');
    expect(screen.getByTestId('guest-line-51')).toHaveAttribute('data-blocked', 'no');
    expect(screen.getByTestId('guest-order-accept-5')).toHaveTextContent('Прийняти без цієї');

    await userEvent.click(screen.getByTestId('guest-order-accept-5'));
    expect(onAccept).toHaveBeenLastCalledWith(expect.objectContaining({ id: 5 }), [52]);
  });

  it('marks nothing when the refusal is not about a line', async () => {
    const onAccept = vi.fn().mockResolvedValue({ ok: false, refusedLineId: null });
    setup([request()], { onAccept });
    await userEvent.click(screen.getByTestId('guest-order-accept-5'));
    expect(screen.getByTestId('guest-line-52')).toHaveAttribute('data-blocked', 'no');
    expect(screen.getByTestId('guest-order-accept-5')).toHaveTextContent('Прийняти');
    expect(screen.getByTestId('guest-order-accept-5')).not.toHaveTextContent('без');
  });

  it('offers only «відхилити» when nothing on the request can go in', () => {
    const allStopped = request({
      lines: [{ id: 52, name: 'Стейк', caption: '', quantity: 1, note: '', problem: 'знято з меню' }],
    });
    setup([allStopped]);
    expect(screen.queryByTestId('guest-order-accept-5')).toBeNull();
    expect(screen.getByTestId('guest-order-none-5')).toHaveTextContent('відхиліть запит');
    expect(screen.getByTestId('guest-order-reject-5')).toBeInTheDocument();
  });

  it('turns a request down with a reason the guest will read', async () => {
    const { onReject } = setup([request()]);
    await userEvent.click(screen.getByTestId('guest-order-reject-5'));
    // The reasons replace the buttons; nothing is rejected by the first tap.
    expect(onReject).not.toHaveBeenCalled();
    expect(screen.queryByTestId('guest-order-accept-5')).toBeNull();
    await userEvent.click(screen.getByTestId('guest-order-reason-5-0'));
    expect(onReject).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), REJECT_REASONS[0]);
    // Rejected, so the picker closes and the card is back to its buttons.
    expect(await screen.findByTestId('guest-order-accept-5')).toBeInTheDocument();
  });

  it('brings the reasons into view when the card sits in a box that scrolls', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      setup([request(), request({ id: 6 })]);
      await userEvent.click(screen.getByTestId('guest-order-reject-6'));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      // The card that was tapped, not the first one in the list.
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId('guest-order-6'));
    } finally {
      delete (Element.prototype as unknown as Record<string, unknown>).scrollIntoView;
    }
  });

  it('turns a request down without a reason, and can back out of it', async () => {
    const { onReject } = setup([request()]);
    await userEvent.click(screen.getByTestId('guest-order-reject-5'));
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(onReject).not.toHaveBeenCalled();
    expect(screen.getByTestId('guest-order-accept-5')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('guest-order-reject-5'));
    await userEvent.click(screen.getByTestId('guest-order-reason-none-5'));
    expect(onReject).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), null);
  });

  it('keeps the reasons open when the server refused the rejection', async () => {
    const onReject = vi.fn().mockResolvedValue(false);
    setup([request()], { onReject });
    await userEvent.click(screen.getByTestId('guest-order-reject-5'));
    await userEvent.click(screen.getByTestId('guest-order-reason-none-5'));
    expect(screen.getByTestId('guest-order-reasons-5')).toBeInTheDocument();
  });

  it('starts nothing while a write is in flight', () => {
    setup([request()], { busy: true });
    expect(screen.getByTestId('guest-order-accept-5')).toBeDisabled();
    expect(screen.getByTestId('guest-order-reject-5')).toBeDisabled();
  });

  it('lists several requests, oldest first as the server sent them', () => {
    setup([request({ id: 5 }), request({ id: 6, table_name: '7' })]);
    const cards = screen.getAllByTestId(/^guest-order-\d+$/);
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual(['guest-order-5', 'guest-order-6']);
    expect(cards[1]).toHaveTextContent('Стіл 7');
  });
});
