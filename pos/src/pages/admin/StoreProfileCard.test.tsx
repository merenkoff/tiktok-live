// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/StoreProfileCard.test.tsx
//
// The owner's «Про заклад у меню»: what the guest reads under the store's name.
// The rules worth pinning: only the owner sees it, a field the owner did not
// touch is not re-sent, a week with no working day is «no hours» (never
// «closed all week»), and a bad picture is turned back before it is uploaded.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';

type Week = Record<string, { open: string; close: string }>;
type Profile = {
  available: boolean;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  hours: Week | null;
};

const posRequest = vi.fn<[string, string, unknown?, unknown?], Promise<unknown>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: { posRequest: (m: string, p: string, b?: unknown, o?: unknown) => posRequest(m, p, b, o) },
  };
});

const { StoreProfileCard } = await import('./StoreProfileCard');

const EMPTY: Profile = { available: true, logo_url: null, address: null, phone: null, hours: null };
const FILLED: Profile = {
  available: true,
  logo_url: '/pos-uploads/logo-1.png',
  address: 'м. Київ, вул. Прикладна, 1',
  phone: '+380 44 123 45 67',
  hours: {
    '1': { open: '08:00', close: '22:00' },
    '2': { open: '08:00', close: '22:00' },
    '6': { open: '09:00', close: '23:00' },
  },
};

const address = () => screen.getByLabelText('Адреса');
const phone = () => screen.getByLabelText('Телефон');
const save = () => screen.getByRole('button', { name: 'Зберегти' });
const day = (name: string) => screen.getByLabelText(name);
const png = (size = 10) => new File([new Uint8Array(size)], 'logo.png', { type: 'image/png' });

const lastPatch = () => {
  const calls = posRequest.mock.calls.filter(([method]) => method === 'patch');
  return calls[calls.length - 1];
};

beforeEach(() => {
  posRequest.mockReset();
});

async function open(profile: Profile = EMPTY) {
  posRequest.mockResolvedValueOnce(profile);
  renderWithProviders(<StoreProfileCard />);
  await screen.findByText('Про заклад у меню');
}

describe('StoreProfileCard', () => {
  it('shows nothing to a seller, on an older backend, or for a store with no kitchen', async () => {
    for (const rejection of [{ response: { status: 403 } }, { response: { status: 404 } }]) {
      posRequest.mockReset();
      posRequest.mockRejectedValueOnce(rejection);
      const view = renderWithProviders(<StoreProfileCard />);
      await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
      expect(view.container).toBeEmptyDOMElement();
      view.unmount();
    }

    posRequest.mockReset();
    posRequest.mockResolvedValueOnce({ ...EMPTY, available: false });
    const boutique = renderWithProviders(<StoreProfileCard />);
    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    expect(boutique.container).toBeEmptyDOMElement();
  });

  it('says so, with a retry, when the load fails for any other reason', async () => {
    posRequest.mockRejectedValueOnce({ response: { status: 500 } }).mockResolvedValueOnce(EMPTY);
    renderWithProviders(<StoreProfileCard />);
    expect(await screen.findByText('Не вдалося завантажити дані закладу.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));
    expect(await screen.findByLabelText('Адреса')).toBeInTheDocument();
    expect(posRequest).toHaveBeenNthCalledWith(1, 'get', '/store/profile', undefined, undefined);
  });

  it('reads the profile through the generic client and fills every field from it', async () => {
    await open(FILLED);
    expect(address()).toHaveValue(FILLED.address);
    expect(phone()).toHaveValue(FILLED.phone);
    expect(screen.getByAltText('Логотип')).toHaveAttribute('src', expect.stringContaining('/pos-uploads/logo-1.png'));
    expect(day('Понеділок')).toBeChecked();
    expect(day('Понеділок: з')).toHaveValue('08:00');
    expect(day('Субота: до')).toHaveValue('23:00');
    expect(day('Середа')).not.toBeChecked();
    expect(screen.queryByLabelText('Середа: з')).not.toBeInTheDocument();
  });

  it('sends the address, phone and hours — and not the logo it never touched', async () => {
    await open(FILLED);
    posRequest.mockResolvedValueOnce({ ...FILLED, phone: '+380 44 999 99 99' });
    await userEvent.clear(phone());
    await userEvent.type(phone(), '+380 44 999 99 99');
    await userEvent.click(save());

    await waitFor(() => expect(lastPatch()).toBeDefined());
    const [, path, body] = lastPatch()!;
    expect(path).toBe('/store/profile');
    expect(body).toEqual({
      address: FILLED.address,
      phone: '+380 44 999 99 99',
      hours: FILLED.hours,
    });
    expect(body).not.toHaveProperty('logo_url');
    expect(await screen.findByRole('status')).toHaveTextContent('Збережено');
  });

  it('saves an emptied address and phone as «none», and a week with no working day as «no hours»', async () => {
    await open(FILLED);
    posRequest.mockResolvedValueOnce(EMPTY);
    await userEvent.clear(address());
    await userEvent.clear(phone());
    for (const name of ['Понеділок', 'Вівторок', 'Субота']) await userEvent.click(day(name));
    await userEvent.click(save());

    await waitFor(() => expect(lastPatch()).toBeDefined());
    expect(lastPatch()![2]).toEqual({ address: null, phone: null, hours: null });
  });

  it('turns a day on with a sensible default and sends the times as typed', async () => {
    await open(EMPTY);
    posRequest.mockResolvedValueOnce(EMPTY);
    await userEvent.click(day('Середа'));
    expect(day('Середа: з')).toHaveValue('09:00');
    expect(day('Середа: до')).toHaveValue('18:00');
    fireEvent.change(day('Середа: до'), { target: { value: '02:00' } });
    await userEvent.click(save());

    await waitFor(() => expect(lastPatch()).toBeDefined());
    expect(lastPatch()![2]).toMatchObject({ hours: { '3': { open: '09:00', close: '02:00' } } });
  });

  it('copies the first working day’s hours to the whole week', async () => {
    await open(FILLED);
    posRequest.mockResolvedValueOnce(FILLED);
    await userEvent.click(screen.getByRole('button', { name: 'Так само в усі дні' }));
    expect(day('Неділя')).toBeChecked();
    expect(day('Неділя: з')).toHaveValue('08:00');
    expect(day('Неділя: до')).toHaveValue('22:00');
    await userEvent.click(save());

    await waitFor(() => expect(lastPatch()).toBeDefined());
    const hours = (lastPatch()![2] as { hours: Week }).hours;
    expect(Object.keys(hours).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(hours['7']).toEqual({ open: '08:00', close: '22:00' });
  });

  it('refuses a day whose «з» and «до» are the same, and says how to say «цілодобово», without sending', async () => {
    await open(EMPTY);
    await userEvent.click(day('Понеділок'));
    fireEvent.change(day('Понеділок: до'), { target: { value: '09:00' } });
    await userEvent.click(save());

    expect(await screen.findByRole('status')).toHaveTextContent('Понеділок: «з» і «до» однакові');
    expect(screen.getByRole('status')).toHaveTextContent('00:00–23:59');
    expect(lastPatch()).toBeUndefined();
  });

  it('shows the server’s own words when it refuses a value', async () => {
    await open(EMPTY);
    posRequest.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Телефон: від 7 до 15 цифр' } } });
    await userEvent.type(phone(), '12');
    await userEvent.click(save());
    expect(await screen.findByRole('status')).toHaveTextContent('Телефон: від 7 до 15 цифр');
  });

  describe('the logo', () => {
    it('uploads the file with a long timeout and only makes it the logo when the card is saved', async () => {
      await open(EMPTY);
      posRequest.mockResolvedValueOnce({ url: '/pos-uploads/new.png', filename: 'new.png' });
      await userEvent.upload(screen.getByTestId('logo-file'), png());

      await waitFor(() => expect(screen.getByAltText('Логотип')).toBeInTheDocument());
      const upload = posRequest.mock.calls.find(([, path]) => path === '/store/logo')!;
      expect(upload[0]).toBe('post');
      expect(upload[2]).toBeInstanceOf(FormData);
      expect((upload[2] as FormData).get('file')).toBeInstanceOf(File);
      expect(upload[3]).toEqual({ timeout: 60000 });
      expect(lastPatch()).toBeUndefined(); // stored, not yet the logo

      posRequest.mockResolvedValueOnce({ ...EMPTY, logo_url: '/pos-uploads/new.png' });
      await userEvent.click(save());
      await waitFor(() => expect(lastPatch()).toBeDefined());
      expect(lastPatch()![2]).toMatchObject({ logo_url: '/pos-uploads/new.png' });
    });

    it('turns back what is not a picture, or is over 5 MB, without asking the server', async () => {
      await open(EMPTY);
      const loose = userEvent.setup({ applyAccept: false });
      await loose.upload(screen.getByTestId('logo-file'), new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
      expect(await screen.findByRole('status')).toHaveTextContent('JPEG, PNG, WebP або GIF');

      await loose.upload(screen.getByTestId('logo-file'), png(5 * 1024 * 1024 + 1));
      expect(await screen.findByRole('status')).toHaveTextContent('більший за 5 МБ');
      expect(posRequest.mock.calls.filter(([, path]) => path === '/store/logo')).toHaveLength(0);
    });

    it('shows the server’s refusal of an upload and keeps the old logo', async () => {
      await open(FILLED);
      posRequest.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Файл більше 5 МБ' } } });
      await userEvent.upload(screen.getByTestId('logo-file'), png());
      expect(await screen.findByRole('status')).toHaveTextContent('Файл більше 5 МБ');
      expect(screen.getByAltText('Логотип')).toHaveAttribute('src', expect.stringContaining('logo-1.png'));
    });

    it('removes the logo on «Прибрати», and sends null when saved', async () => {
      await open(FILLED);
      posRequest.mockResolvedValueOnce({ ...FILLED, logo_url: null });
      await userEvent.click(screen.getByRole('button', { name: /Прибрати/ }));
      expect(screen.queryByAltText('Логотип')).not.toBeInTheDocument();
      await userEvent.click(save());

      await waitFor(() => expect(lastPatch()).toBeDefined());
      expect(lastPatch()![2]).toMatchObject({ logo_url: null });
    });
  });
});
