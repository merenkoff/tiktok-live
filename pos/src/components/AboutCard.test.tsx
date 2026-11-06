// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Про програму»: the facts are on the card, and a link opens through the
// opener plugin on the desktop and as an ordinary new tab on the web.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { PLATFORM_VERSION, POS_API_CLIENT_VERSION, POS_APP_VERSION } from '@pos/platform';
import { renderWithProviders } from '../test/utils';
import { ABOUT } from '../lib/about';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

const { openUrl } = await import('@tauri-apps/plugin-opener');
const { AboutCard } = await import('./AboutCard');

beforeEach(() => {
  vi.clearAllMocks();
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
});
