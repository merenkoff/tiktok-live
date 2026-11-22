// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A long grid drawn a screenful at a time: the next screenful joins when the
// sentinel after the last tile comes near, a new folder or search starts from
// the top, and without IntersectionObserver everything is drawn as before.

import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProgressiveList } from './useProgressiveList';

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;

function stubObserver() {
  const callbacks: Callback[] = [];
  class FakeObserver {
    constructor(cb: Callback) {
      callbacks.push(cb);
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return () => act(() => callbacks[callbacks.length - 1]?.([{ isIntersecting: true }]));
}

const items = Array.from({ length: 150 }, (_, i) => i);

afterEach(() => vi.unstubAllGlobals());

describe('useProgressiveList', () => {
  it('draws a screenful, then the next one as the sentinel comes near', () => {
    const near = stubObserver();
    function Grid({ resetKey }: { resetKey: string }) {
      const list = useProgressiveList(items, resetKey);
      return (
        <div>
          <p data-testid="count">{list.visible.length}</p>
          {list.hasMore && <div ref={list.sentinelRef} data-testid="more" />}
        </div>
      );
    }
    const { rerender } = render(<Grid resetKey="root" />);
    const count = () => Number(screen.getByTestId('count').textContent);
    expect(count()).toBe(60);
    near();
    expect(count()).toBe(120);
    near();
    expect(count()).toBe(150);
    expect(screen.queryByTestId('more')).toBeNull();

    // Another folder: back to the first screenful.
    rerender(<Grid resetKey="folder:7" />);
    expect(count()).toBe(60);
  });

  it('draws everything where the webview has no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useProgressiveList(items, 'root'));
    expect(result.current.visible).toHaveLength(150);
    expect(result.current.hasMore).toBe(false);
  });
});
