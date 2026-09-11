// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/components/HolderPanel.tsx
//
// Who holds the ПРРО register, and the handover between two tills
// (TechDocs/POS_FISCAL_OFFLINE.md §3а).
//
// Two rules shape this screen:
//
//  1. The lock only exists while offline mode is on. With it off, several
//     online tills on one register are fine — the provider orders their
//     transactions itself — so this renders nothing at all.
//  2. Only the desktop cashier can act. The web shell sends no
//     `X-POS-Device-ID`, so `claim`/`release`/`handover` answer it 400
//     `device_id_required` and it can never BE the holder. It therefore gets
//     the same information with no buttons, rather than buttons that always
//     fail. The owner's escape hatch — forcing a handover — is deliberately on
//     `/admin/fiscal` instead, and is the one call that needs no device id.

import { useState } from 'react';
import { usePosShell, useOfflineStatus } from '@pos/platform';
import {
  claimRegister,
  confirmHandover,
  releaseRegister,
  requestHandover,
} from '../data/fiscalApi';
import { FiscalErrorCard } from './FiscalErrorCard';
import type { FiscalStatus } from '../types';

function since(iso: string | null): string {
  if (!iso) return '';
  return ` з ${new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
}

/** A till a cashier can recognise: the name it registered, or a short id. */
function deviceName(name: string | null, deviceId: string): string {
  return name?.trim() || `пристрій ${deviceId.slice(0, 8)}`;
}

export interface HolderPanelProps {
  status: FiscalStatus;
  /** Re-poll the status: every action here changes it. */
  onChanged: () => void;
}

export function HolderPanel({ status, onChanged }: HolderPanelProps) {
  const shell = usePosShell();
  // The till's own queue of unsent sales. The backend refuses a handover while
  // it is non-empty — those receipts would otherwise be registered by a device
  // that no longer holds the register — and it trusts the till for the count,
  // because only the till can see its own IndexedDB.
  const outboxPending = useOfflineStatus((s) => s.pending);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!status.offline?.enabled) return null;

  const holder = status.holder;
  const canAct = shell === 'cashier';

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      setNote(await action());
      onChanged();
    } catch (e) {
      setError(e);
      // The rejection carries the current holder too, so a refresh is what
      // turns "already taken" into the right screen.
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const claim = () =>
    run(async () => {
      await claimRegister();
      return null;
    });

  const release = () =>
    run(async () => {
      await releaseRegister();
      return null;
    });

  const ask = () =>
    run(async () => {
      const res = await requestHandover();
      return res.status === 'claimed'
        ? 'Касу зайнято — вона була вільна'
        : 'Запит надіслано. Підтвердіть його на іншій касі';
    });

  const confirm = () =>
    run(async () => {
      await confirmHandover(outboxPending);
      return 'Касу передано';
    });

  return (
    <div className="rounded-sq bg-sq-surface border border-sq-divider p-4 space-y-3">
      <p className="sq-section-label">Каса ПРРО</p>

      {!holder && (
        <>
          <p className="text-sm text-sq-secondary">Вільна</p>
          {canAct ? (
            <button
              type="button"
              className="pos-btn-primary px-4 py-2"
              disabled={busy}
              onClick={() => void claim()}
            >
              Зайняти касу
            </button>
          ) : (
            <p className="text-xs text-sq-muted">
              Касу займе перший пристрій, який проведе продаж.
            </p>
          )}
        </>
      )}

      {holder?.is_me && (
        <>
          <p className="text-sm font-semibold text-emerald-600">Ця каса{since(holder.since)}</p>
          {holder.handover_request && (
            <div className="rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">
                «{deviceName(holder.handover_request.name, holder.handover_request.device_id)}»
                просить передати касу
              </p>
              {outboxPending > 0 && (
                <p className="mt-1">Спершу синхронізуйте чеки, що очікують: {outboxPending}.</p>
              )}
              <button
                type="button"
                className="pos-btn-primary mt-2 px-4 py-2"
                disabled={busy}
                onClick={() => void confirm()}
              >
                Передати касу
              </button>
            </div>
          )}
          <button
            type="button"
            className="rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium"
            disabled={busy}
            onClick={() => void release()}
          >
            Звільнити касу
          </button>
        </>
      )}

      {holder && !holder.is_me && (
        <>
          <p className="text-sm text-sq-secondary">
            Зайнята: «{deviceName(holder.name, holder.device_id)}»{since(holder.since)}
          </p>
          {holder.stale && (
            <p className="text-xs text-amber-700">
              Немає зв’язку з тим пристроєм. Якщо він не повернеться, власник може забрати касу
              примусово в налаштуваннях ПРРО.
            </p>
          )}
          {canAct && (
            <button
              type="button"
              className="rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium"
              disabled={busy}
              onClick={() => void ask()}
            >
              Запросити передачу
            </button>
          )}
        </>
      )}

      {note && <p className="text-sm text-sq-secondary">{note}</p>}
      {Boolean(error) && <FiscalErrorCard error={error} />}
    </div>
  );
}
