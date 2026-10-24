// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The three figures on «Сьогодні», and — the part that keeps the host's
// dashboard safe — nothing at all when they cannot be read.

import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { default: DebtPanels } = await import('./DebtPanels');
const { formatUah } = await import('@pos/platform');
const { renderWithProviders } = await import('../../../test/utils');

const uah = (cents: number) => formatUah(cents).replace(/\s/g, ' ');

beforeEach(() => {
  posRequest.mockReset();
});

describe('DebtPanels', () => {
  it('asks for exactly the window the dashboard is showing', async () => {
    posRequest.mockResolvedValue({
      from: '2026-10-24', to: '2026-10-24', issued_cents: 0, repaid_cents: 0, returned_cents: 0,
      written_off_cents: 0, balance_end_cents: 0, debtors_end: 0,
    });
    renderWithProviders(<DebtPanels from="2026-10-01" to="2026-10-24" />);
    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith('get', '/debts/summary?from=2026-10-01&to=2026-10-24', undefined)
    );
  });

  it('shows what left on credit, what came back as money, and what is still owed', async () => {
    posRequest.mockResolvedValue({
      from: '2026-10-24', to: '2026-10-24', issued_cents: 124000, repaid_cents: 56000, returned_cents: 3200,
      written_off_cents: 1500, balance_end_cents: 980000, debtors_end: 12,
    });
    renderWithProviders(<DebtPanels from="2026-10-24" to="2026-10-24" />);
    await waitFor(() => expect(screen.getByTestId('panel-debt-issued')).toHaveTextContent(uah(124000)));
    expect(screen.getByTestId('panel-debt-issued')).toHaveTextContent(`повернуто товару на ${uah(3200)}`);
    expect(screen.getByTestId('panel-debt-repaid')).toHaveTextContent(uah(56000));
    expect(screen.getByTestId('panel-debt-repaid')).toHaveTextContent(`списано ${uah(1500)}`);
    expect(screen.getByTestId('panel-debt-balance')).toHaveTextContent(uah(980000));
    expect(screen.getByTestId('panel-debt-balance')).toHaveTextContent('12 покупців');
  });

  it('draws nothing at all when the figures cannot be read', async () => {
    posRequest.mockImplementation(() => Promise.reject({ response: { status: 403, data: { error: 'Owner only' } } }));
    const { container } = renderWithProviders(<DebtPanels from="2026-10-24" to="2026-10-24" />);
    await waitFor(() => expect(posRequest).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
