import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useSession() {
  const { data: session, isLoading, isError, refetch } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.getCurrentSession(),
    refetchInterval: 5000,
    retry: 1,                  // не ретраїти нескінченно при помилці
    staleTime: 0,
  });

  const startMutation = useMutation({
    mutationFn: () => api.startSession(),
    onSuccess: () => refetch(),
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopSession(),
    onSuccess: () => refetch(),
  });

  return {
    session,
    isLoading: isLoading && !isError,  // після помилки — не застрягати в loading
    isError,
    isActive: session?.status === 'running',
    start: startMutation.mutate,
    stop: stopMutation.mutate,
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
  };
}
