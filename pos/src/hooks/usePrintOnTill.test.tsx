// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The phone's line about the paper (TechDocs/POS_PHONE_TILL.md Т2): printing,
// printed, the computer silent or switched off — and nothing at all in a store
// with no computer, on an older server or after an error.

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@pos/platform';
import { usePrintOnTill, type TillPrintTiming } from './usePrintOnTill';
import type { ReceiptPrintStatus } from '../types';

const FAST: TillPrintTiming = { intervalMs: 10, quietAfterMs: 40, stopAfterMs: 80 };
const QUEUED: ReceiptPrintStatus = {
  requested_at: '2026-11-23T10:00:00.000Z',
  printed_at: null,
  expires_at: '2026-11-23T10:10:00.000Z',
  till: 'online',
};

afterEach(() => vi.restoreAllMocks());

describe('usePrintOnTill', () => {
  it('says the computer is printing, then that it printed', async () => {
    const status = vi
      .spyOn(api, 'receiptPrintStatus')
      .mockResolvedValueOnce(QUEUED)
      .mockResolvedValue({ ...QUEUED, printed_at: '2026-11-23T10:00:04.000Z' });
    const { result } = renderHook(() => usePrintOnTill([7], FAST));
    expect(result.current.state).toBe('waiting');
    await waitFor(() => expect(result.current.state).toBe('printed'));
    expect(status).toHaveBeenCalledWith(7);
  });

  it('says the computer did not print it, then prints again on a tap', async () => {
    vi.spyOn(api, 'receiptPrintStatus').mockResolvedValue(QUEUED);
    const again = vi.spyOn(api, 'requestReceiptPrint').mockResolvedValue(QUEUED);
    const { result } = renderHook(() => usePrintOnTill([7, 8], FAST));
    await waitFor(() => expect(result.current.state).toBe('silent'));
    await act(async () => result.current.again());
    expect(again).toHaveBeenCalledWith(7);
    expect(again).toHaveBeenCalledWith(8);
    await waitFor(() => expect(result.current.state).toBe('silent'));
  });

  it('says at once that the computer is off', async () => {
    vi.spyOn(api, 'receiptPrintStatus').mockResolvedValue({ ...QUEUED, till: 'offline' });
    const { result } = renderHook(() => usePrintOnTill([7], FAST));
    await waitFor(() => expect(result.current.state).toBe('offline'));
  });

  it.each([
    ['no computer ever asked', { ...QUEUED, till: 'none' as const }],
    ['an older server', { requested_at: null, printed_at: null, expires_at: null }],
  ])('says nothing when %s', async (_name, answer) => {
    vi.spyOn(api, 'receiptPrintStatus').mockResolvedValue(answer);
    const { result } = renderHook(() => usePrintOnTill([7], FAST));
    await waitFor(() => expect(result.current.state).toBe('idle'));
  });

  it('says nothing after an error, and nothing on the computer itself', async () => {
    vi.spyOn(api, 'receiptPrintStatus').mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePrintOnTill([7], FAST));
    await waitFor(() => expect(result.current.state).toBe('idle'));
    const desk = renderHook(() => usePrintOnTill(null, FAST));
    expect(desk.result.current.state).toBe('idle');
  });

  it('shows the server sentence when it will not print again', async () => {
    vi.spyOn(api, 'receiptPrintStatus').mockResolvedValue({ ...QUEUED, printed_at: QUEUED.requested_at });
    vi.spyOn(api, 'requestReceiptPrint').mockRejectedValue({
      response: { data: { error: 'За цим чеком було повернення — його чек уже не такий, як на папері' } },
    });
    const { result } = renderHook(() => usePrintOnTill([7], FAST));
    await waitFor(() => expect(result.current.state).toBe('printed'));
    await act(async () => result.current.again());
    expect(result.current.state).toBe('refused');
    expect(result.current.refusal).toMatch(/повернення/);
  });
});
