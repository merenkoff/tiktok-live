// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { verticalTitle } from '../lib/vertical';
import { superApi, superErrorText, type SuperStoreRow } from './superApi';
import { STORE_CODE_RE, suggestStoreCode } from './storeCode';

const MIN_PASSWORD = 10;

/**
 * «Новий магазин» (TechDocs/POS_ONBOARDING.md, O1): a real store for a new
 * client, its owner and — from a template — the configuration of a store that
 * already works (vertical, modules, module remotes). The password is typed
 * here by the super admin, sent once and never shown back.
 */
export function NewStoreDialog({
  stores,
  onClose,
  onCreated,
}: {
  stores: SuperStoreRow[];
  onClose: () => void;
  onCreated: (store: SuperStoreRow, ownerLogin: string) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const effectiveCode = codeTouched ? code : suggestStoreCode(name);
  const codeOk = STORE_CODE_RE.test(effectiveCode);
  const ready = name.trim() !== '' && codeOk && login.trim().length >= 3 && password.length >= MIN_PASSWORD;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await superApi.createStore({
        name: name.trim(),
        slug: effectiveCode,
        template_store_id: templateId ? Number(templateId) : null,
        owner_login: login.trim(),
        owner_password: password,
        owner_name: ownerName.trim() || undefined,
      });
      onCreated(created, login.trim());
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={() => !busy && onClose()}>
      <form
        role="dialog"
        aria-label="Новий магазин"
        className="mt-10 w-full max-w-lg space-y-4 rounded-sq bg-sq-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        noValidate
      >
        <div>
          <h2 className="text-lg font-semibold text-sq-text">Новий магазин</h2>
          <p className="mt-1 text-sm text-sq-secondary">
            Для нового клієнта: магазин і його власник. З шаблону береться лише налаштування — тип, модулі, remote-модулі;
            каталог, персонал, ПРРО й QR-меню в нього будуть свої.
          </p>
        </div>

        <Field label="Назва">
          <input aria-label="Назва" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={INPUT} />
        </Field>
        <Field
          label="Код магазину"
          hint={
            effectiveCode && !codeOk
              ? 'Латинські малі літери, цифри й дефіс, від 3 символів, на початку літера чи цифра.'
              : 'Його вводять на касі разом із PIN. Підказка з назви — можна змінити.'
          }
          invalid={Boolean(effectiveCode) && !codeOk}
        >
          <input
            aria-label="Код магазину"
            value={effectiveCode}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(e.target.value.toLowerCase());
            }}
            maxLength={41}
            spellCheck={false}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="Шаблон">
          <select aria-label="Шаблон" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={INPUT}>
            <option value="">Без шаблону (одяг, модулі за замовчуванням)</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.slug} · {verticalTitle(s.vertical)}
                {'tables' in s.module_remotes ? ' · столи' : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ім’я власника" hint="Необов’язково, за замовчуванням «Власник».">
            <input aria-label="Ім’я власника" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={80} className={INPUT} />
          </Field>
          <Field label="Логін власника" hint="Email або слово без пробілів.">
            <input
              aria-label="Логін власника"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              className={INPUT}
            />
          </Field>
        </div>
        <Field
          label="Пароль власника"
          hint={`Щонайменше ${MIN_PASSWORD} символів. Передайте його власнику самі — тут він більше ніде не з’явиться.`}
          invalid={password.length > 0 && password.length < MIN_PASSWORD}
        >
          <div className="flex gap-2">
            <input
              aria-label="Пароль власника"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className={`${INPUT} flex-1`}
            />
            <button
              type="button"
              className="rounded-sq border border-sq-divider px-3 text-sm text-sq-secondary"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'Сховати' : 'Показати'}
            </button>
          </div>
        </Field>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-sq border border-sq-divider px-4 py-1.5 text-sm text-sq-secondary">
            Скасувати
          </button>
          <button type="submit" disabled={!ready || busy} className="sq-btn-primary px-4 py-1.5 text-sm disabled:opacity-50">
            {busy ? 'Створюю…' : 'Створити магазин'}
          </button>
        </div>
      </form>
    </div>
  );
}

const INPUT = 'w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text';

function Field({ label, hint, invalid, children }: { label: string; hint?: string; invalid?: boolean; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-sq-text">{label}</span>
      {children}
      {hint && <span className={`block text-xs ${invalid ? 'text-rose-600' : 'text-sq-secondary'}`}>{hint}</span>}
    </label>
  );
}
