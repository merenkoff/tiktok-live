// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { superApi, superErrorText, type SuperCopyNotice, type SuperNoticeSettings } from './superApi';
import { launchesLabel } from './licenseLabels';

type GuestsChoice = 'inherit' | 'yes' | 'no';

const guestsOf = (notice: SuperCopyNotice | null | undefined): GuestsChoice =>
  notice?.guests === true ? 'yes' : notice?.guests === false ? 'no' : 'inherit';

/**
 * One copy without a valid key: how close it is to its notice, and the notice
 * settings of its own (TechDocs/POS_LICENSING.md, phase 2G) — the text this
 * copy will read, its own threshold, and whether its guests read it too. An
 * empty field follows the settings for everyone; «Як для всіх» clears all
 * three. The copy picks the change up with its next ping, so the text can be
 * rewritten before the copy reaches its threshold.
 */
export function CopyNoticeEditor({
  instanceId,
  launches,
  notice,
  settings,
}: {
  instanceId: string;
  launches: number | null | undefined;
  notice: SuperCopyNotice | null | undefined;
  settings: SuperNoticeSettings;
}) {
  const [own, setOwn] = useState<SuperCopyNotice | null>(notice ?? null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(notice?.text ?? '');
  const [warnAfter, setWarnAfter] = useState(notice?.warn_after == null ? '' : String(notice.warn_after));
  const [guests, setGuests] = useState<GuestsChoice>(guestsOf(notice));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const effectiveThreshold = own?.warn_after ?? settings.policy.warn_after;
  const progress = launchesLabel(launches, effectiveThreshold);
  const threshold = warnAfter.trim() === '' ? null : Number(warnAfter);
  const thresholdOk = threshold === null || (Number.isInteger(threshold) && threshold >= 0);
  const tooLong = text.trim().length > settings.defaults.text_max;

  const write = async (next: SuperCopyNotice) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const stored = await superApi.setCopyNotice(instanceId, next);
      setOwn(stored);
      setText(stored?.text ?? '');
      setWarnAfter(stored?.warn_after == null ? '' : String(stored.warn_after));
      setGuests(guestsOf(stored));
      setSaved(true);
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 border-t border-sq-divider pt-2" data-testid={`copy-notice-${instanceId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-sq-secondary">
          {progress || 'запуски клієнтів копія ще не повідомляла'}
          {own && ' · свої налаштування попередження'}
        </span>
        <button type="button" className="text-xs text-sq-accent" onClick={() => setOpen((v) => !v)}>
          {open ? 'Згорнути' : 'Попередження для цієї копії'}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <label className="block text-xs text-sq-secondary">
            Текст для цієї копії
            <textarea
              rows={2}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSaved(false);
              }}
              placeholder={settings.policy.text ?? settings.defaults.text}
              className="mt-1 block w-full rounded-sq border border-sq-divider bg-sq-bg px-2 py-1.5 text-sm text-sq-text"
              aria-label="Текст для цієї копії"
            />
            <span className={tooLong ? 'text-rose-600' : undefined}>
              {text.trim().length} / {settings.defaults.text_max} · порожнє — як для всіх
            </span>
          </label>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs text-sq-secondary">
              Поріг для цієї копії
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={warnAfter}
                onChange={(e) => {
                  setWarnAfter(e.target.value);
                  setSaved(false);
                }}
                placeholder={String(settings.policy.warn_after)}
                className="mt-1 block w-28 rounded-sq border border-sq-divider bg-sq-bg px-2 py-1.5 text-sm text-sq-text tabular-nums"
                aria-label="Поріг для цієї копії"
              />
            </label>
            <label className="block text-xs text-sq-secondary">
              Гостям у QR-меню, під кожною стравою
              <select
                value={guests}
                onChange={(e) => {
                  setGuests(e.target.value as GuestsChoice);
                  setSaved(false);
                }}
                className="mt-1 block rounded-sq border border-sq-divider bg-sq-bg px-2 py-1.5 text-sm text-sq-text"
                aria-label="Показувати гостям"
              >
                <option value="inherit">як для всіх ({settings.policy.guests ? 'так' : 'ні'})</option>
                <option value="yes">так, показувати</option>
                <option value="no">ні</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving || !thresholdOk || tooLong}
              onClick={() =>
                void write({
                  warn_after: threshold,
                  text: text.trim() || null,
                  guests: guests === 'inherit' ? null : guests === 'yes',
                })
              }
              className="sq-btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {saving ? 'Зберігаю…' : 'Зберегти для копії'}
            </button>
            {own && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void write({ warn_after: null, text: null, guests: null })}
                className="rounded-sq border border-sq-divider px-3 py-1.5 text-sm text-sq-secondary"
              >
                Як для всіх
              </button>
            )}
            {saved && <span className="text-xs text-emerald-700">Збережено — копія отримає з наступним пінгом.</span>}
            {error && <span className="text-xs text-rose-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
