// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The journal is mounted twice, and each frame brings its own page: the till's
// content area scrolls itself and wants the page's background and gutters, the
// owner's cabinet already pads its `<main>`.

import type { ReactNode } from 'react';

export type DebtsFrame = 'till' | 'admin';

export function Frame({ frame, children }: { frame: DebtsFrame; children: ReactNode }) {
  if (frame === 'admin') return <div className="max-w-4xl text-sq-text">{children}</div>;
  return (
    <div className="flex-1 min-h-0 overflow-auto bg-sq-bg text-sq-text">
      <div className="mx-auto max-w-3xl px-4 md:px-7 py-5 pb-10">{children}</div>
    </div>
  );
}
