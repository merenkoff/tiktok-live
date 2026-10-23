// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The login form asks for the store code once: a fresh device types it next to
// the email + password (or the PIN), and from then on the field shows the
// remembered code, locked, until someone taps «Змінити». One email may own
// several stores, so the owner's request carries the code too.

import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import { makeAuthResponse, renderWithProviders } from '../test/utils';
import { posApiBase } from '../lib/urls';
import { useAuthStore } from '../hooks/useAuth';
import { LoginPage } from './LoginPage';

const LAST_SLUG_KEY = 'pos_last_store_slug';
const url = (path: string) => `${posApiBase()}${path}`;

function captureOwnerLogin(): { body: Record<string, unknown> | null } {
  const seen: { body: Record<string, unknown> | null } = { body: null };
  server.use(
    http.post(url('/auth/owner/login'), async ({ request }) => {
      seen.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(makeAuthResponse({ store: { slug: 'boutique' } }));
    })
  );
  return seen;
}

function fillOwner(email: string, password: string): void {
  fireEvent.click(screen.getByRole('button', { name: 'Власник' }));
  fireEvent.change(screen.getByLabelText('Email / логін'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: password } });
}

describe('LoginPage — store code', () => {
  it('on a fresh device asks for the code and sends it with the owner login', async () => {
    const seen = captureOwnerLogin();
    renderWithProviders(<LoginPage />, { route: '/login' });

    const code = screen.getByLabelText('Код магазину');
    expect(code).toBeEnabled();
    expect(code).toHaveValue('');
    expect(screen.queryByTestId('store-code-change')).not.toBeInTheDocument();

    fireEvent.change(code, { target: { value: ' Boutique ' } });
    fillOwner('owner@boutique.shop', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
    expect(seen.body).toEqual({
      login: 'owner@boutique.shop',
      password: 'secret',
      store_slug: 'Boutique',
    });
    // What is remembered is the server's spelling of the code.
    expect(localStorage.getItem(LAST_SLUG_KEY)).toBe('boutique');
  });

  it('refuses to submit without a code, in words', async () => {
    const seen = captureOwnerLogin();
    renderWithProviders(<LoginPage />, { route: '/login' });

    fillOwner('owner@boutique.shop', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(await screen.findByText('Введіть код магазину')).toBeInTheDocument();
    expect(seen.body).toBeNull();
  });

  it('shows a remembered code locked, and «Змінити» unlocks it', async () => {
    localStorage.setItem(LAST_SLUG_KEY, 'boutique');
    const seen = captureOwnerLogin();
    renderWithProviders(<LoginPage />, { route: '/login' });

    const code = screen.getByLabelText('Код магазину');
    expect(code).toBeDisabled();
    expect(code).toHaveValue('boutique');

    // Locked, it is still what the login sends — only email + password typed.
    fillOwner('owner@boutique.shop', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    await waitFor(() => expect(seen.body).not.toBeNull());
    expect(seen.body?.store_slug).toBe('boutique');
  });

  it('unlocks the code for editing and focuses it', () => {
    localStorage.setItem(LAST_SLUG_KEY, 'boutique');
    renderWithProviders(<LoginPage />, { route: '/login' });

    fireEvent.click(screen.getByTestId('store-code-change'));

    const code = screen.getByLabelText('Код магазину');
    expect(code).toBeEnabled();
    expect(code).toHaveFocus();
    expect(screen.queryByTestId('store-code-change')).not.toBeInTheDocument();
  });

  it('uses the same remembered code for the PIN login', async () => {
    localStorage.setItem(LAST_SLUG_KEY, 'boutique');
    let sent: unknown = null;
    server.use(
      http.post(url('/auth/staff/pin'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          makeAuthResponse({ staff: { id: 2, display_name: 'Ігор', role: 'seller' } })
        );
      })
    );
    renderWithProviders(<LoginPage />, { route: '/login' });

    expect(screen.getByLabelText('Код магазину')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));

    await waitFor(() => expect(sent).toEqual({ store_slug: 'boutique', pin: '1234' }));
  });

  it('says which fields could be wrong on a 401, in Ukrainian', async () => {
    server.use(
      http.post(url('/auth/owner/login'), () =>
        HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      )
    );
    renderWithProviders(<LoginPage />, { route: '/login' });

    fireEvent.change(screen.getByLabelText('Код магазину'), { target: { value: 'boutique' } });
    fillOwner('owner@boutique.shop', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(
      await screen.findByText('Невірний email, пароль або код магазину.')
    ).toBeInTheDocument();
    // A failed login remembers nothing.
    expect(localStorage.getItem(LAST_SLUG_KEY)).toBeNull();
  });
});

describe('bootstrap — a session that predates the remembered code', () => {
  it('learns the code from /me without touching the session', async () => {
    const auth = makeAuthResponse({ store: { slug: 'boutique' } });
    localStorage.setItem('pos_token', auth.token);
    localStorage.setItem('pos_auth', JSON.stringify(auth));
    server.use(http.get(url('/me'), () => HttpResponse.json(auth)));

    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().auth?.token).toBe(auth.token);
    expect(localStorage.getItem('pos_token')).toBe(auth.token);
    expect(localStorage.getItem(LAST_SLUG_KEY)).toBe('boutique');
  });
});
