// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The refund dialog after clothing R1/R2/R4: the ground goes on the wire,
// the money goes back the way it came, the act's fields appear above 100 ₴,
// an old receipt gets a hint and not a wall, the server's sentence is shown
// as it is, and in exchange mode the return half is handed on instead of
// refunded.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { LocalSaleRow } from '../../../offline/db';
import type { SaleDetail } from '../../../types';

const refundSale = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    cashierApi: { ...real.cashierApi, refundSale: (...a: unknown[]) => refundSale(...a) },
    getMeta: vi.fn().mockResolvedValue(null),
  };
});

const { RefundSaleDialog } = await import('./RefundSaleDialog');

function detail(over: Partial<SaleDetail> = {}): SaleDetail {
  return {
    id: 7,
    receipt_number: 'R-00042',
    status: 'completed',
    subtotal_cents: 45000,
    total_cents: 45000,
    refunded_cents: 0,
    staff_name: 'Касирка',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 1,
        variant_id: 11,
        product_name: 'Пальто',
        variant_label: 'Синій · M',
        quantity: 1,
        unit_price_cents: 45000,
        line_total_cents: 45000,
        refunded_quantity: 0,
      },
    ],
    payments: [{ id: 1, method: 'card', amount_cents: 45000 }],
    refunds: [],
    fiscal_status: 'none',
    ...over,
  } as SaleDetail;
}

function row(d: SaleDetail): LocalSaleRow {
  return {
    client_uuid: 'u7',
    server_id: d.id,
    receipt_number: d.receipt_number,
    status: d.status,
    total_cents: d.total_cents,
    refunded_cents: d.refunded_cents,
    staff_name: d.staff_name,
    customer_name: null,
    created_at: d.created_at,
    fiscal_status: 'none',
    detail: d,
  };
}

/** What the server answers: the sale with the new refund on it. */
function refunded(d: SaleDetail, extra: Partial<SaleDetail['refunds'][number]> = {}) {
  const fresh: SaleDetail = {
    ...d,
    status: 'refunded',
    refunded_cents: d.total_cents,
    items: d.items.map((i) => ({ ...i, refunded_quantity: i.quantity })),
    refunds: [
      {
        id: 9,
        refund_number: 'RF-00007',
        client_uuid: null,
        method: 'card',
        total_cents: d.total_cents,
        reason: null,
        staff_name: 'Касирка',
        created_at: new Date().toISOString(),
        items: d.items.map((i) => ({
          sale_item_id: i.id,
          variant_id: i.variant_id,
          quantity: i.quantity,
          unit_price_cents: i.unit_price_cents,
          line_total_cents: i.line_total_cents,
        })),
        ...extra,
      },
    ],
  };
  return { ...row(fresh), status: 'refunded', refunded_cents: d.total_cents, refund_fiscal: null };
}

beforeEach(() => {
  refundSale.mockReset();
  window.print = vi.fn();
});

describe('RefundSaleDialog', () => {
  it('sends the ground and the buyer, and offers only the method the receipt was paid with', async () => {
    const user = userEvent.setup();
    const d = detail();
    refundSale.mockImplementation(async () => refunded(d, { reason_code: 'defect', buyer_name: 'Коваль Олена' }));
    renderWithProviders(
      <RefundSaleDialog sale={row(d)} detail={d} selectAll onClose={() => {}} onRefunded={() => {}} />
    );

    // Paid by card: card is pressed, cash and QR are off — the server would refuse them.
    expect(screen.getByRole('button', { name: 'Картка' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Готівка' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'QR-код' })).toBeDisabled();
    expect(screen.getByText('Повернення — тим самим способом, яким платили.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Брак' }));
    expect(screen.getByText('Товар спишеться як брак, а не повернеться на полицю.')).toBeInTheDocument();

    // 450 ₴ > 100 ₴: the act wants the buyer.
    const buyer = screen.getByTestId('refund-buyer');
    await user.type(within(buyer).getByLabelText('ПІБ покупця'), 'Коваль Олена');
    await user.type(within(buyer).getByLabelText('Документ покупця'), 'паспорт КВ 123456');

    await user.click(screen.getByRole('button', { name: 'Скасувати чек' }));

    await waitFor(() => expect(refundSale).toHaveBeenCalledTimes(1));
    expect(refundSale.mock.calls[0][1]).toEqual([{ sale_item_id: 1, quantity: 1 }]);
    expect(refundSale.mock.calls[0][2]).toEqual({
      method: 'card',
      reason: undefined,
      reason_code: 'defect',
      buyer_name: 'Коваль Олена',
      buyer_document: 'паспорт КВ 123456',
    });

    // The done pane offers the act, and printing it puts the act on the page.
    await screen.findByText('Повернено');
    await user.click(screen.getByRole('button', { name: 'Акт про видачу коштів' }));
    await waitFor(() => expect(document.body.textContent).toContain('АКТ про видачу коштів'));
    expect(document.body.textContent).toContain('Коваль Олена');
    await waitFor(() => expect(window.print).toHaveBeenCalled());
  });

  it('asks nothing of the buyer under 100 ₴ and keeps every method on a receipt with no payments', () => {
    const d = detail({
      total_cents: 8000,
      subtotal_cents: 8000,
      items: [{ ...detail().items[0], unit_price_cents: 8000, line_total_cents: 8000 }],
      payments: [],
    });
    renderWithProviders(
      <RefundSaleDialog sale={row(d)} detail={d} selectAll onClose={() => {}} onRefunded={() => {}} />
    );
    expect(screen.queryByTestId('refund-buyer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Готівка' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Картка' })).toBeEnabled();
    expect(screen.queryByText('Повернення — тим самим способом, яким платили.')).not.toBeInTheDocument();
  });

  it('hints, and only hints, when the receipt is older than fourteen days', () => {
    const old = detail({ created_at: new Date(Date.now() - 20 * 86_400_000).toISOString() });
    const { unmount } = renderWithProviders(
      <RefundSaleDialog sale={row(old)} detail={old} onClose={() => {}} onRefunded={() => {}} />
    );
    expect(screen.getByTestId('refund-days-hint').textContent).toContain('минуло 20 дн.');
    expect(screen.getByRole('button', { name: 'Повернути' })).toBeInTheDocument();
    unmount();

    const fresh = detail();
    renderWithProviders(
      <RefundSaleDialog sale={row(fresh)} detail={fresh} onClose={() => {}} onRefunded={() => {}} />
    );
    expect(screen.queryByTestId('refund-days-hint')).not.toBeInTheDocument();
  });

  it('shows the server\'s own sentence when it refuses', async () => {
    const user = userEvent.setup();
    const d = detail();
    refundSale.mockRejectedValue({
      response: { status: 400, data: { error: 'Чек оплачено карткою — повернення теж на картку' } },
    });
    renderWithProviders(
      <RefundSaleDialog sale={row(d)} detail={d} selectAll onClose={() => {}} onRefunded={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: 'Скасувати чек' }));
    expect(await screen.findByText('Чек оплачено карткою — повернення теж на картку')).toBeInTheDocument();
  });

  it('in exchange mode hands the return half on with its own key instead of refunding', async () => {
    const user = userEvent.setup();
    const d = detail();
    const onExchange = vi.fn();
    renderWithProviders(
      <RefundSaleDialog
        sale={row(d)}
        detail={d}
        mode="exchange"
        onClose={() => {}}
        onRefunded={() => {}}
        onExchange={onExchange}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Обмін' })).toBeInTheDocument();
    expect(screen.getByText('Обмін: що повертаємо?')).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Далі: новий товар' });
    expect(next).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Більше Пальто' }));
    await user.click(screen.getByRole('button', { name: 'Не підійшов розмір' }));
    await user.click(next);

    expect(refundSale).not.toHaveBeenCalled();
    expect(onExchange).toHaveBeenCalledTimes(1);
    const draft = onExchange.mock.calls[0][0];
    expect(draft).toMatchObject({
      saleId: 7,
      receiptNumber: 'R-00042',
      returnedCents: 45000,
      returnedLines: [{ name: 'Пальто', label: 'Синій · M', quantity: 1, amount_cents: 45000 }],
      refund: { items: [{ sale_item_id: 1, quantity: 1 }], method: 'card', reason_code: 'size', reason: null },
    });
    expect(draft.refund.client_uuid).toMatch(/^[0-9a-f-]{36}$/);
  });
});
