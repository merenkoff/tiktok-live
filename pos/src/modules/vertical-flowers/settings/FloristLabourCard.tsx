// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What the shop charges for assembling a bouquet, on the owner's Settings page
 * (`pos_stores.florist_labour_bps`, migration 040 —
 * `TechDocs/POS_FLORIST_BENCH.md` §16).
 *
 * It used to live on the host's page and was shown to every shop, a clothing
 * store included, which is precisely the thing a vertical is supposed to own.
 * Now it arrives with the module, through `ModuleDescriptor.settings.Card`.
 *
 * Self-contained — own fetch, own save, own error line — like the host's
 * `FiscalSettingsCard`. Settings is one big form over `PATCH /store`, and
 * threading this field through it would put florist copy back in the host.
 *
 * Percent in the field, basis points on the wire: 12.5% has to be expressible
 * and money is never a float.
 */

import { useEffect, useState } from 'react';
import { Flower2 } from '@pos/platform/ui';
import { api, useAuthStore } from '@pos/platform';

/** «25», «12.5» → 2500, 1250. A comma is what a Ukrainian keyboard gives. */
function toBps(percent: string): number {
  return Math.round(Number(percent.replace(',', '.')) * 100) || 0;
}

export default function FloristLabourCard() {
  const [percent, setPercent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .getStore()
      .then((store) => {
        if (!live) return;
        setPercent(String((store.florist_labour_bps ?? 0) / 100));
        setLoaded(true);
      })
      .catch(() => {
        // Same rule as the dashboard panels: a card that cannot show the truth
        // draws nothing rather than an empty input the owner might type into.
        if (live) setError('Не вдалося завантажити налаштування');
      });
    return () => {
      live = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const store = await api.updateStore({ florist_labour_bps: toBps(percent) });
      setPercent(String((store.florist_labour_bps ?? 0) / 100));
      // Without this the bench keeps pricing at the old rate: it reads the
      // number from `auth.store.florist_labour_bps`, which rides with the
      // login so a cold-offline till can price a bouquet at all.
      await useAuthStore.getState().bootstrap();
      setMessage('Збережено');
    } catch (err) {
      // The server already answers in Ukrainian and names the limit.
      const sent = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(sent || 'Не вдалося зберегти');
    } finally {
      setSaving(false);
    }
  }

  if (error && !loaded) return null;

  return (
    <div
      className="bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm space-y-3"
      data-testid="florist-labour-card"
    >
      <p className="sq-section-label flex items-center gap-2">
        <Flower2 size={24} className="text-sq-blue" />
        Робота флориста
      </p>

      <label className="block">
        <span className="text-sm text-sq-secondary">Націнка за збирання, %</span>
        <input
          className="mt-1.5 w-full rounded-sq border border-sq-divider px-3 py-2.5"
          inputMode="decimal"
          value={percent}
          disabled={!loaded}
          onChange={(e) => setPercent(e.target.value.replace(/[^\d.,]/g, ''))}
          // The host renders this inside its own Settings form, whose Enter
          // would submit everything else instead of this card. Enter here means
          // this card.
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            void save();
          }}
          data-testid="florist-labour-input"
        />
        <span className="mt-1 block text-xs text-sq-muted">
          Скільки додається до вартості складників, коли касир збирає букет. Ціни стебел уже
          містять вашу націнку, тож тут — плата за саму роботу; у галузі це зазвичай близько
          25%. 0 — рахувати тільки складники. Каси підхоплять нову ставку після наступного
          входу.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !loaded}
          className="pos-btn-primary min-h-11 px-4 text-sm disabled:opacity-40"
          data-testid="florist-labour-save"
        >
          Зберегти
        </button>
        {message && <span className="text-sm text-sq-secondary">{message}</span>}
        {error && (
          <span className="text-sm text-red-600" data-testid="florist-labour-error">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
