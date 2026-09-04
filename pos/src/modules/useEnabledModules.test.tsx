// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../hooks/useAuth';
import { makeAuthResponse } from '../test/utils';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from './constants';
import { useEnabledModules } from './useEnabledModules';

function signIn(enabled_modules?: string[]) {
  useAuthStore.setState({
    auth: makeAuthResponse({ store: { enabled_modules } }),
    isAuthenticated: true,
  });
}

const resolve = () => [...renderHook(() => useEnabledModules()).result.current].sort();

describe('useEnabledModules', () => {
  it('falls back to core + defaults when nobody is signed in', () => {
    expect(resolve()).toEqual([...CORE_MODULE_IDS, ...DEFAULT_ENABLED_MODULE_IDS].sort());
  });

  it('falls back to core + defaults for an older cached auth without the field', () => {
    signIn(undefined);
    expect(resolve()).toEqual([...CORE_MODULE_IDS, ...DEFAULT_ENABLED_MODULE_IDS].sort());
  });

  it('unions the stored set with the core modules', () => {
    signIn(['returns']);
    expect(resolve()).toEqual([...CORE_MODULE_IDS, 'returns'].sort());
  });

  it('keeps the core modules even when the store has everything turned off', () => {
    signIn([]);
    expect(resolve()).toEqual([...CORE_MODULE_IDS].sort());
  });

  it('does not duplicate a core id the server echoed back', () => {
    signIn(['settings', 'returns']);
    expect(resolve()).toEqual([...CORE_MODULE_IDS, 'returns'].sort());
  });

  it('returns the same set object until the stored list changes', () => {
    signIn(['returns']);
    const { result, rerender } = renderHook(() => useEnabledModules());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
