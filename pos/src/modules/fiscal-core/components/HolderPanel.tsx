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
import { Lock } from '@pos/platform/ui';
import {
  claimRegister,
  confirmHandover,
  releaseRegister,
  requestHandover,
} from '../data/fiscalApi';
import { FiscalErrorCard } from './FiscalErrorCard';
import { deviceLabel } from '../lib/deviceLabel';
import type { FiscalStatus } from '../types';

function since(iso: string | null): string {
  if (!iso) return '';
  return ` з ${new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
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
  // Off by default: a hardware swap must not cut the day into two Z-reports.
  // It is here for the cashier who is finishing for the day anyway.
  const [closeShift, setCloseShift] = useState(false);
  const [zReportText, setZReportText] = useState<string | null>(null);

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
      const res = await confirmHandover(outboxPending, closeShift);
      setZReportText(res.z_report_text ?? null);
      return closeShift ? 'Зміну закрито, касу передано' : 'Касу передано';
    });

  return (
    <section className="rounded-card bg-sq-surface shadow-card p-5 space-y-3">
      <div className="flex items-center gap-3 pb-1">
        <Lock size={24} className="shrink-0" />
        <h2 className="text-[17px] font-semibold text-sq-heading">Каса ПРРО</h2>
      </div>

      {!holder && (
        <>
          <p className="text-[15px] text-sq-secondary">Вільна</p>
          {canAct ? (
            <button
              type="button"
              className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]"
              disabled={busy}
              onClick={() => void claim()}
            >
              Зайняти касу
            </button>
          ) : (
            <p className="text-[13px] text-sq-muted">
              Касу займе перший пристрій, який проведе продаж.
            </p>
          )}
        </>
      )}

      {holder?.is_me && (
        <>
          <p className="text-[15px] font-semibold text-sq-success-ink">Ця каса{since(holder.since)}</p>
          {holder.handover_request && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800 space-y-2">
              <p className="font-semibold">
                Пристрій {deviceLabel(holder.handover_request.name, holder.handover_request.device_id)}{' '}
                просить передати касу
              </p>
              {outboxPending > 0 && (
                <p>Спершу синхронізуйте чеки, що очікують: {outboxPending}.</p>
              )}
              <label className="min-h-11 flex items-center gap-3 text-[15px]">
                <input
                  type="checkbox"
                  className="w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]"
                  checked={closeShift}
                  disabled={busy}
                  onChange={(e) => setCloseShift(e.target.checked)}
                />
                Закрити зміну (Z-звіт) перед передачею
              </label>
              <button
                type="button"
                className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]"
                disabled={busy}
                onClick={() => void confirm()}
              >
                Передати касу
              </button>
            </div>
          )}
          <button
            type="button"
            className="w-full min-h-[52px] rounded-xl bg-sq-surface px-4 ring-1 ring-inset ring-sq-divider text-[17px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-50"
            disabled={busy}
            onClick={() => void release()}
          >
            Звільнити касу
          </button>
        </>
      )}

      {holder && !holder.is_me && (
        <>
          <p className="text-[15px] text-sq-text">
            Каса зайнята пристроєм {deviceLabel(holder.name, holder.device_id)}
            {since(holder.since)}
          </p>
          {holder.stale && (
            <p className="text-[13px] text-amber-700">
              Каса не відповідає, можливо продає офлайн. Якщо вона не повернеться, власник може
              забрати касу примусово в налаштуваннях ПРРО.
            </p>
          )}
          {canAct && (
            <button
              type="button"
              className="w-full min-h-[52px] rounded-xl bg-sq-surface px-4 ring-1 ring-inset ring-sq-divider text-[17px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-50"
              disabled={busy}
              onClick={() => void ask()}
            >
              Запросити передачу
            </button>
          )}
        </>
      )}

      {note && <p className="text-[15px] text-sq-secondary">{note}</p>}
      {zReportText && (
        <div>
          <p className="text-[13px] font-semibold text-sq-secondary">Z-звіт</p>
          <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-sq-sidebar p-3 font-mono text-[13px] whitespace-pre-wrap">
            {zReportText}
          </pre>
        </div>
      )}
      {Boolean(error) && <FiscalErrorCard error={error} />}
    </section>
  );
}
