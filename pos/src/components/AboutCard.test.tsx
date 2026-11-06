// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Про програму»: the facts are on the card, and a link opens through the
// opener plugin on the desktop and as an ordinary new tab on the web.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { PLATFORM_VERSION, POS_API_CLIENT_VERSION, POS_APP_VERSION, useAuthStore } from '@pos/platform';
import { server } from '../test/msw/server';
import { makeAuthResponse, renderWithProviders } from '../test/utils';
import { posApiBase } from '../lib/urls';
import { ABOUT } from '../lib/about';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

const { openUrl } = await import('@tauri-apps/plugin-opener');
const { AboutCard } = await import('./AboutCard');

const statusUrl = `${posApiBase()}/license/status`;

function licenseStatus(body: Record<string, unknown>, status = 200) {
  let hits = 0;
  server.use(
    http.get(statusUrl, () => {
      hits += 1;
      return HttpResponse.json(body, { status });
    })
  );
  return () => hits;
}

const licensedBody = {
  status: 'licensed',
  instance_id: '36ec4ed9-1dbc-4e81-9af1-6f1afbb9e283',
  licensee: 'The Live Shop (SaaS)',
  plan: 'saas',
  expires_at: null,
  last_ok_at: '2026-11-06T11:35:31.227Z',
  last_checked_at: '2026-11-06T20:39:36.072Z',
  server_url: 'https://the-live.shop',
  token_reason: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ auth: null, isAuthenticated: false });
});

describe('AboutCard', () => {
  it('prints the program, the developer with its ЄДРПОУ, the licence, the contact and the copyright', () => {
    renderWithProviders(<AboutCard />, { shell: 'web' });
    expect(screen.getByText('LiveShop POS')).toBeInTheDocument();
    expect(screen.getByText(ABOUT.companyTaxId)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(ABOUT.companyLegalName))).toBeInTheDocument();
    expect(screen.getByText(/OwnNet Source License 1\.1 \(Source Available Edition\)/)).toBeInTheDocument();
    expect(screen.getByText(ABOUT.contactEmail)).toBeInTheDocument();
    expect(screen.getByText(ABOUT.copyright)).toBeInTheDocument();
    expect(
      screen.getByText(`${POS_APP_VERSION} · платформа ${PLATFORM_VERSION} · API ${POS_API_CLIENT_VERSION}`)
    ).toBeInTheDocument();
  });

  it('on the desktop says «каса» before the build and opens a link through the opener plugin', () => {
    renderWithProviders(<AboutCard />, { shell: 'cashier' });
    expect(screen.getByText(new RegExp(`^каса ${POS_APP_VERSION} ·`))).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'own-net.com' });
    const event = fireEvent.click(link);
    expect(event).toBe(false); // default prevented — the webview does not navigate
    expect(openUrl).toHaveBeenCalledWith(ABOUT.licenseSite.url);
  });

  it('on the web is an ordinary link to a new tab, and the opener is never called', () => {
    renderWithProviders(<AboutCard />, { shell: 'web' });
    const link = screen.getByRole('link', { name: 'technologies.llc' });
    expect(link).toHaveAttribute('href', ABOUT.companySite.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(link);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('for the owner says the copy is licensed, by whom and on which plan', async () => {
    licenseStatus(licensedBody);
    useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
    renderWithProviders(<AboutCard />, { shell: 'web' });
    const line = await screen.findByTestId('license-line');
    expect(line).toHaveTextContent('Копія ліцензована');
    expect(line).toHaveAttribute('data-tone', 'ok');
    expect(screen.getByText(/The Live Shop \(SaaS\) · план saas/)).toBeInTheDocument();
  });

  it('for the owner says in red when there is no valid key', async () => {
    licenseStatus({ ...licensedBody, status: 'unlicensed', licensee: null, plan: null, token_reason: 'absent' });
    useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
    renderWithProviders(<AboutCard />, { shell: 'cashier' });
    const line = await screen.findByTestId('license-line');
    expect(line).toHaveTextContent('Копія не ліцензована');
    expect(line).toHaveAttribute('data-tone', 'bad');
    expect(screen.getByText(/ключ ліцензії не задано/)).toBeInTheDocument();
  });

  it('asks nothing for a seller, and draws nothing when the read fails', async () => {
    const hits = licenseStatus(licensedBody);
    useAuthStore.setState({
      auth: makeAuthResponse({ staff: { id: 2, display_name: 'Ігор', role: 'seller' } }),
      isAuthenticated: true,
    });
    const { unmount } = renderWithProviders(<AboutCard />, { shell: 'cashier' });
    await waitFor(() => expect(screen.getByText(ABOUT.copyright)).toBeInTheDocument());
    expect(hits()).toBe(0);
    expect(screen.queryByTestId('license-line')).not.toBeInTheDocument();
    unmount();

    licenseStatus({ error: 'Not found' }, 404);
    useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
    renderWithProviders(<AboutCard />, { shell: 'web' });
    await waitFor(() => expect(screen.getByText(ABOUT.copyright)).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('license-line')).not.toBeInTheDocument();
  });
});
