// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/components/ProbeSection.tsx
//
// «Перевірити з'єднання» — `POST /fiscal/test-connection`, the same button
// on every bundle's `/admin/fiscal`. For an enabled store the backend also
// refreshes the cached requisites on this call, which is why a bundle may
// want to run it after a save (`onProbed`).

import { useState } from 'react';
import { SectionHead } from '@pos/platform/ui';
import { testFiscalConnection } from '../data/fiscalApi';
import { FiscalErrorCard } from './FiscalErrorCard';
import type { FiscalProbe } from '../types';

export function ProbeSection({ onProbed }: { onProbed?: (probe: FiscalProbe) => void } = {}) {
  const [probe, setProbe] = useState<FiscalProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<unknown>(null);

  async function runProbe() {
    setProbing(true);
    setProbeError(null);
    setProbe(null);
    try {
      const result = await testFiscalConnection();
      setProbe(result);
      onProbed?.(result);
    } catch (e) {
      setProbeError(e);
    } finally {
      setProbing(false);
    }
  }

  return (
    <section>
      <SectionHead title="Зʼєднання" />
      <div className="pt-4 space-y-3">
        <button type="button" className="sq-btn-quiet" disabled={probing} onClick={() => void runProbe()}>
          {probing ? 'Перевірка…' : "Перевірити з'єднання"}
        </button>
        {Boolean(probeError) && <FiscalErrorCard error={probeError} />}
        {probe && (
          <div
            className={`rounded-xl px-4 py-3 text-[15px] ${
              probe.ok ? 'bg-sq-success/10 text-sq-success-ink' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {probe.ok ? (
              <>
                <p className="font-semibold">З'єднання успішне</p>
                {probe.cashierName && <p>Касир: {probe.cashierName}</p>}
                {probe.cashRegister && <p>Каса: {probe.cashRegister}</p>}
                {/* Cashalot answers with the licence term here; Checkbox says nothing. */}
                {probe.message && <p>{probe.message}</p>}
              </>
            ) : (
              <p>{probe.message ?? 'Перевірка не пройдена'}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
