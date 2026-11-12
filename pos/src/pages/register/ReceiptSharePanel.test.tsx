// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReceiptSharePanel } from './ReceiptSharePanel';
import type { ReceiptData } from '../../lib/printer';

const TAX_URL = 'https://cabinet.tax.gov.ua/cashregs/check?id=12345678';

const receipt: ReceiptData = {
  store_name: 'Evelin',
  kind: 'sale',
  receipt_number: 'R-000042',
  refund_of_receipt: null,
  created_at: '12.11.2026, 14:05:00',
  staff_name: 'Олена',
  customer_name: null,
  items: [],
  subtotal_cents: 0,
  discount_cents: null,
  total_cents: 0,
  payments: [],
};

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
});

describe('ReceiptSharePanel', () => {
  it('shows the tax office QR large and offers both ways to send it', () => {
    render(<ReceiptSharePanel receipt={receipt} taxUrl={TAX_URL} registered />);
    expect(screen.getByRole('img', { name: 'QR-код фіскального чека' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Надіслати чек/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Лише посилання/ })).toBeInTheDocument();
  });

  it('says the QR is coming while the receipt is still being registered', () => {
    render(<ReceiptSharePanel receipt={receipt} taxUrl={null} registered={false} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/QR-код з’явиться/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Лише посилання/ })).not.toBeInTheDocument();
  });

  it('sends the link through the share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<ReceiptSharePanel receipt={receipt} taxUrl={TAX_URL} registered />);
    fireEvent.click(screen.getByRole('button', { name: /Лише посилання/ }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: 'Чек R-000042',
        text: `Evelin, чек R-000042.\nПеревірити в Податковій: ${TAX_URL}`,
      })
    );
  });
});
