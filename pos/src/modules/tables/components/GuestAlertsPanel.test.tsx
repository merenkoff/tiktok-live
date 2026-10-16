// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GuestAlertsPanel } from './GuestAlertsPanel';
import type { SentGuestOrder, WaiterCall } from '../lib/types';

const call = (over: Partial<WaiterCall> = {}): WaiterCall => ({
  id: 70,
  kind: 'waiter',
  table_id: 11,
  table_name: '5',
  hall_name: 'Тераса',
  created_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  expires_at: new Date(Date.now() + 12 * 60_000).toISOString(),
  has_open_bill: false,
  ...over,
});

const sent = (over: Partial<SentGuestOrder> = {}): SentGuestOrder => ({
  id: 80,
  table_id: 11,
  table_name: '5',
  hall_name: 'Тераса',
  created_at: new Date().toISOString(),
  bill_id: 90,
  round_seq: 2,
  bill_opened_by_guest: false,
  total_cents: 28500,
  lines: [{ name: 'Борщ', caption: 'зі сметаною', quantity: 2, note: 'гарячий' }],
  ...over,
});

const noop = async (): Promise<boolean> => true;

describe('GuestAlertsPanel', () => {
  it('draws nothing when no guest is calling and nothing went to the kitchen by itself', () => {
    const { container } = render(<GuestAlertsPanel calls={[]} sent={[]} showTable busy={false} onAnswer={noop} onSeen={noop} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says who calls and what for, and how long ago', () => {
    render(
      <GuestAlertsPanel
        calls={[call(), call({ id: 71, kind: 'bill', table_name: '6', has_open_bill: false })]}
        sent={[]}
        showTable
        busy={false}
        onAnswer={noop}
        onSeen={noop}
      />
    );
    expect(screen.getByTestId('guest-call-70')).toHaveTextContent('Стіл 5 · Кличе офіціанта');
    expect(screen.getByTestId('guest-call-70')).toHaveTextContent('Тераса · 3 хв тому');
    expect(screen.getByTestId('guest-call-70')).toHaveTextContent('3 хв тому');
    expect(screen.getByTestId('guest-call-71')).toHaveTextContent('Просить рахунок');
    expect(screen.getByTestId('guest-call-71')).toHaveTextContent('рахунку ще немає');
  });

  it('sends one «Іду» however fast the waiter taps', async () => {
    let finish: () => void = () => undefined;
    const onAnswer = vi.fn(() => new Promise<boolean>((resolve) => { finish = () => resolve(true); }));
    render(<GuestAlertsPanel calls={[call()]} sent={[]} showTable busy={false} onAnswer={onAnswer} onSeen={noop} />);
    const button = screen.getByTestId('guest-call-answer-70');
    await userEvent.click(button);
    await userEvent.click(button);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    finish();
  });

  it('shows an auto-sent order with its dishes and sum, and a «Бачу»', async () => {
    const onSeen = vi.fn(noop);
    const onOpenBill = vi.fn();
    render(
      <GuestAlertsPanel calls={[]} sent={[sent()]} showTable busy={false} onAnswer={noop} onSeen={onSeen} onOpenBill={onOpenBill} />
    );
    const card = screen.getByTestId('guest-sent-80');
    expect(card).toHaveTextContent('Стіл 5 · Тераса');
    expect(card).toHaveTextContent('Уже на кухні · замовлення 2');
    expect(card).toHaveTextContent('2×Борщ');
    expect(card).toHaveTextContent('зі сметаною · «гарячий»');
    expect(card).toHaveTextContent(/285,00\s₴/);
    expect(card).toHaveTextContent('кухня вже готує');
    await userEvent.click(within(card).getByTestId('guest-sent-seen-80'));
    expect(onSeen).toHaveBeenCalledWith(expect.objectContaining({ id: 80 }));
    await userEvent.click(within(card).getByTestId('guest-sent-open-80'));
    expect(onOpenBill).toHaveBeenCalledWith(90);
  });

  it('says before the tap that «Бачу» takes a table a guest opened', () => {
    render(
      <GuestAlertsPanel calls={[]} sent={[sent({ bill_opened_by_guest: true })]} showTable={false} busy={false} onAnswer={noop} onSeen={noop} />
    );
    const card = screen.getByTestId('guest-sent-80');
    expect(card).toHaveTextContent('Рахунок відкрив гість, стіл ще нічий — «Бачу» закріпить його за вами.');
    // On the bill screen: no table name, and no way to «open» the bill it is already on.
    expect(card).toHaveTextContent('Гість замовив сам');
    expect(within(card).queryByTestId('guest-sent-open-80')).toBeNull();
  });

  it('lets nothing start while another write is on its way', () => {
    render(<GuestAlertsPanel calls={[call()]} sent={[sent()]} showTable busy onAnswer={noop} onSeen={noop} />);
    expect(screen.getByTestId('guest-call-answer-70')).toBeDisabled();
    expect(screen.getByTestId('guest-sent-seen-80')).toBeDisabled();
  });
});
