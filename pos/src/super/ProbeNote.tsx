// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { PLATFORM_VERSION } from '@pos/platform';
import type { ProbeState } from './probe';

/** Same wording as the owner's Settings page, so an operator sees one language. */
export function ProbeNote({ probe }: { probe: ProbeState }) {
  if (probe.state === 'ok') {
    const needsNewer = probe.info.minHostPlatform > PLATFORM_VERSION;
    return (
      <span className={`text-xs ${needsNewer ? 'text-amber-700' : 'text-emerald-700'}`}>
        Підпис дійсний · {probe.info.moduleId} {probe.info.version}
        {needsNewer &&
          ` · потребує платформу ${probe.info.minHostPlatform}, тут ${PLATFORM_VERSION} — сайт і каси треба оновити`}
      </span>
    );
  }
  if (probe.state === 'error') return <span className="text-xs text-rose-600">{probe.message}</span>;
  if (probe.state === 'busy') return <span className="text-xs text-sq-secondary">Перевірка…</span>;
  return null;
}
