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
import { Check, PageHeader, SectionHead, ShieldCheck } from '@pos/platform/ui';
import {
  forceHandover,
  getFiscalSettingsView,
  listFiscalAttention,
  saveFiscalSecrets,
  testFiscalConnection,
} from '../../fiscal-core/data/fiscalApi';
import { SecretsForm } from '../../fiscal-core/components/SecretsForm';
import { FiscalErrorCard } from '../../fiscal-core/components/FiscalErrorCard';
import { deviceLabel } from '../../fiscal-core/lib/deviceLabel';
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
  if (!docs) return <p className="py-3 text-[15px] text-sq-muted">Завантаження…</p>;
  if (docs.length === 0 && sessions.length === 0) {
    return (
      <p className="py-3 flex items-center gap-2 text-[15px] text-sq-secondary">
        <Check size={20} className="shrink-0 text-sq-success" />
        Немає документів, що потребують уваги.
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      {sessions.map((session) => (
        <div
          key={`session-${session.id}`}
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700"
        >
          <p className="font-semibold">Офлайн-сесія #{session.id} зупинена</p>
          <p className="mt-1">{session.error_message ?? session.error_code ?? 'Причина невідома'}</p>
          <p className="mt-1 text-[13px] tabular-nums">
            Чеків: {session.documents.pending + session.documents.done + session.documents.abandoned}
            {' · не надіслано: '}
            {session.documents.pending} · з {new Date(session.started_at).toLocaleString('uk-UA')}
          </p>
          <p className="mt-1 text-[13px]">
            Ці чеки треба звірити в кабінеті провайдера — автоматично вони вже не підуть.
          </p>
        </div>
      ))}

      {docs.length > 0 && (
        <ul>
          {docs.map((doc) => (
            <li key={doc.id} className="sq-row py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-base font-medium text-sq-text tabular-nums">
                  {doc.receipt_number ?? `#${doc.id}`}
                </span>
                <span className="text-[15px] text-sq-text tabular-nums">{formatCents(doc.total_cents)}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-red-600">
                {doc.error_message ?? doc.error_code ?? 'Помилка ПРРО'}
              </p>
              <p className="mt-0.5 text-[13px] text-sq-muted tabular-nums">
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
    <section>
      <SectionHead title="Каса ПРРО" />
      <div className="pt-3 space-y-3">
        {holder ? (
          // Same sentence the cashier's own screen shows, and the one the help
          // article quotes (/dovidka/zmina-prro-zamina-kasy) — the owner reading
          // support chat should see the words the cashier described.
          <p className="text-[15px] text-sq-text">
            Каса зайнята пристроєм {deviceLabel(holder.name, holder.device_id)}
            {holder.since && ` з ${new Date(holder.since).toLocaleString('uk-UA')}`}
            {holder.stale && ' · каса не відповідає, можливо продає офлайн'}
          </p>
        ) : (
          <p className="text-[15px] text-sq-secondary">Вільна</p>
        )}

        {request ? (
          <>
            <p className="text-[15px] font-semibold text-sq-text">
              Пристрій {deviceLabel(request.name, request.device_id)} просить передати касу
            </p>
            <button
              type="button"
              className="min-h-11 px-4 rounded-sq bg-red-50 text-[15px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              disabled={busy}
              onClick={() => void force()}
            >
              Забрати касу примусово
            </button>
            <p className="text-[13px] text-sq-muted">
              Тільки якщо попередня каса не може підтвердити передачу сама: її незавершена
              офлайн-сесія зупиниться, а видані їй коди згорять.
            </p>
          </>
        ) : (
          holder && (
            <p className="text-[13px] text-sq-muted">
              Щоб передати касу, надішліть запит із тієї каси, якій вона потрібна.
            </p>
          )
        )}

        {note && <p className="text-[15px] text-sq-secondary">{note}</p>}
        {Boolean(error) && <FiscalErrorCard error={error} />}
      </div>
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
    <div className="space-y-8 animate-fade-up max-w-2xl text-sq-text">
      <PageHeader glyph={ShieldCheck} title="Фіскалізація — Checkbox" />

      {Boolean(loadError) && <FiscalErrorCard error={loadError} />}

      {settings && (
        <>
          <section>
            <SectionHead title="Дані доступу" />
            <div className="pt-4 space-y-3">
              <SecretsForm
                specs={CHECKBOX_SECRET_SPECS}
                secretsSet={settings.secrets_set}
                saving={saving}
                onSave={(values) => void saveSecrets(values)}
              />
              {Boolean(saveError) && <FiscalErrorCard error={saveError} />}
            </div>
          </section>

          <section>
            <SectionHead title="Зʼєднання" />
            <div className="pt-4 space-y-3">
              <button
                type="button"
                className="sq-btn-quiet"
                disabled={probing}
                onClick={() => void runProbe()}
              >
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
                    </>
                  ) : (
                    <p>{probe.message ?? 'Перевірка не пройдена'}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {fiscalStatus && (
            <RegisterCard status={fiscalStatus} onChanged={() => void refreshStatus()} />
          )}

          <section>
            <SectionHead title="Потребують уваги" />
            <AttentionList />
          </section>
        </>
      )}
    </div>
  );
}
