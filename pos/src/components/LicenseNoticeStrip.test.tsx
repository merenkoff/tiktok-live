// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The notice a copy without a valid licence key shows every user
// (TechDocs/POS_LICENSING.md, phase 2G): text from the session, a strip that
// cannot be closed, and nothing at all for a copy that has no notice.

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@pos/platform';
import type { AuthResponse } from '../types';
import { LicenseNoticeStrip } from './LicenseNoticeStrip';

const TEXT = 'Ця копія працює без ліцензійного ключа. Комерційне використання потребує ліцензії — the-live.shop';

function signIn(notice: { text: string } | null | undefined) {
  const auth = {
    token: 't',
    expires_at: '2099-01-01T00:00:00Z',
    staff: { id: 1, display_name: 'Касир', role: 'seller' },
    store: { id: 1, name: 'Магазин', slug: 'shop', currency: 'UAH', license_notice: notice },
  } as unknown as AuthResponse;
  act(() => useAuthStore.setState({ auth, isAuthenticated: true }));
}

afterEach(() => act(() => useAuthStore.setState({ auth: null, isAuthenticated: false })));

describe('LicenseNoticeStrip', () => {
  it('shows the text the session carries, to whoever is signed in, with nothing to close it', () => {
    render(<LicenseNoticeStrip />);
    expect(screen.queryByTestId('license-notice')).not.toBeInTheDocument();

    signIn({ text: TEXT });
    const strip = screen.getByRole('status');
    expect(strip).toHaveTextContent(TEXT);
    // A notice, not a dialog: no button in it, and it sits under every sheet.
    expect(strip.querySelector('button, a, input')).toBeNull();
    expect(strip.className).toContain('z-30');
  });

  it('shows the text as text: markup from the server is not markup here', () => {
    render(<LicenseNoticeStrip />);
    signIn({ text: '<img src=x onerror=alert(1)> <b>жирний</b>' });
    const strip = screen.getByTestId('license-notice');
    expect(strip.querySelector('img, b')).toBeNull();
    expect(strip).toHaveTextContent('<img src=x onerror=alert(1)> <b>жирний</b>');
  });

  it('draws nothing for a copy with no notice, an older backend, or nobody signed in', () => {
    render(<LicenseNoticeStrip />);
    for (const notice of [null, undefined]) {
      signIn(notice);
      expect(screen.queryByTestId('license-notice')).not.toBeInTheDocument();
    }
    act(() => useAuthStore.setState({ isAuthenticated: false }));
    expect(screen.queryByTestId('license-notice')).not.toBeInTheDocument();
  });

  it('hands its height to the frames while it is shown, and takes it back when it goes', () => {
    const root = document.documentElement;
    const { unmount } = render(<LicenseNoticeStrip />);
    expect(root.style.getPropertyValue('--lic-h')).toBe('');

    signIn({ text: TEXT });
    expect(root.style.getPropertyValue('--lic-h')).toMatch(/^\d+px$/);
    expect(document.body.style.paddingTop).toMatch(/^\d+px$/);

    // The window changed size and the text re-wrapped: the height is measured again.
    const strip = screen.getByTestId('license-notice');
    Object.defineProperty(strip, 'offsetHeight', { configurable: true, value: 52 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(root.style.getPropertyValue('--lic-h')).toBe('52px');
    expect(document.body.style.paddingTop).toBe('52px');

    // Signed out (or the copy got its key): the frames are full height again.
    act(() => useAuthStore.setState({ auth: null, isAuthenticated: false }));
    expect(root.style.getPropertyValue('--lic-h')).toBe('');
    expect(document.body.style.paddingTop).toBe('');
    unmount();
  });
});
