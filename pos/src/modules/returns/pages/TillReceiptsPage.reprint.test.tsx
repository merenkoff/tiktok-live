// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Друкувати чек» in the till's «Чеки» (the owner's word of 2026-11-23): a
// copy for a customer who comes back for the paper — on the desktop's own
// printer, or on the till's computer through the server's queue from a phone.
// Never for a receipt with a return, a voided one or a «внесок».

import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { LocalSaleRow } from '../../../offline/db';
import type { SaleDetail } from '../../../types';

const listSales = vi.fn();
const getSale = vi.fn();
const getMeta = vi.fn();
const printReceipt = vi.fn();
const posRequest = vi.fn();
let shell = 'cashier';

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => ({ id: 'clothing' }),
    usePosShell: () => shell,
    getMeta: (key: string) => getMeta(key),
    printReceipt: (...a: unknown[]) => printReceipt(...a),
    cashierApi: {
      ...real.cashierApi,
      listSales: (...a: unknown[]) => listSales(...a),
      getSale: (...a: unknown[]) => getSale(...a),
    },
  };
});

const { TillReceiptsPage } = await import('./TillReceiptsPage');
const { api } = await import('@pos/platform');

const detail = {
  id: 1,
  receipt_number: 'R-00001',
  status: 'completed',
  subtotal_cents: 45000,
  total_cents: 45000,
  refunded_cents: 0,
  staff_name: 'Касирка',
  created_at: '2026-10-04T10:00:00Z',
  items: [
    {
      id: 11,
      variant_id: 5,
      product_name: 'Пальто',
      variant_label: 'Синій · M',
      quantity: 1,
      unit_price_cents: 45000,
      line_total_cents: 45000,
      refunded_quantity: 0,
    },
  ],
  payments: [{ id: 1, method: 'cash', amount_cents: 45000 }],
  refunds: [],
  fiscal_status: 'none',
} as unknown as SaleDetail;

const row: LocalSaleRow = {
  client_uuid: 'u1',
  server_id: 1,
  receipt_number: 'R-00001',
  status: 'completed',
  total_cents: 45000,
  refunded_cents: 0,
  staff_name: 'Касирка',
  customer_name: null,
  created_at: '2026-10-04T10:00:00Z',
  fiscal_status: 'none',
};

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<TillReceiptsPage />} />
    </Routes>
  );
}

async function open() {
  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole('button', { name: /R-00001/ }));
  await screen.findAllByText('Разом');
  return user;
}

beforeEach(() => {
  shell = 'cashier';
  listSales.mockReset().mockResolvedValue([row]);
  getSale.mockReset().mockResolvedValue(detail);
  getMeta.mockReset().mockImplementation(async (key: string) => (key === 'receiptPrinterName' ? 'XP-58' : 58));
  printReceipt.mockReset().mockResolvedValue(undefined);
  posRequest.mockReset();
  vi.spyOn(api, 'posRequest').mockImplementation((...a: unknown[]) => posRequest(...a));
});

describe('TillReceiptsPage — «Друкувати чек»', () => {
  it('prints a copy on the desktop’s own receipt printer', async () => {
    const user = await open();
    await user.click(screen.getAllByTestId('reprint-receipt')[0]);

    expect(printReceipt).toHaveBeenCalledTimes(1);
    const [printer, receipt, paper] = printReceipt.mock.calls[0] as [string, { copy?: boolean; receipt_number: string }, number];
    expect(printer).toBe('XP-58');
    expect(receipt).toMatchObject({ copy: true, receipt_number: 'R-00001' });
    expect(paper).toBe(58);
    expect((await screen.findAllByTestId('reprint-status'))[0]).toHaveTextContent('Копію чека надіслано на друк');
    expect(posRequest).not.toHaveBeenCalled();
  });

  it('asks the till’s computer from a phone, as a copy, and says it is printing', async () => {
    shell = 'web';
    posRequest.mockResolvedValue({ requested_at: 'x', printed_at: null, expires_at: 'y', till: 'online' });
    const user = await open();
    await user.click(screen.getAllByTestId('reprint-receipt')[0]);

    expect(posRequest).toHaveBeenCalledWith('post', '/sales/1/print-request', { copy: true });
    expect(printReceipt).not.toHaveBeenCalled();
    expect((await screen.findAllByTestId('reprint-status'))[0]).toHaveTextContent('Чек друкується на касі');
  });

  it('says the computer is off, and shows the server’s refusal in its words', async () => {
    shell = 'web';
    posRequest.mockResolvedValueOnce({ till: 'offline' });
    const user = await open();
    await user.click(screen.getAllByTestId('reprint-receipt')[0]);
    expect((await screen.findAllByTestId('reprint-status'))[0]).toHaveTextContent('Комп’ютер каси вимкнений');

    posRequest.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'Чек скасовано — друкувати нічого' } },
    });
    await user.click(screen.getAllByTestId('reprint-receipt')[0]);
    expect((await screen.findAllByTestId('reprint-status'))[0]).toHaveTextContent('Чек скасовано — друкувати нічого');
  });

  it.each([
    ['a receipt with a return', { status: 'partially_refunded', refunded_cents: 10000 }, {}],
    ['a voided receipt', { status: 'voided' }, {}],
    ['a «внесок» toward a debt', { debt_prepayment: true }, {}],
    ['a receipt whose detail lists a return', {}, { refunds: [{ id: 3 }] }],
  ])('offers nothing for %s', async (_name, rowPatch, detailPatch) => {
    listSales.mockResolvedValue([{ ...row, ...rowPatch }]);
    getSale.mockResolvedValue({ ...detail, ...detailPatch });
    await open();
    expect(screen.queryByTestId('reprint-receipt')).toBeNull();
  });
});
