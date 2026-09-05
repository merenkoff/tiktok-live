// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/utils';
import { onModuleEvent, type ModuleEvent } from '../modules/telemetry';
import { RouteErrorBoundary } from './RouteErrorBoundary';

/** Throws whenever `state.throw` is true — the test flips it to drive recovery. */
function Controlled({ state }: { state: { throw: boolean } }): JSX.Element {
  if (state.throw) throw new Error('chunk load failed');
  return <div>recovered content</div>;
}

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    // React 18 logs the caught error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    renderWithProviders(
      <RouteErrorBoundary moduleId="products" title="Товари">
        <div>catalog</div>
      </RouteErrorBoundary>
    );
    expect(screen.getByText('catalog')).toBeInTheDocument();
  });

  it('shows the fallback and reports a telemetry event on a child error', () => {
    const events: ModuleEvent[] = [];
    const off = onModuleEvent((e) => events.push(e));

    renderWithProviders(
      <RouteErrorBoundary moduleId="products" title="Товари">
        <Controlled state={{ throw: true }} />
      </RouteErrorBoundary>
    );
    off();

    expect(screen.getByText(/Не вдалося завантажити розділ «Товари»/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторити' })).toBeInTheDocument();
    expect(events).toEqual([
      expect.objectContaining({ type: 'route_render_error', moduleId: 'products' }),
    ]);
  });

  it('recovers on "Повторити" once the child stops throwing', async () => {
    const user = userEvent.setup();
    const state = { throw: true };

    renderWithProviders(
      <RouteErrorBoundary moduleId="products" title="Товари">
        <Controlled state={state} />
      </RouteErrorBoundary>
    );

    expect(screen.getByRole('button', { name: 'Повторити' })).toBeInTheDocument();
    state.throw = false;
    await user.click(screen.getByRole('button', { name: 'Повторити' }));

    expect(await screen.findByText('recovered content')).toBeInTheDocument();
  });

  it('offers a reload after a second failure', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <RouteErrorBoundary moduleId="products" title="Товари">
        <Controlled state={{ throw: true }} />
      </RouteErrorBoundary>
    );

    // first catch -> soft retry; child still throws -> second catch
    await user.click(screen.getByRole('button', { name: 'Повторити' }));

    expect(
      await screen.findByRole('button', { name: 'Перезавантажити застосунок' })
    ).toBeInTheDocument();
  });
});
