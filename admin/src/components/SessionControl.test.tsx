import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionControl } from './SessionControl';

describe('SessionControl', () => {
  it('shows Start when inactive and calls onStart', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <SessionControl
        isActive={false}
        onStart={onStart}
        onStop={vi.fn()}
        isStarting={false}
        isStopping={false}
      />
    );

    expect(screen.getByTestId('session-start')).toBeInTheDocument();
    await user.click(screen.getByTestId('session-start'));
    expect(onStart).toHaveBeenCalled();
  });

  it('shows Stop when active and calls onStop', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(
      <SessionControl
        isActive
        onStart={vi.fn()}
        onStop={onStop}
        isStarting={false}
        isStopping={false}
      />
    );

    expect(screen.getByTestId('session-stop')).toBeInTheDocument();
    await user.click(screen.getByTestId('session-stop'));
    expect(onStop).toHaveBeenCalled();
  });

  it('disables Start while isStarting', () => {
    render(
      <SessionControl
        isActive={false}
        onStart={vi.fn()}
        onStop={vi.fn()}
        isStarting
        isStopping={false}
      />
    );
    expect(screen.getByTestId('session-start')).toBeDisabled();
    expect(screen.getByTestId('session-start')).toHaveTextContent('Starting');
  });

  it('disables Stop while isStopping', () => {
    render(
      <SessionControl
        isActive
        onStart={vi.fn()}
        onStop={vi.fn()}
        isStarting={false}
        isStopping
      />
    );
    expect(screen.getByTestId('session-stop')).toBeDisabled();
  });
});
