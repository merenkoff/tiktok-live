// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-checkbox/pages/CheckboxAdminPage.tsx
//
// `/admin/fiscal` — owner-only by construction (`mount: 'admin'`, see the
// manifest). What lives HERE vs on the host's `FiscalSettingsCard`:
//
//   host card:  enabled / provider / default_tax_code / auto_open_shift,
//               and the offline-mode switch (same reasoning)
//   this page:  credentials (Checkbox-specific fields), "Перевірити
//               з'єднання", the list of documents the retry cron gave up on
//               (plus parked offline sessions), and the register lock
//
// The `enabled`/`provider` toggle is deliberately NOT editable here — see
// TechDocs/POS_FISCAL_PRRO.md "Тумблер живёт в хосте": if the only editor for
// "is fiscalisation on" lived inside this bundle, a store whose bundle failed
// to load would have no way to turn it off.

import { useCallback, useEffect, useState } from 'react';
import {
  forceHandover,
  getFiscalSettingsView,
  listFiscalAttention,
  saveFiscalSecrets,
  testFiscalConnection,
} from '../../fiscal-core/data/fiscalApi';
import { SecretsForm } from '../../fiscal-core/components/SecretsForm';
import { FiscalErrorCard } from '../../fiscal-core/components/FiscalErrorCard';
import { useFiscalStatus } from '../../fiscal-core/hooks/useFiscalStatus';
import { CHECKBOX_SECRET_SPECS } from '../secretSpecs';
import type {
  AttentionDoc,
  FiscalProbe,
  FiscalStatus,
  OfflineSessionView,
} from '../../fiscal-core/types';
import type { FiscalSettingsView } from '../../../types';

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2) + ' ₴';
}

function AttentionList() {
  const [docs, setDocs] = useState<AttentionDoc[] | null>(null);
  const [sessions, setSessions] = useState<OfflineSessionView[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    listFiscalAttention()
      .then((res) => {
        setDocs(res.documents);
        // Phase 2 added parked offline sessions to the same response. Their
        // documents may never have been sent at all, so they belong at the TOP
        // of this list: a stuck session is a bigger hole than one rejected
        // receipt, and only the owner can settle it with the provider.
        setSessions(res.sessions ?? []);
      })
      .catch(setError);
  }, []);

  if (error) return <FiscalErrorCard error={error} />;
  if (!docs) return <p className="text-sm text-sq-secondary">Завантаження…</p>;
  if (docs.length === 0 && sessions.length === 0) {
    return <p className="text-sm text-sq-secondary">Немає документів, що потребують уваги.</p>;
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <div
          key={`session-${session.id}`}
          role="alert"
          className="rounded-sq bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <p className="font-semibold">Офлайн-сесія #{session.id} зупинена</p>
          <p className="mt-1">{session.error_message ?? session.error_code ?? 'Причина невідома'}</p>
          <p className="mt-0.5 text-xs">
            Чеків: {session.documents.pending + session.documents.done + session.documents.abandoned}
            {' · не надіслано: '}
            {session.documents.pending} · з {new Date(session.started_at).toLocaleString('uk-UA')}
          </p>
          <p className="mt-1 text-xs">
            Ці чеки треба звірити в кабінеті провайдера — автоматично вони вже не підуть.
          </p>
        </div>
      ))}

      {docs.length > 0 && (
        <ul className="divide-y divide-sq-divider rounded-sq border border-sq-divider">
          {docs.map((doc) => (
            <li key={doc.id} className="p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{doc.receipt_number ?? `#${doc.id}`}</span>
                <span>{formatCents(doc.total_cents)}</span>
              </div>
              <p className="mt-1 text-xs text-red-600">
                {doc.error_message ?? doc.error_code ?? 'Помилка ПРРО'}
              </p>
              <p className="mt-0.5 text-xs text-sq-muted">
                Спроб: {doc.attempts} · {new Date(doc.created_at).toLocaleString('uk-UA')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The owner's view of the register lock, and the only way out of a dead holder:
 * a till whose machine broke cannot confirm a handover, so nothing short of
 * this would free the register.
 *
 * The cost is real and is stated on the button: the ousted till's open session
 * is parked as `stuck` and its leased codes are burned, so receipts it already
 * printed may never reach the tax office automatically. That is why this is not
 * offered while the normal handover is still possible.
 */
function RegisterCard({ status, onChanged }: { status: FiscalStatus; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!status.offline?.enabled) return null;

  const holder = status.holder;
  const request = holder?.handover_request ?? null;

  async function force() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await forceHandover();
      setNote(
        `Касу передано. Зупинено сесій: ${res.stuck_sessions}, згорілих кодів: ${res.burned_codes}.`
      );
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <p className="sq-section-label">Каса ПРРО</p>
      {holder ? (
        <p className="text-sm text-sq-secondary">
          Зайнята: «{holder.name?.trim() || `пристрій ${holder.device_id.slice(0, 8)}`}»
          {holder.since && ` з ${new Date(holder.since).toLocaleString('uk-UA')}`}
          {holder.stale && ' · немає звʼязку'}
        </p>
      ) : (
        <p className="text-sm text-sq-secondary">Вільна</p>
      )}

      {request ? (
        <>
          <p className="text-sm">
            Запит на передачу: «{request.name?.trim() || `пристрій ${request.device_id.slice(0, 8)}`}»
          </p>
          <button
            type="button"
            className="rounded-sq border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700"
            disabled={busy}
            onClick={() => void force()}
          >
            Забрати касу примусово
          </button>
          <p className="text-xs text-sq-muted">
            Тільки якщо попередня каса не може підтвердити передачу сама: її незавершена
            офлайн-сесія зупиниться, а видані їй коди згорять.
          </p>
        </>
      ) : (
        holder && (
          <p className="text-xs text-sq-muted">
            Щоб передати касу, надішліть запит із тієї каси, якій вона потрібна.
          </p>
        )
      )}

      {note && <p className="text-sm text-sq-secondary">{note}</p>}
      {Boolean(error) && <FiscalErrorCard error={error} />}
    </section>
  );
}

export function CheckboxAdminPage() {
  // Polled: the owner opens this page precisely when a till is waiting on a
  // handover, and a stale holder block is what makes them force one they did
  // not have to.
  const { status: fiscalStatus, refresh: refreshStatus } = useFiscalStatus();
  const [settings, setSettings] = useState<FiscalSettingsView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [probe, setProbe] = useState<FiscalProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<unknown>(null);

  const load = useCallback(() => {
    getFiscalSettingsView().then(setSettings).catch(setLoadError);
  }, []);

  useEffect(load, [load]);

  async function saveSecrets(values: Record<string, string | null>) {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveFiscalSecrets(values);
      setSettings(saved);
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  }

  async function runProbe() {
    setProbing(true);
    setProbeError(null);
    setProbe(null);
    try {
      setProbe(await testFiscalConnection());
    } catch (e) {
      setProbeError(e);
    } finally {
      setProbing(false);
    }
  }

  return (
    <div className="p-5 space-y-6 max-w-lg">
      <h1 className="text-lg font-semibold">Фіскалізація — Checkbox</h1>

      {Boolean(loadError) && <FiscalErrorCard error={loadError} />}

      {settings && (
        <>
          <section className="space-y-2">
            <p className="sq-section-label">Дані доступу</p>
            <SecretsForm
              specs={CHECKBOX_SECRET_SPECS}
              secretsSet={settings.secrets_set}
              saving={saving}
              onSave={(values) => void saveSecrets(values)}
            />
            {Boolean(saveError) && <FiscalErrorCard error={saveError} />}
          </section>

          <section className="space-y-2">
            <p className="sq-section-label">Зʼєднання</p>
            <button
              type="button"
              className="rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium"
              disabled={probing}
              onClick={() => void runProbe()}
            >
              {probing ? 'Перевірка…' : "Перевірити з'єднання"}
            </button>
            {Boolean(probeError) && <FiscalErrorCard error={probeError} />}
            {probe && (
              <div
                className={`rounded-sq px-3 py-2 text-sm ${
                  probe.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-900'
                }`}
              >
                {probe.ok ? (
                  <>
                    <p className="font-semibold">З'єднання успішне</p>
                    {probe.cashierName && <p>Касир: {probe.cashierName}</p>}
                    {probe.cashRegister && <p>Каса: {probe.cashRegister}</p>}
                  </>
                ) : (
                  <p>{probe.message ?? 'Перевірка не пройдена'}</p>
                )}
              </div>
            )}
          </section>

          {fiscalStatus && (
            <RegisterCard status={fiscalStatus} onChanged={() => void refreshStatus()} />
          )}

          <section className="space-y-2">
            <p className="sq-section-label">Потребують уваги</p>
            <AttentionList />
          </section>
        </>
      )}
    </div>
  );
}
