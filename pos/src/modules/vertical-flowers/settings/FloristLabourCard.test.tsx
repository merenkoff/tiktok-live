// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The assembly charge, and the two things about it that are easy to get wrong:
// percent on screen versus basis points on the wire, and the till that keeps
// pricing at the old rate unless the session is refreshed.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getStore = vi.fn();
const updateStore = vi.fn();
const bootstrap = vi.fn();

vi.mock('@pos/platform', () => ({
  api: {
    getStore: () => getStore(),
    updateStore: (patch: unknown) => updateStore(patch),
  },
  useAuthStore: { getState: () => ({ bootstrap }) },
}));

const { default: FloristLabourCard } = await import('./FloristLabourCard');

const store = (bps: number) => ({ id: 1, name: 'Квіти', florist_labour_bps: bps });

async function drawLoaded(bps = 2500) {
  getStore.mockResolvedValue(store(bps));
  const view = render(<FloristLabourCard />);
  await waitFor(() => expect(screen.getByTestId('florist-labour-input')).toBeEnabled());
  return view;
}

describe('FloristLabourCard', () => {
  it('shows the rate the shop charges today, as a percentage', async () => {
    await drawLoaded(2500);
    expect(screen.getByTestId('florist-labour-input')).toHaveValue('25');
  });

  it('sends basis points, never the percent on screen', async () => {
    // 12.5% has to be expressible, which is the whole reason the column is bps.
    await drawLoaded(2500);
    updateStore.mockResolvedValue(store(1250));

    fireEvent.change(screen.getByTestId('florist-labour-input'), { target: { value: '12,5' } });
    fireEvent.click(screen.getByTestId('florist-labour-save'));

    await waitFor(() => expect(updateStore).toHaveBeenCalledWith({ florist_labour_bps: 1250 }));
    // A comma is what a Ukrainian keyboard gives, and it must not read as 125.
    await waitFor(() => expect(screen.getByTestId('florist-labour-input')).toHaveValue('12.5'));
  });

  it('refreshes the session, or the bench keeps pricing at the old rate', async () => {
    // The till reads the rate from `auth.store.florist_labour_bps`, which rides
    // with the login — saving the column alone changes nothing on the bench.
    await drawLoaded(2500);
    updateStore.mockResolvedValue(store(3000));

    fireEvent.click(screen.getByTestId('florist-labour-save'));

    await waitFor(() => expect(bootstrap).toHaveBeenCalled());
    expect(screen.getByText('Збережено')).toBeInTheDocument();
  });

  it('repeats the server’s words rather than inventing its own', async () => {
    await drawLoaded(2500);
    updateStore.mockImplementation(async () => {
      throw { response: { data: { error: 'Націнка за роботу має бути від 0 до 1000%' } } };
    });

    fireEvent.change(screen.getByTestId('florist-labour-input'), { target: { value: '5000' } });
    fireEvent.click(screen.getByTestId('florist-labour-save'));

    await waitFor(() =>
      expect(screen.getByTestId('florist-labour-error')).toHaveTextContent('від 0 до 1000%')
    );
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it('saves on Enter instead of submitting the host’s form', async () => {
    // It renders inside the host's Settings form, whose Enter would save
    // everything except this.
    await drawLoaded(2500);
    updateStore.mockResolvedValue(store(2500));

    fireEvent.keyDown(screen.getByTestId('florist-labour-input'), { key: 'Enter' });
    await waitFor(() => expect(updateStore).toHaveBeenCalled());
  });

  it('draws nothing when it cannot read the current rate', async () => {
    // An empty input the owner might type a number into would be worse: they
    // would save a rate they never saw.
    getStore.mockImplementation(async () => {
      throw new Error('offline');
    });
    const { container } = render(<FloristLabourCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
