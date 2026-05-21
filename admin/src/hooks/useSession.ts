import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useSession() {
  const { data: session, isLoading, refetch } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.getCurrentSession(),
    refetchInterval: 5000,
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
    isLoading,
    isActive: session?.status === 'running',
    start: startMutation.mutate,
    stop: stopMutation.mutate,
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
  };
}