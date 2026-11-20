// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { superApi, superErrorText, type SuperNoticePolicy, type SuperNoticeSettings } from './superApi';

/**
 * The notice a copy WITHOUT a valid licence key shows its users
 * (TechDocs/POS_LICENSING.md, phase 2G): the settings for every such copy.
 *
 * A copy counts, in its own database, how many times a client started against
 * it; past the threshold it shows the text to every user of the POS, in a strip
 * that cannot be closed. These are settings a copy picks up with its next ping
 * — a threshold, a text, whether guests read it too — and nothing else: none of
 * them can switch a copy off. One copy's own text and threshold are set in its
 * card below.
 */
export function LicenseNoticeSettings({ onSaved }: { onSaved?: (policy: SuperNoticePolicy) => void }) {
  const [settings, setSettings] = useState<SuperNoticeSettings | null>(null);
  const [warnAfter, setWarnAfter] = useState('');
  const [text, setText] = useState('');
  const [guests, setGuests] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    superApi
      .getLicenseNotice()
      .then((loaded) => {
        if (!alive) return;
        setSettings(loaded);
        setWarnAfter(String(loaded.policy.warn_after));
        setText(loaded.policy.text ?? '');
        setGuests(loaded.policy.guests);
      })
      // A server older than the notice has no such route: the block is simply not drawn.
      .catch(() => alive && setSettings(null));
    return () => {
      alive = false;
    };
  }, []);

  if (!settings) return null;

  const threshold = Number(warnAfter);
  const thresholdOk = warnAfter.trim() !== '' && Number.isInteger(threshold) && threshold >= 0;
  const tooLong = text.trim().length > settings.defaults.text_max;

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const policy = await superApi.setLicenseNotice({ warn_after: threshold, text: text.trim() || null, guests });
      setSettings({ ...settings, policy });
      setSaved(true);
      onSaved?.(policy);
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-sq border border-sq-divider bg-sq-surface p-4" data-testid="license-notice-settings">
      <div>
        <h2 className="text-sm font-semibold text-sq-text">Попередження копіям без ключа</h2>
        <p className="mt-1 text-xs text-sq-secondary">
          Копія без дійсного ключа сама рахує запуски клієнтів — вхід у касу чи відкриття застосунку. Після порога
          вона показує цей текст усім користувачам смугою, яку не можна закрити. Нічого не блокує і не вимикає; копія
          з дійсним ключем не рахує й не попереджає. Налаштування копія забирає з наступним пінгом.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-xs text-sq-secondary">
          Поріг запусків клієнтів
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={warnAfter}
            onChange={(e) => {
              setWarnAfter(e.target.value);
              setSaved(false);
            }}
            className="mt-1 block w-32 rounded-sq border border-sq-divider bg-sq-bg px-2 py-1.5 text-sm text-sq-text tabular-nums"
            aria-label="Поріг запусків клієнтів"
          />
        </label>
        <p className="pb-2 text-xs text-sq-secondary">
          {threshold === 0 && thresholdOk ? '0 — попередження вимкнено для всіх.' : 'Попередження з’являється після цього числа запусків. 0 вимикає.'}
        </p>
      </div>

      <label className="block text-xs text-sq-secondary">
        Текст попередження
        <textarea
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder={settings.defaults.text}
          className="mt-1 block w-full rounded-sq border border-sq-divider bg-sq-bg px-2 py-1.5 text-sm text-sq-text"
          aria-label="Текст попередження"
        />
        <span className={tooLong ? 'text-rose-600' : undefined}>
          {text.trim().length} / {settings.defaults.text_max} · порожнє поле — стандартний текст, який видно сірим
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-sq-text">
        <input
          type="checkbox"
          checked={guests}
          onChange={(e) => {
            setGuests(e.target.checked);
            setSaved(false);
          }}
          className="mt-0.5"
        />
        <span>
          Показувати й гостям у QR-меню — під кожною стравою
          <span className="block text-xs text-sq-secondary">
            Для ВСІХ копій без ключа. Наша ліцензія дозволяє малому бізнесу працювати без ключа, тож копія без ключа —
            ще не порушник; зазвичай це вмикають для однієї копії, у її картці.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || !thresholdOk || tooLong}
          onClick={() => void save()}
          className="sq-btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {saving ? 'Зберігаю…' : 'Зберегти'}
        </button>
        {saved && <span className="text-sm text-emerald-700">Збережено. Копії отримають це з наступним пінгом.</span>}
        {error && <span className="text-sm text-rose-600">{error}</span>}
      </div>
    </section>
  );
}
