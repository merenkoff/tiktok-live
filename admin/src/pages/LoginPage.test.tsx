// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// This screen used to authenticate on a TikTok nickname alone. What is pinned
// now is the absence of that: no form, no way in, and a pointer at the POS.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginPage } from './LoginPage';

describe('LoginPage (retired)', () => {
  it('offers no way to sign in', () => {
    render(<LoginPage />);
    expect(document.querySelector('form')).toBeNull();
    expect(document.querySelector('input')).toBeNull();
    expect(screen.queryByTestId('login-submit')).not.toBeInTheDocument();
  });

  it('says the panel is retired and points at the POS', () => {
    render(<LoginPage />);
    expect(screen.getByText(/більше не використовується/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Перейти до POS/i })).toHaveAttribute(
      'href',
      'https://pos.the-live.shop'
    );
  });

  it('names both surfaces the work moved to', () => {
    render(<LoginPage />);
    expect(screen.getByText('Ефір')).toBeInTheDocument();
    expect(screen.getByText(/Налаштування ефіру/)).toBeInTheDocument();
  });
});
