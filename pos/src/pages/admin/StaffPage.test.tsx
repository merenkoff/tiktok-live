// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Співробітники» gives the café's marketer (track МР): the role is offered only
// where the store's vertical carries it, a new marketer is sent with its role,
// becoming one takes a new six-digit PIN, and the server's refusal is shown in
// its own words.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../hooks/useAuth';
import { posApiBase } from '../../lib/urls';
import { server } from '../../test/msw/server';
import { makeAuthResponse, renderWithProviders } from '../../test/utils';
import { StaffPage } from './StaffPage';

const url = (path: string) => `${posApiBase()}${path}`;

const STAFF = [
  { id: 1, store_id: 1, role: 'owner', display_name: 'Олена', login: 'owner@cafe.shop', is_active: true, has_pin: false, created_at: '' },
  { id: 2, store_id: 1, role: 'seller', display_name: 'Ігор', login: null, is_active: true, has_pin: true, created_at: '' },
  { id: 3, store_id: 1, role: 'marketer', display_name: 'Оля', login: null, is_active: true, has_pin: true, created_at: '' },
];

function signIn(staffRoles?: string[]) {
  useAuthStore.setState({
    auth: makeAuthResponse({ store: { vertical: { id: 'cafe', dishFacts: true, staffRoles } } as never }),
  } as never);
}

function serve(onWrite: (method: string, path: string, body: unknown) => Response | void) {
  server.use(
    http.get(url('/staff'), () => HttpResponse.json(STAFF)),
    http.get(url('/staff/pin-lock'), () => HttpResponse.json({ failed_count: 0, locked_until: null, blocked: false })),
    http.post(url('/staff'), async ({ request }) => onWrite('POST', '/staff', await request.json()) ?? HttpResponse.json({ id: 9 }, { status: 201 })),
    http.patch(url('/staff/:id'), async ({ request, params }) =>
      onWrite('PATCH', `/staff/${String(params.id)}`, await request.json()) ?? HttpResponse.json({ ok: true })
    )
  );
}

describe('StaffPage — the café marketer', () => {
  afterEach(() => {
    useAuthStore.setState({ auth: null } as never);
    vi.restoreAllMocks();
  });

  it('labels each role and offers «Маркетолог» only where the vertical carries it', async () => {
    serve(() => undefined);
    signIn(['marketer']);
    renderWithProviders(<StaffPage />);
    expect(await screen.findByText('маркетолог')).toBeInTheDocument();
    expect(screen.getByText('PIN-вхід у кабінет · активний')).toBeInTheDocument();
    expect(screen.getByTestId('staff-role')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Зробити маркетологом' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Зробити продавцем' })).toBeInTheDocument();
  });

  it('asks a boutique nothing about roles', async () => {
    serve(() => undefined);
    signIn(undefined);
    renderWithProviders(<StaffPage />);
    expect(await screen.findByText('Ігор')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-role')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Зробити маркетологом' })).not.toBeInTheDocument();
  });

  it('adds a marketer with its role, and shows the server’s refusal in its words', async () => {
    const writes: Array<{ method: string; body: unknown }> = [];
    let refuse = true;
    serve((method, _path, body) => {
      writes.push({ method, body });
      if (refuse) {
        refuse = false;
        return HttpResponse.json({ error: 'Такий PIN уже має інший співробітник — оберіть інший' }, { status: 409 });
      }
    });
    signIn(['marketer']);
    renderWithProviders(<StaffPage />);
    await screen.findByText('Ігор');

    fireEvent.change(screen.getByLabelText('Імʼя'), { target: { value: 'Марк' } });
    fireEvent.change(screen.getByTestId('staff-role'), { target: { value: 'marketer' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '246802' } });
    fireEvent.click(screen.getByRole('button', { name: 'Додати' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Такий PIN уже має інший співробітник');
    expect(writes[0]).toEqual({ method: 'POST', body: { display_name: 'Марк', pin: '246802', role: 'marketer' } });

    fireEvent.click(screen.getByRole('button', { name: 'Додати' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('makes a seller a marketer only with a new PIN', async () => {
    const writes: Array<{ path: string; body: unknown }> = [];
    serve((_method, path, body) => {
      writes.push({ path, body });
    });
    signIn(['marketer']);
    const ask = vi.spyOn(window, 'prompt').mockReturnValueOnce(null).mockReturnValueOnce('864200');
    renderWithProviders(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Зробити маркетологом' }));
    expect(writes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Зробити маркетологом' }));
    await waitFor(() => expect(writes).toEqual([{ path: '/staff/2', body: { role: 'marketer', pin: '864200' } }]));
    expect(ask).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Зробити продавцем' }));
    await waitFor(() => expect(writes[1]).toEqual({ path: '/staff/3', body: { role: 'seller' } }));
  });
});

describe('StaffPage — «Доступ до каси» (TechDocs/POS_STAFF_SECTIONS.md)', () => {
  const CASHIERS = [
    { id: 1, store_id: 1, role: 'owner', display_name: 'Олена', login: 'owner@cafe.shop', is_active: true, has_pin: false, blocked_sections: [], created_at: '' },
    { id: 2, store_id: 1, role: 'seller', display_name: 'Ігор', login: null, is_active: true, has_pin: true, blocked_sections: [], created_at: '' },
    { id: 4, store_id: 1, role: 'seller', display_name: 'Марта', login: null, is_active: true, has_pin: true, blocked_sections: ['customers', 'returns'], created_at: '' },
  ];

  function serveCashiers(writes: Array<{ path: string; body: unknown }>) {
    server.use(
      http.get(url('/staff'), () => HttpResponse.json(CASHIERS)),
      http.get(url('/staff/pin-lock'), () => HttpResponse.json({ failed_count: 0, locked_until: null, blocked: false })),
      http.patch(url('/staff/:id'), async ({ request, params }) => {
        const body = (await request.json()) as { blocked_sections: string[] };
        writes.push({ path: `/staff/${String(params.id)}`, body });
        return HttpResponse.json({ ok: true, blocked_sections: body.blocked_sections });
      })
    );
  }

  afterEach(() => {
    useAuthStore.setState({ auth: null } as never);
  });

  it('says under each cashier what is closed, and offers «Доступ» to sellers only', async () => {
    serveCashiers([]);
    signIn();
    renderWithProviders(<StaffPage />);
    expect(await screen.findByTestId('staff-closed')).toHaveTextContent('Закрито:КлієнтиЧеки');
    expect(screen.getByText('Уся каса відкрита')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Доступ' })).toHaveLength(2);
  });

  it('a tap closes a section on the preview rail at once, «Каса» never closes, and one save sends the list', async () => {
    const writes: Array<{ path: string; body: unknown }> = [];
    serveCashiers(writes);
    signIn();
    renderWithProviders(<StaffPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Доступ' }))[0]);

    const dialog = await screen.findByTestId('staff-access');
    expect(dialog).toHaveTextContent('Що бачить Ігор на касі');
    const preview = () => screen.getAllByTestId('rail-preview-item').map((el) => el.textContent);
    expect(preview()).toContain('Клієнти');

    const till = screen.getByTestId('section-catalog-checkout');
    expect(till).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(till);
    expect(till).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('section-customers'));
    expect(screen.getByTestId('section-customers')).toHaveAttribute('aria-checked', 'false');
    expect(preview()).not.toContain('Клієнти');
    expect(preview()).toContain('Каса');
    expect(screen.getByTestId('staff-access-count')).toHaveTextContent('Закрито розділів: 1');

    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(writes).toEqual([{ path: '/staff/2', body: { blocked_sections: ['customers'] } }]));
    await waitFor(() => expect(screen.queryByTestId('staff-access')).toBeNull());
    expect(screen.getAllByTestId('staff-closed')[0]).toHaveTextContent('Клієнти');
  });

  it('«Як у…» copies another cashier\'s access, «Відкрити все» opens everything, and nothing changed saves nothing', async () => {
    serveCashiers([]);
    signIn();
    renderWithProviders(<StaffPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Доступ' }))[0]);
    await screen.findByTestId('staff-access');

    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Доступ як у'), { target: { value: '4' } });
    expect(screen.getByTestId('section-customers')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('section-returns')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Відкрити все' }));
    expect(screen.getByTestId('section-customers')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('staff-access-count')).toHaveTextContent('Уся каса відкрита');
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
  });
});
