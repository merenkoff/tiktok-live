// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/PublicMenuCard.test.tsx
//
// The owner's QR-menu card: a price list going public is an owner's decision,
// so the card must show only to them, only for a café, and must not let an
// accidental click retire the QR codes standing on every table.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';

type Settings = {
  available: boolean;
  enabled: boolean;
  token: string | null;
  url: string | null;
  tables?: number;
  bill_enabled?: boolean;
  print?: string | null;
};

const posRequest = vi.fn<[string, string, unknown?], Promise<Settings>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: { posRequest: (m: string, p: string, b?: unknown) => posRequest(m, p, b) },
  };
});

const { PublicMenuCard } = await import('./PublicMenuCard');

const OFF: Settings = { available: true, enabled: false, token: null, url: null };
const ON: Settings = {
  available: true,
  enabled: true,
  token: 'tok_ABCdef123456',
  url: 'https://the-live.shop/m/tok_ABCdef123456',
};

const toggle = () => screen.getByLabelText('Показувати меню гостям');

beforeEach(() => {
  posRequest.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('PublicMenuCard', () => {
  it('shows nothing to a seller (403) and nothing for a store with no kitchen', async () => {
    posRequest.mockRejectedValueOnce({ response: { status: 403 } });
    const seller = renderWithProviders(<PublicMenuCard />);
    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    expect(seller.container).toBeEmptyDOMElement();
    seller.unmount();

    posRequest.mockResolvedValueOnce({ ...OFF, available: false });
    const boutique = renderWithProviders(<PublicMenuCard />);
    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(2));
    expect(boutique.container).toBeEmptyDOMElement();
  });

  it('reads the settings through the generic client, and shows an off switch with no address', async () => {
    posRequest.mockResolvedValue(OFF);
    renderWithProviders(<PublicMenuCard />);

    expect(await screen.findByText('QR-меню для гостей')).toBeInTheDocument();
    expect(posRequest).toHaveBeenCalledWith('get', '/store/public-menu', undefined);
    expect(toggle()).not.toBeChecked();
    expect(screen.queryByText('Друкувати QR')).not.toBeInTheDocument();
    expect(screen.queryByText('Створити нове посилання')).not.toBeInTheDocument();
  });

  it('turns the menu on, then shows the address and the print link the server draws', async () => {
    posRequest.mockResolvedValueOnce(OFF).mockResolvedValueOnce(ON);
    renderWithProviders(<PublicMenuCard />);
    await screen.findByText('QR-меню для гостей');

    await userEvent.click(toggle());

    expect(posRequest).toHaveBeenLastCalledWith('patch', '/store/public-menu', { enabled: true });
    expect(await screen.findByDisplayValue(ON.url!)).toBeInTheDocument();
    expect(screen.getByText('Друкувати QR')).toHaveAttribute('href', `${ON.url}/qr`);
    expect(screen.getByText('Друкувати QR')).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Відкрити меню')).toHaveAttribute('href', ON.url);
    expect(screen.getByRole('status')).toHaveTextContent('Меню відкрито для гостей.');
  });

  it('offers one sheet with a QR for every table, only when the store has tables', async () => {
    posRequest.mockResolvedValueOnce({ ...ON, tables: 12 });
    const withTables = renderWithProviders(<PublicMenuCard />);
    const link = await screen.findByText('QR для всіх столів (12)');
    expect(link).toHaveAttribute('href', `${ON.url}/tables`); // no print link in this answer
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    withTables.unmount();

    // A café with no halls (and an older backend that sends no count) sees nothing to print.
    posRequest.mockResolvedValueOnce({ ...ON, tables: 0 });
    const none = renderWithProviders(<PublicMenuCard />);
    await screen.findByText('Друкувати QR');
    expect(screen.queryByText(/QR для всіх столів/)).not.toBeInTheDocument();
    none.unmount();

    posRequest.mockResolvedValueOnce(ON);
    renderWithProviders(<PublicMenuCard />);
    await screen.findByText('Друкувати QR');
    expect(screen.queryByText(/QR для всіх столів/)).not.toBeInTheDocument();
  });

  it('signs the sheet of tables with the print link the server sent, and refuses one that is not the server’s shape', async () => {
    const print = `1790750000.${'D'.repeat(43)}`;
    posRequest.mockResolvedValueOnce({ ...ON, tables: 4, print });
    const signed = renderWithProviders(<PublicMenuCard />);
    expect(await screen.findByText('QR для всіх столів (4)')).toHaveAttribute('href', `${ON.url}/tables?p=${print}`);
    signed.unmount();

    posRequest.mockResolvedValueOnce({ ...ON, tables: 4, print: 'x&y=1' });
    renderWithProviders(<PublicMenuCard />);
    expect(await screen.findByText('QR для всіх столів (4)')).toHaveAttribute('href', `${ON.url}/tables`);
  });

  it('offers the guest-bill switch only where there are tables, and keeps it once it is on', async () => {
    posRequest.mockResolvedValueOnce({ ...ON, tables: 0 });
    const counter = renderWithProviders(<PublicMenuCard />);
    await screen.findByText('Друкувати QR');
    expect(screen.queryByLabelText('Показувати гостю рахунок його столу')).not.toBeInTheDocument();
    counter.unmount();

    posRequest.mockResolvedValueOnce({ ...ON, tables: 0, bill_enabled: true });
    const stillOn = renderWithProviders(<PublicMenuCard />);
    expect(await screen.findByLabelText('Показувати гостю рахунок його столу')).toBeChecked();
    stillOn.unmount();

    posRequest.mockResolvedValueOnce({ ...ON, tables: 6, bill_enabled: false });
    renderWithProviders(<PublicMenuCard />);
    expect(await screen.findByLabelText('Показувати гостю рахунок його столу')).not.toBeChecked();
  });

  it('switches the guest bill with its own field, leaving the menu’s switch alone', async () => {
    posRequest
      .mockResolvedValueOnce({ ...ON, tables: 6, bill_enabled: false })
      .mockResolvedValueOnce({ ...ON, tables: 6, bill_enabled: true });
    renderWithProviders(<PublicMenuCard />);
    await userEvent.click(await screen.findByLabelText('Показувати гостю рахунок його столу'));

    expect(posRequest).toHaveBeenLastCalledWith('patch', '/store/public-menu', { bill_enabled: true });
    expect(await screen.findByLabelText('Показувати гостю рахунок його столу')).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('бачитиме рахунок');
    expect(toggle()).toBeChecked(); // the menu itself is still published
  });

  it('turns it off and hides the address, keeping the retire button (the token still exists)', async () => {
    posRequest
      .mockResolvedValueOnce(ON)
      .mockResolvedValueOnce({ ...ON, enabled: false });
    renderWithProviders(<PublicMenuCard />);
    await screen.findByDisplayValue(ON.url!);

    await userEvent.click(toggle());

    await waitFor(() => expect(screen.queryByDisplayValue(ON.url!)).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Меню вимкнено');
    expect(screen.getByText('Створити нове посилання')).toBeInTheDocument();
  });

  it('asks before retiring the printed QR codes, and does nothing on cancel', async () => {
    posRequest.mockResolvedValue(ON);
    renderWithProviders(<PublicMenuCard />);
    await screen.findByDisplayValue(ON.url!);

    await userEvent.click(screen.getByText('Створити нове посилання'));
    expect(screen.getByText(/Роздруковані QR стануть недійсними/)).toBeInTheDocument();
    expect(posRequest).toHaveBeenCalledTimes(1); // the initial read only

    await userEvent.click(screen.getByText('Скасувати'));
    expect(screen.queryByText(/Роздруковані QR стануть недійсними/)).not.toBeInTheDocument();
    expect(posRequest).toHaveBeenCalledTimes(1);
  });

  it('rotates on confirmation and shows the new address', async () => {
    const fresh = { ...ON, token: 'tok_NEW_654321xx', url: 'https://the-live.shop/m/tok_NEW_654321xx' };
    posRequest.mockResolvedValueOnce(ON).mockResolvedValueOnce(fresh);
    renderWithProviders(<PublicMenuCard />);
    await screen.findByDisplayValue(ON.url!);

    await userEvent.click(screen.getByText('Створити нове посилання'));
    await userEvent.click(screen.getByText('Так, створити нове'));

    expect(posRequest).toHaveBeenLastCalledWith('post', '/store/public-menu/rotate', undefined);
    expect(await screen.findByDisplayValue(fresh.url)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Старі QR більше не працюють');
  });

  it('says why a save failed instead of swallowing it', async () => {
    posRequest
      .mockResolvedValueOnce(OFF)
      .mockRejectedValueOnce({ response: { status: 409, data: { error: 'Меню за QR доступне для кав’ярні й ресторану' } } });
    renderWithProviders(<PublicMenuCard />);
    await screen.findByText('QR-меню для гостей');

    await userEvent.click(toggle());

    expect(await screen.findByRole('status')).toHaveTextContent('Меню за QR доступне для кав’ярні й ресторану');
    expect(toggle()).not.toBeChecked();
  });

  it('copies the address, and falls back to selecting it when the clipboard is refused', async () => {
    posRequest.mockResolvedValue(ON);
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithProviders(<PublicMenuCard />);
    await screen.findByDisplayValue(ON.url!);

    await userEvent.click(screen.getByText('Копіювати посилання'));
    expect(writeText).toHaveBeenCalledWith(ON.url);
    expect(screen.getByRole('status')).toHaveTextContent('Посилання скопійовано.');

    await userEvent.click(screen.getByText('Копіювати посилання'));
    expect(screen.getByRole('status')).toHaveTextContent('скопіюйте його вручну');
  });

  it('offers a retry when the settings cannot be loaded', async () => {
    posRequest.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(OFF);
    renderWithProviders(<PublicMenuCard />);

    await userEvent.click(await screen.findByText('Спробувати ще раз'));
    expect(await screen.findByLabelText('Показувати меню гостям')).toBeInTheDocument();
  });
});
