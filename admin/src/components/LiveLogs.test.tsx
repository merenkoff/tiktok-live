import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveLogs } from './LiveLogs';
import { makeLog } from '../test/utils';

describe('LiveLogs', () => {
  it('shows empty state', () => {
    render(<LiveLogs logs={[]} isConnected={false} />);
    expect(screen.getByText(/Повідомлень поки немає/i)).toBeInTheDocument();
    expect(screen.getByText(/Відключено/i)).toBeInTheDocument();
  });

  it('renders log messages with labels', () => {
    render(
      <LiveLogs
        isConnected
        logs={[
          makeLog({ id: 1, log_type: 'order', message: 'Order A' }),
          makeLog({ id: 2, log_type: 'error', message: 'Boom' }),
        ]}
      />
    );
    expect(screen.getByText('Order A')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.getByText(/Замовлення/i)).toBeInTheDocument();
    expect(screen.getByText(/Помилка/i)).toBeInTheDocument();
    expect(screen.getByText(/Підключено/i)).toBeInTheDocument();
  });

  it('shows reconnect button when disconnected and onReconnect provided', async () => {
    const user = userEvent.setup();
    const onReconnect = vi.fn();
    render(<LiveLogs logs={[]} isConnected={false} onReconnect={onReconnect} />);
    await user.click(screen.getByRole('button', { name: /Перепідключити/i }));
    expect(onReconnect).toHaveBeenCalled();
  });

  it('hides reconnect when connected', () => {
    render(<LiveLogs logs={[]} isConnected onReconnect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Перепідключити/i })).not.toBeInTheDocument();
  });
});
