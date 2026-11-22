// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The desktop till's window buttons (TechDocs/POS_DESKTOP.md, «Вікно каси»):
// each system's own place and order, the command each button calls, the middle
// one following the window's state, and only the desktop till's login screen
// drawing them at all.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as core from '@tauri-apps/api/core';
import { renderWithProviders } from '../test/utils';
import { LoginPage } from '../pages/LoginPage';
import { WindowControls } from './WindowControls';

const invoke = vi.mocked(core.invoke);

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (command: string) => (command === 'window_is_fullscreen' ? true : undefined));
});

const order = () => within(screen.getByTestId('window-controls')).getAllByRole('button').map((b) => b.getAttribute('aria-label'));

describe('WindowControls', () => {
  it('macOS: the traffic lights on the left — close, hide, fullscreen', () => {
    render(<WindowControls platform="mac" />);
    expect(screen.getByTestId('window-controls').querySelector('[data-platform="mac"]')).toBeTruthy();
    expect(order()).toEqual(['Закрити касу', 'Сховати касу', 'У вікні']);
  });

  it('Windows and Linux: on the right — minimise, fullscreen, close', () => {
    const { unmount } = render(<WindowControls platform="windows" />);
    expect(screen.getByTestId('window-controls').querySelector('[data-platform="windows"]')).toBeTruthy();
    expect(order()).toEqual(['Згорнути', 'У вікні', 'Закрити касу']);
    unmount();
    render(<WindowControls platform="linux" />);
    expect(screen.getByTestId('window-controls').querySelector('[data-platform="linux"]')).toBeTruthy();
    expect(order()).toEqual(['Згорнути', 'У вікні', 'Закрити касу']);
  });

  it('each button calls its own command', async () => {
    render(<WindowControls platform="windows" />);
    fireEvent.click(screen.getByRole('button', { name: 'Згорнути' }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрити касу' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('window_minimize'));
    expect(invoke).toHaveBeenCalledWith('window_close');
  });

  it('the middle button follows the window: «У вікні» while fullscreen, «На весь екран» after', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'window_is_fullscreen') return true;
      if (command === 'window_toggle_fullscreen') return false;
      return undefined;
    });
    render(<WindowControls platform="linux" />);
    fireEvent.click(screen.getByRole('button', { name: 'У вікні' }));
    expect(await screen.findByRole('button', { name: 'На весь екран' })).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('window_toggle_fullscreen');
  });

  it('asks the window whether it is fullscreen (a dev build opens framed)', async () => {
    invoke.mockImplementation(async (command: string) => (command === 'window_is_fullscreen' ? false : undefined));
    render(<WindowControls platform="mac" />);
    expect(await screen.findByRole('button', { name: 'На весь екран' })).toBeInTheDocument();
  });

  it('keeps the screen working when the window cannot answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    invoke.mockRejectedValue(new Error('not in tauri'));
    render(<WindowControls platform="windows" />);
    fireEvent.click(screen.getByRole('button', { name: 'У вікні' }));
    fireEvent.click(screen.getByRole('button', { name: 'Згорнути' }));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'У вікні' })).toBeInTheDocument();
    warn.mockRestore();
  });
});

describe('LoginPage draws them only in the desktop till', () => {
  it('the desktop till inside Tauri', () => {
    const spy = vi.spyOn(core, 'isTauri').mockReturnValue(true);
    renderWithProviders(<LoginPage />, { route: '/login', shell: 'cashier' });
    expect(screen.getByTestId('window-controls')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('not the web, not the tablet, and not the cashier build opened in a browser', () => {
    const spy = vi.spyOn(core, 'isTauri').mockReturnValue(true);
    const web = renderWithProviders(<LoginPage />, { route: '/login', shell: 'web' });
    expect(screen.queryByTestId('window-controls')).toBeNull();
    web.unmount();
    const tablet = renderWithProviders(<LoginPage />, { route: '/login', shell: 'tablet' });
    expect(screen.queryByTestId('window-controls')).toBeNull();
    tablet.unmount();
    spy.mockReturnValue(false);
    renderWithProviders(<LoginPage />, { route: '/login', shell: 'cashier' });
    expect(screen.queryByTestId('window-controls')).toBeNull();
    spy.mockRestore();
  });
});
