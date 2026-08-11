import { describe, expect, it } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useSession } from './useSession';
import { createTestQueryClient, mockSession } from '../test/utils';
import { server } from '../test/msw/server';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('useSession', () => {
  it('isActive only when status is running', async () => {
    server.use(
      http.get('/api/sessions/current', () => HttpResponse.json(mockSession))
    );
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.session).toEqual(mockSession));
    expect(result.current.isActive).toBe(true);
  });

  it('isActive false for stopped session', async () => {
    server.use(
      http.get('/api/sessions/current', () =>
        HttpResponse.json({ ...mockSession, status: 'stopped' })
      )
    );
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.session?.status).toBe('stopped'));
    expect(result.current.isActive).toBe(false);
  });

  it('does not stick in loading after error', async () => {
    server.use(
      http.get('/api/sessions/current', () =>
        HttpResponse.json({ error: 'fail' }, { status: 500 })
      )
    );
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 3000 }
    );
  });

  it('start triggers startSession and refetch', async () => {
    let calls = 0;
    server.use(
      http.get('/api/sessions/current', () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json(null);
        return HttpResponse.json(mockSession);
      }),
      http.post('/api/sessions/start', () => HttpResponse.json(mockSession))
    );

    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.start();
    });

    await waitFor(() => expect(result.current.isActive).toBe(true));
  });

  it('stop triggers stopSession', async () => {
    server.use(
      http.get('/api/sessions/current', () => HttpResponse.json(mockSession)),
      http.post('/api/sessions/stop', () =>
        HttpResponse.json({ success: true })
      )
    );

    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.isActive).toBe(true));

    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.isStopping).toBe(false));
  });
});
